/**
 * The vault rule for publication notes: a publication note must not contain an Obsidian link ([[…]] or ![[…]])
 * to another publication note, except in the citation properties `references`, `references_pdf` and `cited_by`.
 *
 *   publicationIndex(papers)          Map note name → `index` ("" when missing), for every publication note
 *   forbiddenLinks(text, stem, pubs)  the offending links in one note: [{ target, alias, start, end }]
 *   fixLinks(text, stem, pubs)        the note with each offending link replaced by plain text:
 *                                     its alias, or "Authors Year (No. NNN)"
 * @module domain/link-check
 */

const CITATION_PROPS = /^(?:references|references_pdf|cited_by):[ \t]*\r?\n(?:[ \t]+-.*\r?\n?)*/gm;
const LINK = /!?\[\[([^\]|#]+?)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g;

/** @param {Iterable<{stem: string, index: string, no: number}>} papers */
export function publicationIndex(papers) {
  const out = new Map();
  for (const p of papers) out.set(p.stem, /^\d+$/.test(String(p.index)) ? String(p.index) : "");
  return out;
}

const targetOf = t => (t.trim().toLowerCase().endsWith(".md") ? t.trim().slice(0, -3) : t.trim());

function allowedRanges(text) {
  return [...text.matchAll(CITATION_PROPS)].map(m => [m.index, m.index + m[0].length]);
}

/** @param {Map<string, string>} pubs from publicationIndex */
export function forbiddenLinks(text, stem, pubs) {
  const allowed = allowedRanges(text);
  const out = [];
  for (const m of text.matchAll(LINK)) {
    const target = targetOf(m[1]);
    if (!pubs.has(target) || target === stem) continue;
    if (allowed.some(([a, b]) => a <= m.index && m.index < b)) continue;
    out.push({ target, alias: m[2] ?? null, start: m.index, end: m.index + m[0].length });
  }
  return out;
}

export function plainReference(target, alias, pubs) {
  if (alias) return alias;
  const parts = target.split(" - ");
  if (parts.length >= 3 && /^\d+$/.test(parts[0])) return `${parts[2]} ${parts[1]} (No. ${parts[0]})`;
  return pubs.get(target) ? `${parts[0]} (No. ${pubs.get(target)})` : parts[0];
}

export function fixLinks(text, stem, pubs) {
  const hits = forbiddenLinks(text, stem, pubs);
  let out = "", at = 0;
  for (const h of hits) { out += text.slice(at, h.start) + plainReference(h.target, h.alias, pubs); at = h.end; }
  return out + text.slice(at);
}
