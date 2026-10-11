/**
 * Citations between library papers, from OpenAlex reference lists, written into the properties
 * `references` (library papers this paper cites) and `cited_by` (library papers citing it).
 *
 *   normalizeDoi(d)                       "https://doi.org/10.1/X." → "10.1/x"
 *   citationGraph(dois, works)            → { refs, cited, found }
 *       dois   Map note name → normalised DOI ("" when none)
 *       works  Map normalised DOI → { id, referenced: string[] }  (OpenAlex ids)
 *       refs   Map note name → sorted note names it cites (only notes found in OpenAlex)
 *       cited  Map note name → sorted note names citing it (every note)
 *   withCitations(text, refs, cited)      the note text with both properties replaced
 *   citationSummary(dois, graph, top)     lines for the console / the page
 * @module domain/citations
 */
import { formatList, replaceProps } from "./frontmatter.js";
import { compareCodePoints } from "./text-rules.js";

export const normalizeDoi = d => String(d ?? "").trim().toLowerCase().replace(/^(https?:\/\/(dx\.)?doi\.org\/|doi:\s*)/, "").replace(/\.+$/, "");

export function citationGraph(dois, works) {
  const stemOfId = new Map();
  for (const [stem, doi] of dois) if (doi && works.has(doi)) stemOfId.set(works.get(doi).id, stem);
  const refs = new Map();
  for (const [stem, doi] of dois) {
    if (!doi || !works.has(doi)) continue;
    const list = new Set();
    for (const r of works.get(doi).referenced) {
      const s = stemOfId.get(r);
      if (s && s !== stem) list.add(s);
    }
    refs.set(stem, [...list].sort(compareCodePoints));
  }
  const cited = new Map([...dois.keys()].map(s => [s, []]));
  for (const [s, list] of refs) for (const r of list) cited.get(r).push(s);
  for (const list of cited.values()) list.sort(compareCodePoints);
  return { refs, cited, found: stemOfId.size };
}

export function withCitations(text, refs, cited) {
  return replaceProps(text, { references: formatList("references", refs), cited_by: formatList("cited_by", cited) });
}

export function citationSummary(dois, { refs, cited, found }, top = 10) {
  const links = [...refs.values()].reduce((a, r) => a + r.length, 0);
  const most = [...dois.keys()].sort((a, b) => cited.get(b).length - cited.get(a).length || compareCodePoints(a, b)).slice(0, top);
  return {
    publications: dois.size, found, links, missing: dois.size - found,
    mostCited: most.map(s => ({ stem: s, count: cited.get(s).length })),
  };
}
