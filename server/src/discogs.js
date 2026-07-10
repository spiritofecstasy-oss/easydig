import { RateLimiter } from './rateLimiter.js';

const DISCOGS_API = 'https://api.discogs.com';
const USER_AGENT = 'DiscogsYoutubePlaylistApp/0.1 (local personal-use dev app)';

// Discogs allows 60/min authenticated; stay under that with headroom.
const limiter = new RateLimiter(50, 60_000);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function getToken() {
  const token = process.env.DISCOGS_TOKEN;
  if (!token) {
    throw new Error(
      'Missing DISCOGS_TOKEN. Add it to server/.env (see server/.env.example).'
    );
  }
  return token;
}

// tier: 'search' always wins, 'list' (profile/release-list pagination) comes
// next, 'resolve' (bulk per-release video lookups) is lowest — see rateLimiter.js.
async function discogsRequest(path, params = {}, tier = 'resolve') {
  return limiter.schedule(async () => {
    const url = new URL(DISCOGS_API + path);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value));
    }
    url.searchParams.set('token', getToken());

    let attempt = 0;
    while (true) {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
      });

      if (res.status === 429) {
        attempt += 1;
        if (attempt > 5) {
          throw new Error(`Discogs rate limit exceeded repeatedly for ${path}`);
        }
        const retryAfter = parseInt(res.headers.get('retry-after') || '5', 10);
        await sleep((retryAfter + 1) * 1000);
        continue;
      }

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Discogs API error ${res.status} for ${path}: ${body}`);
      }

      return res.json();
    }
  }, tier);
}

export async function search(query) {
  const data = await discogsRequest(
    '/database/search',
    { q: query, per_page: 25 },
    'search'
  );
  return (data.results || [])
    .filter((r) => ['artist', 'label', 'release', 'master'].includes(r.type))
    .map((r) => ({
      id: r.id,
      type: r.type,
      name: r.title,
      thumb: r.cover_image || r.thumb || null,
      year: r.year || null,
    }));
}

export async function getArtistProfile(artistId) {
  const data = await discogsRequest(`/artists/${artistId}`, {}, 'list');
  return {
    id: data.id,
    name: data.name,
    thumb: data.images?.[0]?.uri150 || data.images?.[0]?.uri || null,
  };
}

// Single page at a time — some artists/labels have 9,000+ releases across
// 90+ pages, so fetching the whole thing before responding at all would mean
// a multi-minute hang. Callers fetch page 1 for a fast initial response and
// page the rest in the background (see discography.js).
export async function getArtistReleasesPage(artistId, page, perPage = 100) {
  return discogsRequest(
    `/artists/${artistId}/releases`,
    { page, per_page: perPage, sort: 'year', sort_order: 'asc' },
    'list'
  );
}

export async function getLabelProfile(labelId) {
  const data = await discogsRequest(`/labels/${labelId}`, {}, 'list');
  return {
    id: data.id,
    name: data.name,
    thumb: data.images?.[0]?.uri150 || data.images?.[0]?.uri || null,
  };
}

export async function getLabelReleasesPage(labelId, page, perPage = 100) {
  return discogsRequest(
    `/labels/${labelId}/releases`,
    { page, per_page: perPage },
    'list'
  );
}

// For a release/master search hit, resolve the primary credited artist so we
// can load that artist's full discography — a single release doesn't have
// its own "discography" to build a playlist from.
export async function getPrimaryArtistForRelease(releaseId) {
  const data = await discogsRequest(`/releases/${releaseId}`, {}, 'list');
  const artist = data.artists?.[0];
  if (!artist) return null;
  return { id: artist.id, name: artist.name };
}

export async function getPrimaryArtistForMaster(masterId) {
  const data = await discogsRequest(`/masters/${masterId}`, {}, 'list');
  const artist = data.artists?.[0];
  if (!artist) return null;
  return { id: artist.id, name: artist.name };
}

function extractYoutubeId(uri) {
  if (!uri) return null;
  const match = uri.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([a-zA-Z0-9_-]{11})/
  );
  return match ? match[1] : null;
}

// tier defaults to 'resolve' (the background walker); pass 'search' for an
// on-demand single lookup triggered by a user clicking a release right now.
export async function getReleaseVideos(releaseId, tier = 'resolve') {
  const data = await discogsRequest(`/releases/${releaseId}`, {}, tier);
  const videos = (data.videos || [])
    .map((v, i) => ({
      youtubeId: extractYoutubeId(v.uri),
      title: v.title || null,
      duration: v.duration || null,
      position: i,
    }))
    .filter((v) => v.youtubeId);
  return videos;
}
