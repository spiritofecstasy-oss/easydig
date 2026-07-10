import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const CACHE_FILE = path.join(DATA_DIR, 'cache.json');

// Entities are keyed by "type:id" (e.g. "artist:1289", "label:142") since
// artist IDs and label IDs are independent numbering spaces on Discogs and
// could otherwise collide.
let store = { entities: {} };
let saveTimer = null;

function load() {
  if (fs.existsSync(CACHE_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
      if (parsed.entities) {
        store = parsed;
      } else if (parsed.artists) {
        // Migrate from the pre-label cache shape.
        store = { entities: {} };
        for (const [id, artist] of Object.entries(parsed.artists)) {
          store.entities[`artist:${id}`] = artist;
        }
      } else {
        store = { entities: {} };
      }
    } catch {
      store = { entities: {} };
    }
  } else {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}
load();

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(store, null, 2));
    saveTimer = null;
  }, 500);
}

function key(type, id) {
  return `${type}:${id}`;
}

export function getEntity(type, id) {
  return store.entities[key(type, id)];
}

export function setEntity(type, id, value) {
  store.entities[key(type, id)] = value;
  scheduleSave();
}

export function clearEntity(type, id) {
  delete store.entities[key(type, id)];
  scheduleSave();
}
