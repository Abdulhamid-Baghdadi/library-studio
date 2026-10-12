/**
 * Enrichment of the publication notes from OpenAlex, as pure rules: what to fill, what to propose, what to
 * report, and the texts of the three files it writes.
 *
 *   FILES                        Gaps.md, Candidates.md, References.json (in the library folder)
 *   titleKey(title)              titles made comparable (case, accents, punctuation removed)
 *   planPaper(paper, work, titleMatch, proposal)  → Plan for one note:
 *       fills          properties that are empty in the note and known to OpenAlex (authors, journal, year, url)
 *                      and the abstract; `authors` is also filled when the note only has the as-cited surnames
 *                      and OpenAlex agrees on the first author
 *       suggestions    suggested_doi (a work found by exact title and year), suggested_category (nearest concept map)
 *       disagreements  note vs OpenAlex on year, journal, title — reported, never changed
 *       gaps           what remains missing and why
 *   applyPlan(text, plan, { today })  → the note text with the fills, suggestions, abstract and provenance written
 *   categoryProposals(papers, X)      → Map note name → { category, score, margin } for notes without a concept map
 *   candidateList(papers, works)      → papers cited by ≥ 2 library papers that are not in the library (OpenAlex ids)
 *   gapsMarkdown(plans, { today })    → text of Gaps.md
 *   candidatesMarkdown(candidates, { today })  → text of Candidates.md
 *   referencesJson(papers, works, candidates, { today })  → object for References.json
 * @module domain/enrich
 */
import { authorsOf } from "./bibtex.js";
import { centroid } from "./cluster-text.js";
import { appendListItem, setScalar } from "./frontmatter.js";
import { compareCodePoints } from "./text-rules.js";

export const FILES = { gaps: "Gaps.md", candidates: "Candidates.md", references: "References.json" };
export const MIN_SCORE = 0.12, CLEAR_MARGIN = 0.08;

