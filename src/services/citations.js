/**
 * Filling `references` and `cited_by` of every publication note from OpenAlex.
 *
 *   updateCitations(folder, library, http, { apply, mailto, onProgress })
 *     → { publications, found, missing, links, mostCited, apply, written }
 *   Without `apply` nothing is written (a dry run with the counts).
 * @module services/citations
 */
import { citationGraph, citationSummary, normalizeDoi, withCitations } from "../domain/citations.js";
import { worksByDoiUrls, worksFromResponse } from "../domain/openalex.js";

export async function updateCitations(folder, library, http, { apply = false, mailto = "", onProgress = () => {} } = {}) {
  const dois = new Map(library.papers.map(p => [p.stem, normalizeDoi(p.doi)]));
  const list = [...new Set([...dois.values()].filter(Boolean))];
  const works = new Map();
  const urls = worksByDoiUrls(list, { mailto });
  for (const [i, url] of urls.entries()) {
    onProgress(`Asking OpenAlex for the reference lists (${i + 1} of ${urls.length})…`);
    const res = await http.get(url, {});
    if (res.status === 429) throw new Error("OpenAlex is rate-limiting requests; wait a minute and try again (an email in Settings gives you the polite pool).");
    if (res.status < 200 || res.status >= 300) throw new Error(`OpenAlex answered ${res.status}.`);
    for (const [doi, w] of worksFromResponse(await res.json())) works.set(doi, w);
  }
  const graph = citationGraph(dois, works);
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
