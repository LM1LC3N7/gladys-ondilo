// -----------------------------------------------------------------------------
// What must survive a restart besides the tokens: the recommendations already
// announced, so the scene trigger fires once per recommendation. Kept in
// /data, the only writable place of the container.
// -----------------------------------------------------------------------------

import { readFile, rename, writeFile } from 'node:fs/promises';

export const STATE_FILE = '/data/ondilo-state.json';

export function fileStore(path = STATE_FILE) {
  return {
    async load() {
      try {
        return JSON.parse(await readFile(path, 'utf8'));
      } catch {
        return null;
      }
    },
    async save(data) {
      const temporary = `${path}.tmp`;
      await writeFile(temporary, JSON.stringify(data));
      await rename(temporary, path);
    },
  };
}

/** The persisted state, repaired: `{ seen: { [poolId]: string[] } }`. */
export function normalizeMemory(raw) {
  const seen = {};
  for (const [poolId, ids] of Object.entries(raw?.seen ?? {})) {
    if (Array.isArray(ids)) {
      seen[poolId] = ids.map(String);
    }
  }
  return { seen };
}
