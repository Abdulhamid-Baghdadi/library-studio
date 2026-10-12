/**
 * Publication notes of the library ("00 - Library/NNN - Year - Authors - Title.md", `type: publication`).
 *
 *   readPublication(stem, text) → Paper | null   everything the tools need from one note (null: not a publication)
 *   section(body, name)                           text of "## <name>" up to the next "## " heading, one line
 *   bodyLinks(body)                               Set of [[link]] targets in the note body (alias and #heading removed)
 *   paperLabel(paper)                             "Ulrich 1995 (No. 005)"
 *
 * A Paper keeps the parsed properties (`props`) and the body, plus the fields derived from them:
 *   no          numeric library index (from `index`, else the first three characters of the name)
 *   index       the `index` property as written ("5"), or the note name when missing
 *   cite        authors as cited, from the file name ("Baldwin & Clark")
 *   categories  concept maps linked in `category` (link targets)
 *   tags        lower-cased `tags`
 *   refs, citedBy   note names in `references` / `cited_by` (from OpenAlex)
 *   refsPdf     note names in `references_pdf` (read from the PDF by Claude or by hand)
 *   suggestedDoi, suggestedCategory, enrichedBy   proposals and provenance written by the enrich tool
 *   citekey     the `citekey` property ("" until the BibTeX export assigns one)
 *   links       Set of note names linked from the body
 *   abstract, why   the "Abstract" and "Why is this paper important?" sections
 * @module domain/publications
 */
import { linkTarget, splitNote } from "./frontmatter.js";

export const LIBRARY_DIR = "00 - Library";
/** Older names of the library folder, still recognised. */
export const LEGACY_LIBRARY_DIRS = Object.freeze(["98 - Publications"]);
export const PDF_DIR = `${LIBRARY_DIR}/PDFs`;

const asList = v => (Array.isArray(v) ? v : v == null || v === "" ? [] : [v]);
const scalar = v => (Array.isArray(v) ? "" : String(v ?? ""));

/** @typedef {ReturnType<typeof readPublication>} Paper */

export function readPublication(stem, text) {
  const { props, body, raw } = splitNote(text);
  if (raw == null || props.type !== "publication") return null;
  const parts = stem.split(" - ");
  const index = scalar(props.index);
  const no = /^\d+$/.test(index) ? Number(index) : /^\d{3}/.test(stem) ? Number(stem.slice(0, 3)) : 0;
  return {
    stem, props, body, no,
    index: index || stem,
    title: scalar(props.title) || stem,
    year: scalar(props.year),
    authors: scalar(props.authors),
    cite: parts.length > 2 ? parts[2] : "",
    journal: scalar(props.journal),
    type: scalar(props.publication_type),
    class: scalar(props.publication_class),
    status: scalar(props.status),
    importance: scalar(props.importance),
    doi: scalar(props.doi),
    citekey: scalar(props.citekey),
    pdf: linkTarget(scalar(props.pdf)),
    categories: asList(props.category).map(c => linkTarget(c)).filter(Boolean),
    tags: asList(props.tags).map(t => String(t).toLowerCase()),
    refs: asList(props.references).map(r => linkTarget(r)),
    refsPdf: asList(props.references_pdf).map(r => linkTarget(r)),
    citedBy: asList(props.cited_by).map(r => linkTarget(r)),
    suggestedDoi: scalar(props.suggested_doi),
    suggestedCategory: linkTarget(scalar(props.suggested_category)),
    enrichedBy: asList(props.enriched_by).map(String),
    links: bodyLinks(body),
    abstract: section(body, "Abstract"),
    why: section(body, "Why is this paper important\\?"),
  };
}

export function section(body, name) {
  const m = new RegExp(`^## ${name}[ \\t]*\\r?\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, "m").exec(body);
  return m ? m[1].replace(/\s+/g, " ").trim() : "";
}

export function bodyLinks(body) {
  const out = new Set();
  for (const m of String(body).matchAll(/\[\[([^\]]+)\]\]/g)) out.add(m[1].split("|")[0].split("#")[0].trim());
  return out;
}

export const paperLabel = p => `${p.cite} ${p.year} (No. ${String(p.no).padStart(3, "0")})`;
