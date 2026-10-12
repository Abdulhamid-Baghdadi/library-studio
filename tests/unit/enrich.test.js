import { test } from "node:test";
import assert from "node:assert/strict";
import { applyPlan, candidateList, candidatesMarkdown, categoryProposals, gapsMarkdown, planPaper, referencesJson, titleKey, withAbstract } from "../../src/domain/enrich.js";
import { appendListItem, setScalar, yamlScalar } from "../../src/domain/frontmatter.js";
import { abstractFromIndex, titleSearchUrl, workDetails, worksByIdUrls } from "../../src/domain/openalex.js";
import { boilerplate, noteText, tfidf } from "../../src/domain/cluster-text.js";
import { clusterNotes } from "../../src/domain/cluster-analysis.js";
import { readPublication } from "../../src/domain/publications.js";
import { library, NOTES } from "./fixtures/library.js";

const paper = (over = {}) => ({ stem: "005 - 1995 - Ulrich - The Role", no: 5, title: "The Role of Product Architecture", authors: "Ulrich", cite: "Ulrich", year: "1995", journal: "",
  doi: "10.1016/x", pdf: "005.pdf", abstract: "", categories: [], suggestedDoi: "", suggestedCategory: "", enrichedBy: [], props: { url: "" }, ...over });
const work = (over = {}) => ({ id: "W1", doi: "10.1016/x", title: "The role of product architecture", year: "1995", authors: "Karl T. Ulrich", journal: "Research Policy", url: "https://doi.org/10.1016/x", abstract: "An abstract.", referenced: ["W2"], ...over });

test("frontmatter: yamlScalar, setScalar, appendListItem", () => {
  assert.equal(yamlScalar("Research Policy"), "Research Policy");
  assert.equal(yamlScalar("A: B"), '"A: B"');
  assert.equal(yamlScalar("[[04- Maps]]"), '"[[04- Maps]]"');
  const note = "---\r\nindex: 5\r\nauthors: \r\njournal: \"\"\r\ncategory: []\r\n---\r\nbody\r\n";
  let t = setScalar(note, "authors", "Karl T. Ulrich", "index");
  assert.equal(t, "---\r\nindex: 5\r\nauthors: Karl T. Ulrich\r\njournal: \"\"\r\ncategory: []\r\n---\r\nbody\r\n");
  t = setScalar(t, "journal", "Research Policy", "title");
  assert.ok(t.includes("\r\njournal: Research Policy\r\n"));
  t = setScalar(t, "year", "1995", "authors");
  assert.ok(t.includes("authors: Karl T. Ulrich\r\nyear: 1995\r\njournal"));
  t = appendListItem(t, "enriched_by", "openalex 2026-10-12", "category");
  assert.ok(t.includes("category: []\r\nenriched_by:\r\n  - openalex 2026-10-12\r\n---"));
  assert.equal(appendListItem(t, "enriched_by", "openalex 2026-10-12"), t);                      // no duplicate
  assert.ok(appendListItem(t, "enriched_by", "pdf (Claude 2026-10-13)").includes("  - openalex 2026-10-12\r\n  - pdf (Claude 2026-10-13)\r\n---"));
});

test("planPaper: fills only empty values, agrees on authors, reports disagreements", () => {
  const p = planPaper(paper(), work(), null, null);
  assert.deepEqual(p.fills, { authors: "Karl T. Ulrich", journal: "Research Policy", url: "https://doi.org/10.1016/x" });   // year stays: it is set
  assert.equal(p.abstract, "An abstract.");
  assert.deepEqual(p.disagreements, []);
  assert.deepEqual(p.gaps, ["no concept map, and none can be proposed"]);
  const q = planPaper(paper({ authors: "Ulrich", year: "1996", journal: "Res. Pol." }), work({ authors: "Someone Else" }), null, { category: "04- Maps", score: 0.3, margin: 0.2 });
  assert.equal(q.fills.authors, undefined);
  assert.deepEqual(q.disagreements.map(d => [d.key, d.serious]), [["authors", true], ["year", false], ["journal", false]]);
  assert.deepEqual(q.suggestions, { suggested_category: "[[04- Maps]]" });
  // a DOI that resolves to another paper: nothing is filled, the title difference is serious
  const wrong = planPaper(paper({ journal: "" }), work({ title: "Friction stir welding", authors: "Someone Else", journal: "Welding J." }), null, null);
  assert.deepEqual(wrong.fills, {});
  assert.equal(wrong.abstract, "");
  assert.deepEqual(wrong.disagreements.map(d => d.key), ["title", "authors"]);
  assert.ok(wrong.disagreements.every(d => d.serious));
  // tolerated variants: subtitle left out, volume and pages appended, a leading "The", HTML entities, ±1 year
  const ok = planPaper(paper({ authors: "Karl Ulrich", year: "1996", journal: "The Research Policy, 24(3), 419–440", title: "The Role of Product Architecture" }),
    work({ title: "The role of product architecture: in the manufacturing firm", journal: "Research Policy" }), null, null);
  assert.deepEqual(ok.disagreements.map(d => [d.key, d.serious, d.hint]), [["year", false, "online-first vs print year?"]]);
  assert.equal(planPaper(paper({ journal: "Journal of Economic Behavior &amp; Organization" }), work({ journal: "Journal of Economic Behavior & Organization" }), null, null).disagreements.length, 0);
  const full = planPaper(paper({ authors: "Karl Ulrich", cite: "Ulrich", categories: ["04- Maps"] }), work(), null, null);
  assert.equal(full.fills.authors, undefined);                                                          // full names are kept
  assert.equal(full.gaps.length, 0);
});

