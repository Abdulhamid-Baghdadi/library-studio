import { test } from "node:test";
import assert from "node:assert/strict";
import {
  candidateIds, citationCounts, citedRecord, citingRecords, citingSet, cleaning, coCitations, countScopes, MERTENS_2023,
  normalizeSettings, parseCorrections, phaseOf, scopesOf, subfieldCounts, workLabel,
} from "../../src/domain/co-citation.js";
import { analyzeCoCitation, prepareCoCitation } from "../../src/domain/co-citation-analysis.js";
import { figureSvg, noteMarkdown, perspectiveName } from "../../src/domain/co-citation-notes.js";
import { citingFilter, citingPageUrl, searchProblem } from "../../src/domain/openalex.js";
import { citedWorks, citingWorks, SETTINGS } from "./fixtures/co-citation.js";

const metaOf = ids => new Map(citedWorks(ids).map(w => [citedRecord(w).id, citedRecord(w)]));

test("settings: defaults 45 / 17 / 10, phases sorted, scopes all years first", () => {
  const s = normalizeSettings({ phases: [{ name: "B", from: 2010, to: 2020 }, { from: 1990, to: 2009 }, { from: 2030, to: 2020 }] });
  assert.deepEqual([s.overallThreshold, s.phaseThreshold, s.linkThreshold], [45, 17, 10]);
  assert.deepEqual(s.phases.map(p => p.from), [1990, 2010], "a phase that ends before it starts is dropped");
  const scopes = scopesOf({ ...s, from: 1990, to: 2020 });
  assert.deepEqual(scopes.map(x => `${x.phase} ${x.name} ${x.threshold}`), ["All years 1990–2020 45", "Phase 1 1990–2009 17", "B 2010–2020 17"]);
  assert.equal(phaseOf(2009, s.phases), 0);
  assert.equal(phaseOf(2025, s.phases), -1);
});

test("citing set: one record per work, with references, in the years, core sources and kept subfields only", () => {
  const works = citingWorks();
  const copy = { ...works[0], publication_year: 2001 };
  const records = citingRecords([works.slice(0, 30), [copy, ...works.slice(30)]]);
  assert.equal(records.length, works.length, "the copy replaces the first record in place");
  assert.equal(records[0].year, 2001);
  assert.equal(records[0].id, "W90001");
  const papers = citingSet(citingRecords([works]), SETTINGS);
  assert.equal(papers.length, 46);
  assert.equal(papers.filter(p => p.phase === 0).length, 20);
  assert.equal(papers.filter(p => p.phase === 1).length, 26);
  assert.deepEqual(subfieldCounts(citingRecords([works]), SETTINGS), [["Mechanical Engineering", 46], ["Nursing", 1]]);
  assert.equal(citingSet(citingRecords([works]), { ...SETTINGS, coreOnly: false, subfields: [] }).length, 48);
});

test("citation counts per scope, and the works whose titles are needed (90 % of a threshold)", () => {
  const papers = citingSet(citingRecords([citingWorks()]), SETTINGS);
  const counts = citationCounts(papers, 2);
  assert.deepEqual(counts.get("W1").cites, [25, 10, 15]);
  assert.deepEqual(counts.get("W99").cites, [5, 0, 5]);
  assert.equal(counts.get("W1").yearSum, [...papers].filter(p => p.refs.includes("W1")).reduce((a, p) => a + p.year, 0));
  assert.deepEqual(candidateIds(papers, SETTINGS), ["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8", "W99"]);
  assert.deepEqual(candidateIds(papers, { ...SETTINGS, phaseThreshold: 7 }), ["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8"], "W99 has 5 < floor(0.9 × 7)");
});

test("corrections: merge, drop and label lines, comments, and what is not understood", () => {
  const c = parseCorrections("# a comment\nmerge W1 https://openalex.org/W2\ndrop W3 W4   # catch-all records\nlabel W5 Pahl & Beitz 1984\nlabel W6 Anon\nmerge W7\nswap W8\n");
  assert.deepEqual(c.merge, [["W1", "W2"]]);
  assert.deepEqual([...c.drop], ["W3", "W4"]);
  assert.deepEqual(c.label.get("W5"), { label: "Pahl & Beitz 1984", year: 1984 });
  assert.deepEqual(c.label.get("W6"), { label: "Anon", year: 0 });
  assert.deepEqual(c.errors.map(e => e.line), [6, 7]);
});

