/**
 * The vaults this browser opened before: folder handles, their settings and the last cluster result, kept in
 * IndexedDB so that the start screen can offer them again (the browser still asks once per visit for access).
 * @module adapters/browser-store
 */

const DB = "library-studio", STORE = "vaults";

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => { db.close(); resolve(req?.result); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/**
 * @typedef {object} SavedVault
 * @property {string} id
 * @property {FileSystemDirectoryHandle} handle the vault folder
 * @property {string} name
 * @property {number} opened when it was last opened (ms)
 * @property {object} settings folders inside the vault, Obsidian vault name, OpenAlex email, cluster settings…
 * @property {object|null} lastCluster the last cluster result shown on the page
 */

/** Recent vaults, most recently opened first. @returns {Promise<SavedVault[]>} */
export const recentVaults = async () => ((await run("readonly", s => s.getAll())) ?? []).sort((a, b) => b.opened - a.opened);

/** Adds or updates a vault (matched by its folder handle). @returns {Promise<SavedVault>} */
export async function rememberVault(handle, { settings = {}, lastCluster } = {}) {
  let entry = null;
  for (const v of await recentVaults()) if (await v.handle.isSameEntry(handle)) entry = v;
  entry = {
    id: entry?.id ?? crypto.randomUUID(), handle, name: handle.name, opened: Date.now(),
    settings: { ...(entry?.settings ?? {}), ...settings },
    lastCluster: lastCluster === undefined ? entry?.lastCluster ?? null : lastCluster,
  };
  await run("readwrite", s => s.put(entry));
  return entry;
}

export const forgetVault = id => run("readwrite", s => s.delete(id));
