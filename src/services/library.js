/**
 * Opening the library: every `type: publication` note in the vault's library folder.
 *
 *   openLibrary(folder, { libraryDir })  → { dir, papers, byStem, skipped }
 *   findLibraryDir(folder, preferred)     the library folder of a vault ("00 - Library", or an older name)
 *   isVault(folder, libraryDir)           does this folder contain the library folder?
 * @module services/library
 */
import { LEGACY_LIBRARY_DIRS, LIBRARY_DIR, readPublication } from "../domain/publications.js";
import { compareCodePoints } from "../domain/text-rules.js";

/**
 * @typedef {object} Library
 * @property {string} dir  the library folder inside the vault ("00 - Library")
 * @property {import("../domain/publications.js").Paper[]} papers  sorted by note name
 * @property {Map<string, import("../domain/publications.js").Paper>} byStem
 * @property {string[]} skipped  notes in the folder that are not publication notes
 */

/**
 * The vault's library folder: `preferred` if it exists, else "00 - Library", else an older name
 * ("98 - Publications"); null when there is none.
 */
export async function findLibraryDir(folder, preferred = LIBRARY_DIR) {
  for (const dir of [preferred, LIBRARY_DIR, ...LEGACY_LIBRARY_DIRS]) if (dir && (await folder.isDirectory(dir))) return dir;
  return null;
}

/** @param {import("../ports/folder.js").Folder} folder @returns {Promise<Library>} */
export async function openLibrary(folder, { libraryDir: wanted = LIBRARY_DIR, onProgress = () => {} } = {}) {
  const libraryDir = await findLibraryDir(folder, wanted);
  if (!libraryDir) throw new Error(`No folder "${wanted}" in ${folder.name}. Open the vault folder (the one that contains it), or change the library folder in Settings.`);
  const names = (await folder.list(libraryDir)).filter(f => f.endsWith(".md")).sort(compareCodePoints);
  const papers = [], skipped = [];
  for (const [i, name] of names.entries()) {
    const paper = readPublication(name.slice(0, -3), await folder.readText(`${libraryDir}/${name}`));
    if (paper) papers.push(paper); else skipped.push(name);
    if (i % 25 === 24) onProgress(i + 1, names.length);
  }
  return { dir: libraryDir, papers, byStem: new Map(papers.map(p => [p.stem, p])), skipped };
}

export const isVault = async (folder, libraryDir = LIBRARY_DIR) => Boolean(await findLibraryDir(folder, libraryDir));
