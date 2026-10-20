/**
 * Opening the library: every `type: publication` note in the vault's library folder.
 *
 *   openLibrary(folder, { libraryDir })  → { dir, root, papers, byStem, skipped }
 *   findLibraryDir(folder, preferred)     the folder of the publication notes ("00 - Library/Publication Summary",
 *                                         or an older place)
 *   isVault(folder, libraryDir)           does this folder contain a library folder?
 * @module services/library
 */
import { citedByOf, isNoteName, LEGACY_LIBRARY_DIRS, LIBRARY_DIR, libraryRoot, readPublication } from "../domain/publications.js";
import { compareCodePoints } from "../domain/text-rules.js";

/**
 * @typedef {object} Library
 * @property {string} dir  the folder of the publication notes inside the vault ("00 - Library/Publication Summary")
 * @property {string} root  the library's top folder, which holds PDFs/ and Library.bib ("00 - Library")
 * @property {import("../domain/publications.js").Paper[]} papers  sorted by note name
 * @property {Map<string, import("../domain/publications.js").Paper>} byStem
 * @property {string[]} skipped  notes in the folder that are not publication notes
 */

/**
 * The folder of the publication notes: the first of `preferred`, "00 - Library/Publication Summary", "00 - Library"
 * and "98 - Publications" that holds notes named "NNN - …"; else the first of them that exists (a library without
 * notes yet); null when there is none. So a setting that still names an older place finds the notes where they are now.
 */
export async function findLibraryDir(folder, preferred = LIBRARY_DIR) {
  const existing = [];
  for (const dir of new Set([preferred, LIBRARY_DIR, ...LEGACY_LIBRARY_DIRS])) if (dir && (await folder.isDirectory(dir))) existing.push(dir);
  for (const dir of existing) if ((await folder.list(dir)).some(isNoteName)) return dir;
  return existing[0] ?? null;
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
  const citedBy = citedByOf(papers);
  for (const p of papers) p.citedBy = citedBy.get(p.stem);
  return { dir: libraryDir, root: libraryRoot(libraryDir), papers, byStem: new Map(papers.map(p => [p.stem, p])), skipped };
}

export const isVault = async (folder, libraryDir = LIBRARY_DIR) => Boolean(await findLibraryDir(folder, libraryDir));
