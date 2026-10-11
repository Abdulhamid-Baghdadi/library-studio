/**
 * Folder adapter for the browser: a folder the user picked, through the File System Access API
 * (Chrome, Edge). Text is read with universal newlines and written with "\n", as the Node adapter does.
 * @module adapters/browser-folder
 */
const parts = path => String(path).split("/").filter(Boolean);

const known = new WeakMap();           // root -> Map(path -> directory handle): folders are looked up once
const listed = new WeakMap();          // root -> Map(path -> file handle) from the last listing: saves a lookup per note when opening

/** The directory handle at a path inside root (null when missing; created when `create`). */
async function dirAt(root, path, create = false) {
  if (!known.has(root)) known.set(root, new Map());
  const cache = known.get(root), key = parts(path).join("/");
  if (cache.has(key)) return cache.get(key);
  let dir = root;
  for (const name of parts(path)) {
    try { dir = await dir.getDirectoryHandle(name, { create }); } catch { return null; }
  }
  cache.set(key, dir);
  return dir;
}

/** The file handle at a path inside root (null when missing; created with its folders when `create`). */
async function fileAt(root, path, create = false, { reading = false } = {}) {
  const seen = reading && listed.get(root)?.get(parts(path).join("/"));   // only reads use it: they notice a removed file
  if (seen) return seen;
  const p = parts(path), name = p.pop();
  const dir = await dirAt(root, p.join("/"), create);
  if (!dir || !name) return null;
  try { return await dir.getFileHandle(name, { create }); } catch { return null; }
}

const missing = path => Object.assign(new Error(`No such file: ${path}`), { code: "ENOENT" });

/**
 * @param {FileSystemDirectoryHandle} root a folder the user granted read/write access to
 * @returns {import("../ports/folder.js").Folder}
 */
export function browserFolder(root) {
  const file = async path => {
    const handle = await fileAt(root, path, false, { reading: true });
    if (!handle) throw missing(path);
    try { return await handle.getFile(); } catch (e) {
      if (e?.name !== "NotFoundError") throw e;
      // removed or replaced since it was listed (editors such as Obsidian may save by replacing the file): look it up again
      listed.get(root)?.delete(parts(path).join("/"));
      const again = await fileAt(root, path);
      if (!again) throw missing(path);
      return again.getFile();
    }
  };
  const write = async (path, data) => {
    const writable = await (await fileAt(root, path, true)).createWritable();
    await writable.write(data);
    await writable.close();
  };
  return {
    name: root.name,
    exists: async path => !parts(path).length || Boolean((await fileAt(root, path)) || (await dirAt(root, path))),
    isDirectory: async path => Boolean(await dirAt(root, path)),
    lastModified: async path => (await file(path)).lastModified,
    readText: async path => (await file(path)).text(),
    readBytes: async path => new Uint8Array(await (await file(path)).arrayBuffer()),
    writeText: (path, text) => write(path, text),
    writeBytes: (path, bytes) => write(path, bytes),
    appendText: async (path, text) => {
      const handle = await fileAt(root, path);
      await write(path, (handle ? await (await handle.getFile()).text() : "") + text);
    },
    list: async dir => {
      const handle = await dirAt(root, dir);
      if (!handle) return [];
      if (!listed.has(root)) listed.set(root, new Map());
      const seen = listed.get(root), base = parts(dir).join("/"), names = [];
      for await (const [name, entry] of handle.entries()) {
        names.push(name);
        if (entry.kind === "file") seen.set(base ? `${base}/${name}` : name, entry);
      }
      return names.sort();
    },
    makeDir: async dir => { await dirAt(root, dir, true); },
    remove: async path => {
      const p = parts(path), name = p.pop();
      const dir = await dirAt(root, p.join("/"));
      if (!dir || !name) return;
      try { await dir.removeEntry(name); } catch (e) { if (e?.name !== "NotFoundError") throw e; }
      listed.get(root)?.delete(parts(path).join("/"));
    },
  };
}

/** Asks for read/write access to a stored handle (needs a click or key press). @returns {Promise<boolean>} */
export async function requestAccess(handle) {
  const mode = { mode: "readwrite" };
  if (typeof handle.queryPermission !== "function") return true;    // the browser's own storage (OPFS) needs no prompt
  return (await handle.queryPermission(mode)) === "granted" || (await handle.requestPermission(mode)) === "granted";
}