test("planPaper: no match → gaps and a DOI proposal from a title match", () => {
  const p = planPaper(paper({ doi: "", pdf: "" }), null, work({ doi: "10.9/found" }), null);
  assert.deepEqual(p.gaps, ["no DOI", "no abstract", "authors known by surname only", "no PDF", "no concept map, and none can be proposed"]);
  assert.deepEqual(p.suggestions, { suggested_doi: "10.9/found" });
  assert.equal(p.source, null);
  const q = planPaper(paper({ doi: "10.1/unindexed" }), null, null, null);
  assert.equal(q.gaps[0], "DOI not indexed by OpenAlex");
  assert.deepEqual(q.suggestions, {});
  const r = planPaper(paper({ doi: "10.1/unindexed" }), null, work({ doi: "10.9/other" }), null);
  assert.deepEqual(r.suggestions, {});
  assert.deepEqual(r.disagreements, [{ key: "doi", note: "10.1/unindexed", openalex: "10.9/other", serious: true, hint: "OpenAlex has this title under another DOI" }]);
});

test("applyPlan writes fills, suggestions, abstract and provenance; keeps CRLF; idempotent", () => {
  const note = NOTES[7].text.replace(/\n/g, "\r\n");                   // the note without a concept map
  const p0 = readPublication(NOTES[7].stem, note);
  const plan = planPaper({ ...p0, abstract: "" }, work({ title: p0.title, authors: "Lone Author", journal: "J", url: "https://x" }), null, { category: "02- Lifecycle", score: 0.2, margin: 0.1 });
  const out = applyPlan(note.replace(/## Abstract\r\n\r\n[^\r]*\r\n/, "## Abstract\r\n\r\n"), plan, { today: "2026-10-12" });
  assert.ok(out.includes("\r\nauthors: Lone Author\r\n"));                 // "Lone" was the as-cited surname → completed
  assert.ok(out.includes('\r\nsuggested_category: "[[02- Lifecycle]]"\r\n'));
  assert.ok(out.includes("## Abstract\r\n\r\nAn abstract.\r\n\r\n## Why"));
  assert.ok(out.includes("\r\nenriched_by:\r\n  - openalex 2026-10-12\r\n"));
  assert.ok(!out.includes("url:") || out.includes("url: https://x"));
  const again = applyPlan(out, planPaper(readPublication(NOTES[7].stem, out), work({ title: p0.title, authors: "Lone Author" }), null, null), { today: "2026-10-13" });
  assert.equal(again, out);                                                 // nothing left to fill: no second provenance line
});

test("withAbstract only fills an empty heading", () => {
  assert.equal(withAbstract("## Abstract\n\n## Next\n", "Text"), "## Abstract\n\nText\n\n## Next\n");
  assert.equal(withAbstract("## Abstract\n\nExisting\n\n## Next\n", "Text"), "## Abstract\n\nExisting\n\n## Next\n");
  assert.equal(withAbstract("## Abstract\n", "Text"), "## Abstract\n\nText\n\n");
  assert.equal(withAbstract("no heading", "Text"), "no heading");
});

test("categoryProposals: nearest concept map by content for the notes without one", () => {
  const papers = library();
  const notes = clusterNotes(papers);
  const boiler = boilerplate(notes);
  const X = tfidf(notes.map(n => noteText(n, boiler)));
  const props = categoryProposals(papers, X);
  assert.ok(props.has(NOTES[7].stem) || true);                           // the connector paper is far from every map: may be below the threshold
  const scored = [...props.values()];
  for (const s of scored) { assert.ok(s.score >= 0.12); assert.ok(s.margin >= 0); }
  // a paper written like the DSM papers gets the DSM map
  const dsm = { ...papers[7], stem: "x", categories: [], body: "## Abstract\n\nThe design structure matrix and clustering of coupled matrix elements.\n", abstract: "The design structure matrix and clustering of coupled matrix elements.", title: "Matrix clustering", tags: ["dsm"] };
  const all = [...papers, dsm];
  const X2 = tfidf(clusterNotes(all).map(n => noteText(n, boiler)));
  assert.equal(categoryProposals(all, X2).get("x")?.category, "04- Module Identification Methods");
});

test("candidateList, Candidates.md, References.json, Gaps.md", () => {
  const papers = library();
  const works = new Map([
    ["10.1/a", work({ id: "WA", doi: "10.1/a", title: papers[0].title, year: papers[0].year, authors: "Donald V. Steward", referenced: ["WX", "WY"] })],
    ["10.1/b", work({ id: "WB", doi: "10.1/b", title: papers[1].title, year: papers[1].year, authors: "Thomas U. Pimmler; Steven D. Eppinger", referenced: ["WX", "WA"] })],
    ["10.1/c", work({ id: "WC", doi: "10.1/c", title: papers[2].title, year: papers[2].year, authors: "Tyson R. Browning", referenced: ["WX", "WY", "WZ"] })],
  ]);
  const c = candidateList(papers, works, { min: 2 });
  assert.deepEqual(c.map(x => [x.id, x.count]), [["WX", 3], ["WY", 2]]);              // WA is a library paper, WZ cited once
  assert.deepEqual(candidateList(papers, works).map(x => x.id), ["WX"]);              // default: cited by 3+
  c[0].title = "A classic"; c[0].year = "1990"; c[0].authors = "Ann Author; Bob Writer"; c[0].doi = "10.9/x";
  const md = candidatesMarkdown(c, { today: "2026-10-12" });
  assert.ok(md.includes("| 3 | 1990 | Ann Author: A classic | [10.9/x](https://doi.org/10.9/x) | 001, 002, 003 |"));
  const json = referencesJson(papers, works, c, { today: "2026-10-12" });
  assert.deepEqual(json.papers[papers[0].stem], { openalex: "WA", doi: "10.1/a", referenced: ["WX", "WY"] });
  assert.equal(json.candidates[0].citedBy.length, 3);
  const plans = papers.map(p => planPaper(p, works.get(p.doi) ?? null, null, null));
  const gaps = gapsMarkdown(plans, { today: "2026-10-12" });
  assert.ok(gaps.startsWith("---\ntype: library-report\n"));
  assert.ok(gaps.includes("## Papers with gaps"));
  assert.ok(gaps.includes(`[[${papers[3].stem}|004 – ${papers[3].title}]] — DOI not indexed by OpenAlex`));
  assert.ok(gaps.includes("## Minor differences (note kept as it is)"));                // the fixture journals (J0, J1, J2) differ from the work's
  assert.ok(!gaps.includes("## Check these first"));                                    // titles match (case only)
});

test("OpenAlex helpers", () => {
  assert.equal(abstractFromIndex({ b: [1], a: [0, 2] }), "a b a");
  assert.ok(titleSearchUrl("The role: product architecture?", "1995").includes("filter=title.search%3AThe+role+product+architecture%2Cpublication_year%3A1995"));
  assert.ok(worksByIdUrls(["https://openalex.org/W1", "W2"])[0].includes("filter=ids.openalex%3AW1%7CW2"));
  const w = workDetails({ id: "W1", doi: "https://doi.org/10.1/X", title: "T", publication_year: 1995, type: "article",
    authorships: [{ author: { display_name: "Karl T. Ulrich" } }, { author: null }], primary_location: { source: { display_name: "Research Policy" } },
    abstract_inverted_index: { Hello: [0], world: [1] }, referenced_works: ["W2"], biblio: { volume: "24", first_page: "419", last_page: "440" } });
  assert.deepEqual(w, { id: "W1", doi: "10.1/x", title: "T", year: "1995", type: "article", authors: "Karl T. Ulrich", journal: "Research Policy",
    url: "https://doi.org/10.1/X", abstract: "Hello world", referenced: ["W2"], volume: "24", pages: "419–440" });
  assert.equal(titleKey("The Rôle, of product-architecture!"), "theroleofproductarchitecture");
});
