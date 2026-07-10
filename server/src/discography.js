import * as cache from './cache.js';
import {
  dedupeReleases,
  mergeArtistReleases,
  normalizeLabelReleases,
  mergeLabelReleases,
  categorizeFormat,
} from './dedupe.js';
import {
  getArtistProfile,
  getArtistReleasesPage,
  getLabelProfile,
  getLabelReleasesPage,
  getReleaseVideos,
  getMarketplaceStats,
} from './discogs.js';

// Tracks whether a background resolution worker is currently running for an
// entity (artist or label). Workers only resolve the requested scope (Main
// releases by default, for artists) to avoid burning the shared Discogs rate
// limit on remixes/compilations nobody asked to see — toggling "include all"
// starts a further pass once the current one finishes. Progress is always
// computed live from the releases themselves (see getJobForFilter), so
// displayed numbers stay correct regardless of which scope is being worked.
const runningWorkers = new Set();

// Tracks whether a background *pagination* worker is fetching further pages
// of an entity's release list. Some artists/labels have 9,000+ releases
// across 90+ pages — fetching all of it before responding at all would mean
// a multi-minute hang, so we load page 1 synchronously and page the rest
// here while the (already-usable) partial list is returned immediately.
const listWorkers = new Set();

// Tracks a background pass fetching marketplace prices — a separate, lowest-
// priority worker so price lookups (a nice-to-have) never compete with video
// resolution (what actually makes a release playable) for the same budget.
const priceWorkers = new Set();

function workerKey(type, id) {
  return `${type}:${id}`;
}

function startResolutionWorker(type, id, includeAll) {
  const wKey = workerKey(type, id);
  if (runningWorkers.has(wKey)) return;

  const entity = cache.getEntity(type, id);
  const targets = entity.releases.filter(
    (r) => (includeAll || type === 'label' || r.role === 'Main') && !r.resolved
  );
  if (targets.length === 0) return;

  runningWorkers.add(wKey);

  (async () => {
    for (const release of targets) {
      try {
        const { videos, formatText } = await getReleaseVideos(release.id);
        release.videos = videos;
        // The artist-releases listing often has no format at all for
        // master-collapsed entries; upgrade with the real thing now that
        // we've fetched it anyway, if we didn't already have one.
        if (formatText && (!release.format || release.category === 'Other')) {
          release.format = release.format || formatText;
          release.category = categorizeFormat(formatText);
        }
      } catch (err) {
        console.error(`Failed to resolve release ${release.id}:`, err.message);
        release.videos = [];
      } finally {
        release.resolved = true;
        cache.setEntity(type, id, entity);
      }
    }
    runningWorkers.delete(wKey);
  })();
}

function startPriceWorker(type, id, includeAll) {
  const wKey = workerKey(type, id);
  if (priceWorkers.has(wKey)) return;

  const entity = cache.getEntity(type, id);
  const targets = entity.releases.filter(
    (r) => (includeAll || type === 'label' || r.role === 'Main') && !r.priceResolved
  );
  if (targets.length === 0) return;

  priceWorkers.add(wKey);

  (async () => {
    for (const release of targets) {
      try {
        const stats = await getMarketplaceStats(release.id);
        release.lowestPrice = stats.lowestPrice;
        release.numForSale = stats.numForSale;
      } catch (err) {
        console.error(`Failed to fetch price for release ${release.id}:`, err.message);
        release.lowestPrice = null;
        release.numForSale = null;
      } finally {
        release.priceResolved = true;
        cache.setEntity(type, id, entity);
      }
    }
    priceWorkers.delete(wKey);
  })();
}

