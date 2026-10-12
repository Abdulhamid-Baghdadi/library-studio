/**
 * The library export for colleagues who work in MS Office: a workbook (one row per paper, the citations
 * between library papers, the papers per concept map) and an interactive graph page.
 *
 *   EXPORT_DIR                 "96 - Library export"
 *   CLASS_NAMES                UAntwerpen/VABB publication classes
 *   workbook(papers, { pdfHref })   the sheets for xlsx.js
 *   graphData(papers, { pdfHref })  { nodes, edges, classes } for the graph page
 *   graphPage(template, data)       the page text (the template's `/*DATA*\/null` replaced)
 *
 * `papers` are Papers sorted by `no`; pdfHref(paper) gives the relative link to its PDF, or "".
 * @module domain/export
 */
import { paperLabel } from "./publications.js";
import { compareCodePoints } from "./text-rules.js";

export const EXPORT_DIR = "96 - Library export";
export const WORKBOOK = "Library.xlsx";
export const GRAPH_PAGE = "Library graph.html";

export const CLASS_NAMES = {
  A1: "A1 Web of Science journal", A2: "A2 other peer-reviewed journal", A3: "A3 magazine",
  B1: "B1 book", B2: "B2 book chapter", C1: "C1 conference paper", D1: "D1 doctoral thesis",
  other: "other (report, standard, dataset…)",
};

const no3 = p => String(p.no).padStart(3, "0");
const cut = (s, n) => [...String(s)].slice(0, n).join("");

export function workbook(papers, { pdfHref }) {
  const byStem = new Map(papers.map(p => [p.stem, p]));
  const no = s => (byStem.has(s) ? no3(byStem.get(s)) : s);
  const library = papers.map(p => [
    no3(p), p.year, p.cite, p.title, p.journal, p.class, p.type, p.status, p.importance,
    p.categories.join("; "), p.citedBy.length, p.refs.map(no).join(", "), p.citedBy.map(no).join(", "),
    cut(p.abstract, 1500), { v: p.doi, link: p.doi ? `https://doi.org/${p.doi}` : "" },
    { v: pdfHref(p) ? "open PDF" : "", link: pdfHref(p) },
  ]);
  const citations = papers.flatMap(p => p.refs.map(r => [no3(p), paperLabel(p), no(r), byStem.has(r) ? paperLabel(byStem.get(r)) : r]));
  const cats = new Map();
  for (const p of papers) for (const c of p.categories) { if (!cats.has(c)) cats.set(c, []); cats.get(c).push(p); }
  const maps = [...cats].sort((a, b) => compareCodePoints(a[0], b[0])).map(([c, ps]) => [c, ps.length, ps.sort((a, b) => a.no - b.no).map(no3).join(", ")]);
  const readme = [
    "Library export from the Obsidian vault (the publication notes of the library). Do not edit here: changes are overwritten",
    "at the next export. Edit the notes in the vault and run the export again in Library Studio.",
    "", "Class: UAntwerpen/VABB codes. " + Object.values(CLASS_NAMES).join("; "),
    "References / Cited by: citations between library papers only (OpenAlex; papers without a DOI are not covered).",
    "PDF links work when this file stays in the vault folder next to the library folder.",
  ].map(line => [line]);
  return [
    { name: "Library", headers: ["No.", "Year", "Authors", "Title", "Journal / venue", "Class", "Type", "Status", "Importance",
      "Concept maps", "Cited by (library)", "References (No.)", "Cited by (No.)", "Abstract", "DOI", "PDF"],
      rows: library, widths: [6, 6, 22, 50, 30, 7, 16, 10, 10, 40, 10, 22, 22, 60, 24, 10], wrap: ["D", "L", "M", "N"] },
    { name: "Citations", headers: ["Citing No.", "Citing paper", "Cited No.", "Cited paper"], rows: citations, widths: [10, 45, 10, 45] },
    { name: "Concept maps", headers: ["Concept map", "Papers", "Nos."], rows: maps, widths: [60, 8, 100] },
    { name: "Read me", rows: readme, widths: [120] },
  ];
}

export function graphData(papers, { pdfHref }) {
  const stems = new Set(papers.map(p => p.stem));
  const cats = [...new Set(papers.flatMap(p => p.categories))].sort(compareCodePoints);
  const nodes = papers.map(p => ({
    id: p.stem, kind: "paper", label: paperLabel(p), no: p.no, title: p.title, year: p.year, authors: p.authors,
    journal: p.journal, class: p.class, status: p.status, cats: p.categories, cited: p.citedBy.length, refs: p.refs.length,
    abstract: cut(p.abstract, 1200), why: cut(p.why, 600), doi: p.doi, pdf: pdfHref(p),
  }));
  for (const c of cats) nodes.push({ id: "cat:" + c, kind: "category", label: c.replace(/^\d+-\s*/, ""), count: papers.filter(p => p.categories.includes(c)).length });
  const edges = papers.flatMap(p => p.categories.map(c => ({ from: p.stem, to: "cat:" + c, kind: "category" })));
  edges.push(...papers.flatMap(p => p.refs.filter(r => stems.has(r)).map(r => ({ from: p.stem, to: r, kind: "citation" }))));
  return { nodes, edges, classes: CLASS_NAMES };
}

export function graphPage(template, data) {
  return template.replace("/*DATA*/null", JSON.stringify(data).replace(/<\//g, "<\\/"));
}