test("labels: authors as cited", () => {
  assert.equal(workLabel({ authors: ["Karl T. Ulrich"], year: 1995 }), "Ulrich 1995");
  assert.equal(workLabel({ authors: ["Carliss Y. Baldwin", "Kim B. Clark"] }, 2000), "Baldwin & Clark 2000");
  assert.equal(workLabel({ authors: ["A. Liu", "B. Wang", "C. Li"], year: 2024 }), "Liu et al. 2024");
  assert.equal(workLabel({ authors: [], source: "Harvard Business Review", year: 1994 }), "Harvard Business Review 1994");
});

test("cleaning: editions merge by title, subtitles by year and first author; deleted records drop", () => {
  const papers = citingSet(citingRecords([citingWorks()]), SETTINGS);
  const meta = metaOf(["W1", "W2", "W5", "W10", "W11"]);
  // an edition of W1 with another year, cited more
  meta.set("W12", { ...meta.get("W1"), id: "W12", year: 2003, authors: [] });
  const more = [...papers, ...Array.from({ length: 30 }, (_, i) => ({ id: `X${i}`, year: 2001, phase: 0, refs: ["W12"] }))];
  // another author's paper with a title that starts the same way is not merged by the subtitle rule
  meta.set("W13", { ...meta.get("W5"), id: "W13", title: "Product families and platforms in the automotive industry", authors: ["Other Person"] });
  const c = cleaning(meta, more, { candidates: ["W1", "W99", "W98"], requested: ["W99"], corrections: "drop W2\nlabel W5 Meyer 1997b" });
  assert.equal(c.canon.get("W1"), "W12", "the most-cited record is kept");
  assert.equal(c.canon.get("W11"), "W10", "same year, same first author, one title plus a subtitle; tie → lower id");
  assert.equal(c.canon.get("W13"), undefined);
  assert.deepEqual([...c.drop], [["W2", "correction"], ["W99", "not in OpenAlex"]]);
  assert.deepEqual(c.missing, ["W98"], "a candidate never looked up is missing, not dropped");
  assert.deepEqual(c.labels.get("W12"), { label: "Ulrich 1995", year: 1995 }, "the authors of the most-cited record that has any, the earliest year");
  assert.deepEqual(c.labels.get("W5"), { label: "Meyer 1997b", year: 1997 });
});

test("co-citations: one per citing paper that cites both, pairs in order of first occurrence", () => {
  const index = new Map([["A", 0], ["B", 1], ["C", 2]]);
  const pairs = coCitations([new Set(["C", "A"]), new Set(["A", "B", "C", "Z"]), new Set(["B"])], index);
  assert.deepEqual(pairs, [[0, 2, 2], [0, 1, 1], [1, 2, 1]]);
});

test("counts per scope: time slices by citing year, thresholds per scope, works without a title left out", () => {
  const papers = citingSet(citingRecords([citingWorks()]), SETTINGS);
  const meta = metaOf(["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8"]);
  const clean = cleaning(meta, papers, { candidates: candidateIds(papers, SETTINGS), requested: [] });
  const r = countScopes(papers, meta, SETTINGS, clean);
  assert.deepEqual(r.ids, ["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8"]);
  assert.deepEqual(r.missing, ["W99"]);
  assert.deepEqual(r.scopes.map(s => [s.citing, s.nodes.length]), [[46, 8], [20, 8], [26, 8]]);
  const pair = (s, a, b) => r.scopes[s].cocit.find(([x, y]) => x === a && y === b)?.[2] ?? 0;
  assert.deepEqual([pair(0, 0, 1), pair(1, 0, 1), pair(2, 0, 1)], [20, 10, 10]);
  assert.deepEqual([pair(0, 0, 4), pair(1, 0, 4), pair(2, 0, 4)], [5, 0, 5], "the bridge papers are all in the late phase");
  assert.equal(r.scopes[0].refsAvg, papers.reduce((a, p) => a + p.refs.length, 0) / papers.length);
});