const entities = s => String(s ?? "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const fold = s => entities(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export const titleKey = t => fold(t).replace(/ /g, "");
const asciiLower = s => fold(s).replace(/ /g, "");

/** Same title when one is the other without its subtitle ("Unpacking the Black Box of Modularity" ~ "…: Technologies…"). */
export const sameTitle = (a, b) => {
  const x = titleKey(a), y = titleKey(b);
  if (!x || !y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return long.startsWith(short) && short.length >= Math.min(20, long.length);
};

/** Same venue when the note's value starts with OpenAlex's (volume and pages appended) or differs only by a leading "The". */
export const sameVenue = (a, b) => {
  const x = fold(a).replace(/^the /, ""), y = fold(b).replace(/^the /, "");
  if (!x || !y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return long.startsWith(short) && short.length >= Math.min(12, long.length);
};

/** Do the as-cited surnames of the note agree with OpenAlex's first author? */
function firstAuthorAgrees(paper, work) {
  const cited = authorsOf(paper)[0]?.last ?? "";
  const first = String(work.authors).split(";")[0] ?? "";
  return Boolean(cited) && asciiLower(first).includes(asciiLower(cited));
}

/**
 * @param {import("./publications.js").Paper} paper
 * @param {import("./openalex.js").Work|null} work        the work found by the note's DOI
 * @param {import("./openalex.js").Work|null} titleMatch  a work found by exact title and year (when there is no DOI match)
 * @param {{category: string, score: number, margin: number}|null} proposal
 */
export function planPaper(paper, work, titleMatch, proposal) {
  const plan = { stem: paper.stem, no: paper.no, title: paper.title, pdf: paper.pdf, fills: {}, abstract: "", suggestions: {}, disagreements: [], gaps: [], source: work ? "openalex" : null };
  const asCited = !paper.authors || fold(paper.authors) === fold(paper.cite);
  if (work) {
    const titleOk = sameTitle(paper.title, work.title);
    if (!titleOk) plan.disagreements.push({ key: "title", note: paper.title, openalex: work.title, serious: true, hint: "the DOI may point to another paper" });
    if (!paper.authors) { if (titleOk) plan.fills.authors = work.authors; }
    else if (asCited && work.authors && titleOk && firstAuthorAgrees(paper, work)) plan.fills.authors = work.authors;
    else if (asCited && work.authors && !firstAuthorAgrees(paper, work)) plan.disagreements.push({ key: "authors", note: paper.authors, openalex: work.authors, serious: true, hint: titleOk ? "first author differs (alias, or wrong DOI)" : "the DOI may point to another paper" });
    if (titleOk) {
      if (!paper.journal && work.journal) plan.fills.journal = work.journal;
      if (!paper.year && work.year) plan.fills.year = work.year;
      if (!String(paper.props.url ?? "") && work.url) plan.fills.url = work.url;
      if (!paper.abstract && work.abstract) plan.abstract = work.abstract;
    }
    if (paper.year && work.year && paper.year.slice(0, 4) !== work.year) {
      const diff = Math.abs(Number(paper.year.slice(0, 4)) - Number(work.year));
      plan.disagreements.push({ key: "year", note: paper.year, openalex: work.year, serious: diff > 1, hint: diff === 1 ? "online-first vs print year?" : "" });
    }
    if (paper.journal && work.journal && !sameVenue(paper.journal, work.journal)) plan.disagreements.push({ key: "journal", note: paper.journal, openalex: work.journal, serious: false, hint: "" });
    if (!work.referenced.length) plan.gaps.push("OpenAlex has no reference list for it");
    if (!paper.abstract && !work.abstract) plan.gaps.push("no abstract (OpenAlex has none either)");
  } else {
    plan.gaps.push(paper.doi ? "DOI not indexed by OpenAlex" : "no DOI");
    if (!paper.abstract) plan.gaps.push("no abstract");
    if (asCited) plan.gaps.push("authors known by surname only");
    if (titleMatch?.doi && !paper.doi && !paper.suggestedDoi) plan.suggestions.suggested_doi = titleMatch.doi;
    if (titleMatch?.doi && paper.doi && titleMatch.doi !== normalizeKey(paper.doi)) plan.disagreements.push({ key: "doi", note: paper.doi, openalex: titleMatch.doi, serious: true, hint: "OpenAlex has this title under another DOI" });
  }
  if (!paper.pdf) plan.gaps.push("no PDF");
  if (!paper.categories.length && !paper.suggestedCategory && proposal) plan.suggestions.suggested_category = `[[${proposal.category}]]`;
  if (!paper.categories.length && !proposal) plan.gaps.push("no concept map, and none can be proposed");
  plan.proposal = !paper.categories.length ? proposal : null;
  return plan;
}

/** Order of the properties in a note, for placing new ones. */
const AFTER = { authors: "index", year: "authors", journal: "title", url: "doi", suggested_doi: "doi", suggested_category: "category", enriched_by: "importance" };

export function applyPlan(text, plan, { today, source = "openalex" }) {
  let out = text;
  for (const [key, value] of Object.entries(plan.fills)) out = setScalar(out, key, value, AFTER[key]);
  for (const [key, value] of Object.entries(plan.suggestions)) out = setScalar(out, key, value, AFTER[key]);
  if (plan.abstract) out = withAbstract(out, plan.abstract);
  if (out !== text) out = appendListItem(out, "enriched_by", `${source} ${today}`, AFTER.enriched_by);
  return out;
}

/** Puts an abstract under an empty "## Abstract" heading (nothing happens when the heading is missing or filled). */
export function withAbstract(text, abstract) {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lf = text.replace(/\r\n/g, "\n");
  const m = /^## Abstract[ \t]*\n((?:[ \t]*\n)*)(?=^## |(?![\s\S]))/m.exec(lf);
  if (!m) return text;
  const out = lf.slice(0, m.index) + `## Abstract\n\n${abstract.trim()}\n\n` + lf.slice(m.index + m[0].length);
  return out.replace(/\n/g, eol);
}

/**
 * Nearest-centroid proposals: the concept maps as centroids of their papers' TF-IDF vectors; for each note
 * without a concept map, the closest centroid by cosine. `X` is the tfidf() result over `papers` in order.
 */
export function categoryProposals(papers, X) {
  const size = X.vocab.length;
  const byCat = new Map();
  papers.forEach((p, i) => { for (const c of p.categories) { if (!byCat.has(c)) byCat.set(c, []); byCat.get(c).push(i); } });
  const centroids = [...byCat].map(([category, members]) => {
    const v = centroid(X.rows, members, size);
    let n = 0; for (const x of v) n += x * x;
    const s = n > 0 ? 1 / Math.sqrt(n) : 0;
    for (let k = 0; k < size; k++) v[k] *= s;
    return { category, v, members: members.length };
  }).filter(c => c.members >= 2);
  const out = new Map();
  papers.forEach((p, i) => {
    if (p.categories.length || !centroids.length) return;
    const row = X.rows[i];
    const scores = centroids.map(c => { let s = 0; for (let k = 0; k < row.idx.length; k++) s += row.val[k] * c.v[row.idx[k]]; return { category: c.category, score: s }; })
      .sort((a, b) => b.score - a.score || compareCodePoints(a.category, b.category));
    const [best, second] = scores;
    if (best && best.score >= MIN_SCORE) out.set(p.stem, { category: best.category, score: best.score, margin: best.score - (second?.score ?? 0) });
  });
  return out;
}

/** Works cited by at least `min` library papers that are not library papers themselves, most cited first. */
export function candidateList(papers, works, { min = 3 } = {}) {
  const inLibrary = new Set([...works.values()].map(w => w.id));
  const count = new Map();
  for (const p of papers) {
    const w = p.doi ? works.get(normalizeKey(p.doi)) : null;
    if (!w) continue;
    for (const r of new Set(w.referenced)) {
      if (inLibrary.has(r)) continue;
      if (!count.has(r)) count.set(r, { id: r, count: 0, citedBy: [] });
      count.get(r).count++;
      count.get(r).citedBy.push(p);
    }
  }
  return [...count.values()].filter(c => c.count >= min).sort((a, b) => b.count - a.count || compareCodePoints(a.id, b.id));
}
const normalizeKey = d => String(d).trim().toLowerCase().replace(/^(https?:\/\/(dx\.)?doi\.org\/|doi:\s*)/, "").replace(/\.+$/, "");

const no3 = p => String(p.no).padStart(3, "0");
const link = p => `[[${p.stem}|${no3(p)} – ${p.title}]]`;

export function gapsMarkdown(plans, { today }) {
  const withGaps = plans.filter(p => p.gaps.length);
  const proposals = plans.filter(p => Object.keys(p.suggestions).length || p.disagreements.length);
  const lines = [
    "---", "type: library-report", "generated-by: Library Studio (enrich)", `generated: ${today}`, "---", "",
    "# Gaps in the publication library", "",
    `> [!info] Generated by Library Studio's enrich tool on ${today} — rerunning it overwrites this note.`,
    `> ${plans.length} publication notes · ${withGaps.length} with gaps · ${proposals.length} with proposals or differences to review.`, "",
    "## How to use this", "",
    "- **Proposals** are properties the tool was not sure enough to write: `suggested_doi` (found by exact title and year) and `suggested_category` (nearest concept map by content). Accept one by moving the value into the real property and deleting the suggestion; reject by deleting it.",
    "- **Differences** are places where the note and OpenAlex disagree. The note was left as it is. A title or first author that does not match usually means the DOI in the note points to another paper: check it first.",
    "- **Gaps** are what no database can fill. They are the list for a reading pass: the Claude skill `library-fill-gaps` (in the Library Studio repository) works through this note, reads the PDFs, and writes what it finds into `references_pdf`, the abstract section and the author, year and venue properties, marking each note with `enriched_by: pdf (Claude <date>)`. Anything it cannot read stays here for you.",
    "",
  ];
  const cell = s => String(s ?? "").replace(/\|/g, "/").replace(/\r?\n/g, " ");
  const serious = plans.flatMap(p => p.disagreements.filter(d => d.serious).map(d => [p, d]));
  const minor = plans.flatMap(p => p.disagreements.filter(d => !d.serious).map(d => [p, d]));
  if (serious.length) {
    lines.push("## Check these first: the DOI or the first author may be wrong", "", "| Paper | Property | Note | OpenAlex | Hint |", "|---|---|---|---|---|");
    for (const [p, d] of serious) lines.push(`| ${link(p)} | \`${d.key}\` | ${cell(d.note)} | ${cell(d.openalex)} | ${d.hint} |`);
    lines.push("");
  }
  const suggested = plans.filter(p => Object.keys(p.suggestions).length);
  if (suggested.length) {
    lines.push("## Proposals", "", "| Paper | Property | Proposal | Confidence |", "|---|---|---|---|");
    for (const p of suggested) {
      for (const [k, v] of Object.entries(p.suggestions)) {
        const conf = k === "suggested_category" && p.proposal ? `cosine ${p.proposal.score.toFixed(2)}, margin ${p.proposal.margin.toFixed(2)}${p.proposal.margin < CLEAR_MARGIN ? " — close call" : ""}` : "exact title and year match";
        lines.push(`| ${link(p)} | \`${k}\` | ${cell(k === "suggested_category" ? v.replace(/\[\[|\]\]/g, "") : v)} | ${conf} |`);
      }
    }
    lines.push("");
  }
  if (minor.length) {
    lines.push("## Minor differences (note kept as it is)", "", "| Paper | Property | Note | OpenAlex | Hint |", "|---|---|---|---|---|");
    for (const [p, d] of minor) lines.push(`| ${link(p)} | \`${d.key}\` | ${cell(d.note)} | ${cell(d.openalex)} | ${d.hint} |`);
    lines.push("");
  }
  lines.push("## Papers with gaps", "");
  if (!withGaps.length) lines.push("- none — every note has what the databases can give.");
  for (const p of withGaps) lines.push(`- ${link(p)} — ${p.gaps.join("; ")}${p.pdf ? ` · PDF: [[${p.pdf}]]` : ""}`);
  lines.push("");
  return lines.join("\n");
}

export function candidatesMarkdown(candidates, { today }) {
  const lines = [
    "---", "type: library-report", "generated-by: Library Studio (enrich)", `generated: ${today}`, "---", "",
    "# Candidate papers", "",
    `> [!info] Generated by Library Studio's enrich tool on ${today} — rerunning it overwrites this note.`,
    `> Papers cited by three or more library papers (OpenAlex reference lists) that are not in the library, the ${candidates.length} most cited. The more library papers cite one, the more likely it belongs here. The full reference lists are in References.json.`, "",
    "| Cited by | Year | Paper | DOI | Cited by (No.) |", "|---:|---|---|---|---|",
  ];
  for (const c of candidates) {
    const first = String(c.authors ?? "").split(";")[0] ?? "";
    const title = c.title ? `${first ? first + ": " : ""}${c.title}` : c.id;
    lines.push(`| ${c.count} | ${c.year ?? ""} | ${title.replace(/\|/g, "/")} | ${c.doi ? `[${c.doi}](https://doi.org/${c.doi})` : ""} | ${c.citedBy.map(no3).join(", ")} |`);
  }
  lines.push("");
  return lines.join("\n");
}

export function referencesJson(papers, works, candidates, { today }) {
  const out = { generated: today, source: "OpenAlex", papers: {}, candidates: [] };
  for (const p of papers) {
    const w = p.doi ? works.get(normalizeKey(p.doi)) : null;
    if (w) out.papers[p.stem] = { openalex: w.id, doi: w.doi, referenced: w.referenced };
  }
  out.candidates = candidates.map(c => ({ openalex: c.id, doi: c.doi ?? "", title: c.title ?? "", year: c.year ?? "", authors: c.authors ?? "", count: c.count, citedBy: c.citedBy.map(p => p.stem) }));
  return out;
}
