// Discogs' /artists/{id}/releases endpoint mixes "master" entries (an album,
// representing all its pressings) with standalone "release" entries. We key
// on master id when present so a prolific artist's 30 repressings of one LP
// collapse into a single discography entry instead of 30 duplicates.
function artistReleaseKeyInfo(r) {
  const isMaster = r.type === 'master';
  const releaseId = isMaster ? r.main_release : r.id;
  if (!releaseId) return null;
  const masterId = isMaster ? r.id : null;
  return { key: masterId != null ? `m${masterId}` : `r${releaseId}`, releaseId, masterId };
}

function normalizeArtistRelease(r, releaseId, masterId) {
  return {
    id: releaseId,
    masterId,
    title: r.title || 'Untitled',
    year: r.year || null,
    format: r.format || null,
    role: r.role || 'Main',
    thumb: r.thumb || null,
    artistName: null,
    resolved: false,
    videos: [],
  };
}

export function dedupeReleases(rawReleases) {
  const seen = new Map();
  for (const r of rawReleases) {
    const info = artistReleaseKeyInfo(r);
    if (!info || seen.has(info.key)) continue;
    seen.set(info.key, normalizeArtistRelease(r, info.releaseId, info.masterId));
  }
  return Array.from(seen.values());
}

// Appends releases from a newly-fetched page that aren't already represented
// in `existingReleases` (by the same master/release key), leaving existing
// entries — and any resolved-video progress already made on them — untouched.
export function mergeArtistReleases(existingReleases, rawReleases) {
  const seenKeys = new Set(
    existingReleases.map((r) => (r.masterId != null ? `m${r.masterId}` : `r${r.id}`))
  );
  const additions = [];
  for (const r of rawReleases) {
    const info = artistReleaseKeyInfo(r);
    if (!info || seenKeys.has(info.key)) continue;
    seenKeys.add(info.key);
    additions.push(normalizeArtistRelease(r, info.releaseId, info.masterId));
  }
  return existingReleases.concat(additions);
}

// Label release listings don't have the master/release split or a "role" —
// every release on the label is fair game — but the same pagination can
// occasionally repeat an id, so still guard against literal duplicates.
function normalizeLabelRelease(r) {
  return {
    id: r.id,
    masterId: null,
    title: r.title || 'Untitled',
    year: r.year || null,
    format: r.format || null,
    role: 'Main',
    thumb: r.thumb || null,
    artistName: r.artist || null,
    resolved: false,
    videos: [],
  };
}

export function normalizeLabelReleases(rawReleases) {
  const seen = new Map();
  for (const r of rawReleases) {
    if (!r.id || seen.has(r.id)) continue;
    seen.set(r.id, normalizeLabelRelease(r));
  }
  return Array.from(seen.values());
}

export function mergeLabelReleases(existingReleases, rawReleases) {
  const seenIds = new Set(existingReleases.map((r) => r.id));
  const additions = [];
  for (const r of rawReleases) {
    if (!r.id || seenIds.has(r.id)) continue;
    seenIds.add(r.id);
    additions.push(normalizeLabelRelease(r));
  }
  return existingReleases.concat(additions);
}
