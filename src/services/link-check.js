/**
 * The publication-link rule on the open library: find (or replace) links between publication notes.
 *
 *   checkLinks(folder, library, { fix })  → { total, findings: [{ stem, count, targets }], fixed }
 * @module services/link-check
 */
import { fixLinks, forbiddenLinks, publicationIndex } from "../domain/link-check.js";

export async function checkLinks(folder, library, { fix = false } = {}) {
  const pubs = publicationIndex(library.papers);
  const findings = [];
  let total = 0;
  for (const p of library.papers) {
    const path = `${library.dir}/${p.stem}.md`;
    const text = await folder.readText(path);
    const hits = forbiddenLinks(text, p.stem, pubs);
    if (!hits.length) continue;
    total += hits.length;
    findings.push({ stem: p.stem, count: hits.length, targets: hits.map(h => h.target) });
    if (fix) await folder.writeText(path, fixLinks(text, p.stem, pubs));
  }
  return { total, findings, fixed: fix };
}
