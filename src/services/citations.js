/**
 * Filling `references` and `cited_by` of every publication note from OpenAlex.
 *
 *   updateCitations(folder, library, http, { apply, mailto, onProgress })
 *     → { publications, found, missing, links, mostCited, apply, written }
 *   Without `apply` nothing is written (a dry run with the counts).
 * @module services/citations
 */
import { citationGraph, citationSummary, normalizeDoi, withCitations } from "../domain/citations.js";
import { fetchWorksByDoi } from "./openalex-works.js";

export async function updateCitations(folder, library, http, { apply = false, mailto = "", onProgress = () => {} } = {}) {
  const dois = new Map(library.papers.map(p => [p.stem, normalizeDoi(p.doi)]));
  const list = [...new Set([...dois.values()].filter(Boolean))];
  const works = await fetchWorksByDoi(http, list, { mailto, onProgress });
  const graph = citationGraph(dois, works, new Map(library.papers.map(p => [p.stem, p.refsPdf])));
  let written = 0;
  if (apply) {
    for (const [i, p] of library.papers.entries()) {
      const path = `${library.dir}/${p.stem}.md`;
      const text = await folder.readText(path);
      const next = withCitations(text, graph.refs.get(p.stem) ?? [], graph.cited.get(p.stem) ?? []);
      if (next !== text) { await folder.writeText(path, next); written++; }
      if (i % 20 === 19) onProgress(`Writing the properties (${i + 1} of ${library.papers.length})…`);
    }
  }
  return { ...citationSummary(dois, graph), apply, written };
}