test("analysis: two perspectives, shared positions, links and density, shares that go to the other perspective", () => {
  const prepared = prepareCoCitation(citingRecords([citingWorks()]), SETTINGS);
  const meta = metaOf(prepared.candidates);
  const library = [{ no: 5, stem: "005 - 1995 - Ulrich - Modularity in Design", doi: "", title: "Modularity in design" }];
  const r = analyzeCoCitation(prepared, meta, { requested: prepared.candidates, library });
  assert.equal(r.perspectives.length, 2);
  const [a, b] = [r.nodes.find(n => n.id === "W1").persp, r.nodes.find(n => n.id === "W5").persp];
  assert.notEqual(a, b);
  assert.ok(r.nodes.filter(n => ["W2", "W3", "W4"].includes(n.id)).every(n => n.persp === a));
  assert.deepEqual(r.nodes.find(n => n.id === "W1").lib, { no: 5, stem: library[0].stem });
  const all = r.scopes[0];
  assert.equal(all.links.length, 13);
  assert.equal(all.density, 13 / 28);
  assert.ok(Math.abs(all.outShare[a] - 5 / 245) < 1e-12, "W1–W5 is 5 of group A's 245 (pairs inside A count at both ends)");
  assert.equal(r.scopes[1].outShare[a], 0, "no bridge in the early phase");
  assert.deepEqual(r.cleaning.dropped.map(d => [d.id, d.why]), [["W99", "not in OpenAlex"]]);
  assert.equal(perspectiveName(r.perspectives.find(p => p.k === a)), "Around Ulrich 1995");
  const again = analyzeCoCitation(prepared, meta, { requested: prepared.candidates });
  assert.deepEqual(again.nodes.map(n => [n.x, n.y]), r.nodes.map(n => [n.x, n.y]), "the same input gives the same map");
  const s2 = { ...SETTINGS, perspectives: [{ anchor: "W6", name: "Platforms" }] };
  const p2 = analyzeCoCitation(prepareCoCitation(citingRecords([citingWorks()]), s2), meta, { requested: prepared.candidates });
  const platforms = p2.perspectives.find(p => p.name === "Platforms");
  assert.equal(platforms.anchor, "W6");
  assert.equal(platforms.slot, 0, "a named perspective takes the first colour");
});

test("note and figure describe the result", () => {
  const prepared = prepareCoCitation(citingRecords([citingWorks()]), SETTINGS);
  const r = analyzeCoCitation(prepared, metaOf(prepared.candidates), { requested: prepared.candidates });
  const note = noteMarkdown(r, { name: "Test", today: "2026-10-25", figure: "Test - phases.svg", download: null });
  assert.match(note, /^---\ntype: evidence-synthesis\ngenerated-by: Library Studio \(co-citation phases\)\ngenerated: 2026-10-25\n---/);
  assert.match(note, /46 citing papers · 8 works in the all-years map · 2 clusters · density 0\.464 · works per phase 8 \/ 8/);
  assert.match(note, /!\[\[Test - phases\.svg\]\]/);
  assert.match(note, /\| Early \| 2000–2004 \| 20 \|/);
  assert.match(note, /Dropped, no longer in OpenAlex.*W99 \(cited 5 times\)/);
  const svg = figureSvg(r, { name: "Test", today: "2026-10-25" });
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.equal((svg.match(/<rect x=/g) ?? []).length, 2, "one panel per phase");
});

test("OpenAlex: the citing set's filter is the replica's, and searches OpenAlex cannot take are caught", () => {
  assert.equal(citingFilter(normalizeSettings(MERTENS_2023)),
    "title_abstract_keywords.search.exact:" + MERTENS_2023.query + ",publication_year:1990-2020,type:article|review|book-chapter,language:en,primary_topic.field.id:fields/22|fields/14|fields/18|fields/17|fields/20");
  const url = new URL(citingPageUrl("x:y", 3));
  assert.deepEqual([url.searchParams.get("page"), url.searchParams.get("per-page"), url.searchParams.has("cursor")], ["3", "200", false]);
  assert.equal(searchProblem("modular AND product"), "");
  assert.match(searchProblem("modular, product"), /comma/);
  assert.match(searchProblem("(modular AND product"), /brackets/);
  assert.match(searchProblem('"product platform'), /quotation/);
  assert.match(searchProblem(""), /Write a search/);
});
