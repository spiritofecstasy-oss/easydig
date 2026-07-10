import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import {
  search,
  getPrimaryArtistForRelease,
  getPrimaryArtistForMaster,
} from './discogs.js';
import {
  ensureEntityLoaded,
  getJobForFilter,
  refreshEntity,
  resolveReleaseNow,
} from './discography.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = path.join(__dirname, '..', '..', 'client', 'dist');

// Load server/.env explicitly by path — relying on dotenv's cwd-relative
// default breaks depending on whether we're launched via `npm run dev`
// (cwd = server/) or `npm start` from the repo root (cwd = root).
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const app = express();
// API_PORT (set in server/.env) wins locally so we don't collide with the
// dev preview harness's own PORT var; Render never sets API_PORT, so
// production correctly falls through to the PORT it assigns.
const PORT = process.env.API_PORT || process.env.PORT || 3001;

app.get('/api/search', async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  if (!q) return res.json({ results: [] });
  try {
    const results = await search(q);
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// A release/master search hit doesn't have its own "discography" — resolve
// it to the primary credited artist and hand back that artist instead.
app.get('/api/resolve/:type/:id', async (req, res) => {
  const { type } = req.params;
  const id = Number(req.params.id);

  try {
    const artist =
      type === 'master'
        ? await getPrimaryArtistForMaster(id)
        : await getPrimaryArtistForRelease(id);

    if (!artist) {
      return res.status(404).json({ error: 'No credited artist found.' });
    }
    res.json({ id: artist.id, type: 'artist', name: artist.name, thumb: null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/entity/:type/:id/state', async (req, res) => {
  const { type } = req.params;
  const id = Number(req.params.id);
  const includeAll = req.query.includeAll === 'true';
  const refresh = req.query.refresh === 'true';

  if (type !== 'artist' && type !== 'label') {
    return res.status(400).json({ error: 'type must be "artist" or "label"' });
  }

  try {
    if (refresh) refreshEntity(type, id);

    const entity = await ensureEntityLoaded(type, id, includeAll);
    const job = getJobForFilter(type, id, includeAll);

    const releases = entity.releases
      .filter((r) => includeAll || type === 'label' || r.role === 'Main')
      .slice()
      .sort((a, b) => (a.year || 9999) - (b.year || 9999) || a.id - b.id);

    res.json({
      entity: { id: entity.id, type: entity.type, name: entity.name, thumb: entity.thumb },
      releases,
      job,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Resolves one release's video(s) right now, at top priority — used when the
// user clicks a release the background walker hasn't reached yet, so a click
// plays almost instantly instead of waiting on however far the walk has got.
app.get('/api/entity/:type/:id/release/:releaseId/resolve', async (req, res) => {
  const { type } = req.params;
  const id = Number(req.params.id);
  const releaseId = Number(req.params.releaseId);

  try {
    const release = await resolveReleaseNow(type, id, releaseId);
    res.json(release);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// In production there's no separate Vite dev server — this same process
// serves the built frontend too, so the whole app is one deployable service.
app.use(express.static(CLIENT_DIST));
app.get(/^(?!\/api\/).*/, (req, res) => {
  res.sendFile(path.join(CLIENT_DIST, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  if (!process.env.DISCOGS_TOKEN) {
    console.warn(
      'WARNING: DISCOGS_TOKEN is not set. Add it to server/.env before searching.'
    );
  }
});
