/**
 * Folder adapter for Node: a review folder on disk. Used by tests and command-line tools.
 * Text is read with universal newlines  and written with "\n".
 * @module adapters/node-folder
 */
import { appendFile, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

/** @returns {import("../ports/folder.js").Folder} */
export function nodeFolder(root) {
  const full = path => join(root, ...String(path).split("/").filter(Boolean));
  const ensureParent = path => mkdir(dirname(full(path)), { recursive: true });
  return {
    name: basename(root),
    exists: path => stat(full(path)).then(() => true, () => false),
    isDirectory: path => stat(full(path)).then(s => s.isDirectory(), () => false),
    lastModified: async path => (await stat(full(path))).mtimeMs,
    readText: path => readFile(full(path), "utf8"),
    writeText: async (path, text) => { await ensureParent(path); await writeFile(full(path), text, "utf8"); },
    appendText: async (path, text) => { await ensureParent(path); await appendFile(full(path), text, "utf8"); },
    readBytes: async path => new Uint8Array(await readFile(full(path))),
    writeBytes: async (path, bytes) => { await ensureParent(path); await writeFile(full(path), bytes); },
    list: async dir => (await readdir(full(dir)).catch(() => [])).sort(),
    makeDir: async dir => { await mkdir(full(dir), { recursive: true }); },
    remove: async path => { await rm(full(path), { force: true }); },
  };
}
