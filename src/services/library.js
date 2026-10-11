/**
 * Opening the library: every `type: publication` note in the vault's library folder.
 *
 *   openLibrary(folder, { libraryDir })  → { dir, papers, byStem, skipped }
 *   isVault(folder, libraryDir)           does this folder contain the library folder?
 * @module services/library
 */
import { LIBRARY_DIR, readPublication } from "../domain/publications.js";
import { compareCodePoints } from "../domain/text-rules.js";

/**
 * @typedef {object} Library
 * @property {string} dir  the library folder inside the vault ("98 - Publications")
 * @property {import("../domain/publications.js").Paper[]} papers  sorted by note name
 * @property {Map<string, import("../domain/publications.js").Paper>} byStem
 * @property {string[]} skipped  notes in the folder that are not publication notes
 */

/** @param {import("../ports/folder.js").Folder} folder @returns {Promise<Library>} */
export async function openLibrary(folder, { libraryDir = LIBRARY_DIR, onProgress = () => {} } = {}) {
  if (!(await folder.isDirectory(libraryDir))) throw new Error(`No folder "${libraryDir}" in ${folder.name}. Open the vault folder (the one that contains it), or change the library folder in Settings.`);
  const names = (await folder.list(libraryDir)).filter(f => f.endsWith(".md")).sort(compareCodePoints);
  const papers = [], skipped = [];
  for (const [i, name] of names.entries()) {
    const paper = readPublication(name.slice(0, -3), await folder.readText(`${libraryDir}/${name}`));
    if (paper) papers.push(paper); else skipped.push(name);
    if (i % 25 === 24) onProgress(i + 1, names.length);
  }
  return { dir: libraryDir, papers, byStem: new Map(papers.map(p => [p.stem, p])), skipped };
}

export const isVault = (folder, libraryDir = LIBRARY_DIR) => folder.isDirectory(libraryDir);