function startListWorker(type, id) {
  const wKey = workerKey(type, id);
  if (listWorkers.has(wKey)) return;

  const entity = cache.getEntity(type, id);
  if (!entity || entity.listComplete) return;

  listWorkers.add(wKey);

  (async () => {
    let current = cache.getEntity(type, id);
    while (current && !current.listComplete) {
      try {
        const data =
          type === 'label'
            ? await getLabelReleasesPage(id, current.nextPage)
            : await getArtistReleasesPage(id, current.nextPage);

        const rawBatch = data.releases || [];
        current.releases =
          type === 'label'
            ? mergeLabelReleases(current.releases, rawBatch)
            : mergeArtistReleases(current.releases, rawBatch);

        const totalPages = data.pagination?.pages || current.nextPage;
        current.nextPage += 1;
        current.listComplete = current.nextPage > totalPages;
        cache.setEntity(type, id, current);
      } catch (err) {
        console.error(`Failed to fetch page for ${type} ${id}:`, err.message);
        break; // stop here; listComplete stays false so it can resume later
      }
      current = cache.getEntity(type, id);
    }
    listWorkers.delete(wKey);
  })();
}

export async function ensureEntityLoaded(type, id, includeAll) {
  let entity = cache.getEntity(type, id);

  if (!entity) {
    if (type === 'label') {
      const profile = await getLabelProfile(id);
      const page1 = await getLabelReleasesPage(id, 1);
      entity = {
        id: profile.id,
        type: 'label',
        name: profile.name,
        thumb: profile.thumb,
        fetchedAt: Date.now(),
        releases: normalizeLabelReleases(page1.releases || []),
        nextPage: 2,
        listComplete: (page1.pagination?.pages || 1) <= 1,
      };
    } else {
      const profile = await getArtistProfile(id);
      const page1 = await getArtistReleasesPage(id, 1);
      entity = {
        id: profile.id,
        type: 'artist',
        name: profile.name,
        thumb: profile.thumb,
        fetchedAt: Date.now(),
        releases: dedupeReleases(page1.releases || []),
        nextPage: 2,
        listComplete: (page1.pagination?.pages || 1) <= 1,
      };
    }
    cache.setEntity(type, id, entity);
  }

  if (!entity.listComplete) startListWorker(type, id);
  startResolutionWorker(type, id, includeAll);
  startPriceWorker(type, id, includeAll);
  return entity;
}

export function getJobForFilter(type, id, includeAll) {
  const entity = cache.getEntity(type, id);
  if (!entity) return { status: 'done', total: 0, resolved: 0, listComplete: true };

  const filtered = entity.releases.filter(
    (r) => includeAll || type === 'label' || r.role === 'Main'
  );
  const resolved = filtered.filter((r) => r.resolved).length;
  const total = filtered.length;

  return {
    status: resolved === total && entity.listComplete ? 'done' : 'resolving',
    total,
    resolved,
    listComplete: entity.listComplete,
  };
}

export function refreshEntity(type, id) {
  cache.clearEntity(type, id);
  runningWorkers.delete(workerKey(type, id));
  listWorkers.delete(workerKey(type, id));
  priceWorkers.delete(workerKey(type, id));
}

// Resolves one release's videos immediately, at top priority — used when a
// user clicks a release that the background walker hasn't reached yet, so
// playback isn't gated on however far through the discography it's gotten.
export async function resolveReleaseNow(type, id, releaseId) {
  const entity = cache.getEntity(type, id);
  if (!entity) throw new Error('Entity not loaded yet');

  const release = entity.releases.find((r) => r.id === releaseId);
  if (!release) throw new Error('Release not found');

  if (!release.resolved) {
    try {
      const { videos, formatText } = await getReleaseVideos(releaseId, 'search');
      release.videos = videos;
      if (formatText && (!release.format || release.category === 'Other')) {
        release.format = release.format || formatText;
        release.category = categorizeFormat(formatText);
      }
    } catch (err) {
      console.error(`On-demand resolve failed for release ${releaseId}:`, err.message);
      release.videos = [];
    }
    release.resolved = true;
    cache.setEntity(type, id, entity);
  }

  return release;
}
