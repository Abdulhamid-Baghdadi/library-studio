import { test } from "node:test";
import assert from "node:assert/strict";
import { memoryFolder } from "../../src/adapters/memory-folder.js";
import { downloadCitingSet, downloadState, listAnalyses, openLibrary, readAnalysis, runCoCitation, saveAnalysisSettings, subfieldsOf } from "../../src/index.js";
import { citedWorks, citingWorks, SETTINGS } from "./fixtures/co-citation.js";
import { files } from "./fixtures/library.js";

const DIR = "tmp/co-citation/Test";
const clock = { today: () => "2026-10-25", now: () => "2026-10-25 22:00", iso: () => "2026-10-25T22:00:00.000Z" };
const reply = (status, body = {}, headers = {}) => ({ status, header: n => headers[n] ?? null, json: async () => body });

/**
 * A fake OpenAlex: citing-set searches page through `works` (200 a page) for the years in the filter; `tooMany`
 * reports more than 10,000 results for a range wider than that many years; `budgetAfter` answers 429 (daily
 * budget used up) after that many requests. Cited-work lookups answer from the fixture.
 */
function fakeOpenAlex(works, { tooMany = Infinity, budgetAfter = Infinity } = {}) {
  const calls = [];
  return {
    calls,
    get: async url => {
      const q = new URL(url).searchParams;
      calls.push(q.get("filter"));
      if (calls.length > budgetAfter) return reply(429, {}, { "Retry-After": "40000" });
      const filter = q.get("filter");
      if (filter.startsWith("ids.openalex:")) return reply(200, { results: citedWorks(filter.slice(13).split("|")) });
      const [, from, to] = /publication_year:(\d+)-(\d+)/.exec(filter).map(Number);
      const hits = works.filter(w => w.publication_year >= from && w.publication_year <= to);
      const page = Number(q.get("page")), per = Number(q.get("per-page"));
      const count = to - from + 1 > tooMany ? 12_000 : hits.length;
      return reply(200, { meta: { count }, results: hits.slice((page - 1) * per, page * per) });
    },
  };
}

/** 450 citing works, 45 a year, 2000–2009. */
const many = () => Array.from({ length: 450 }, (_, i) => ({ id: `https://openalex.org/W${70000 + i}`, publication_year: 2000 + (i % 10), referenced_works: [] }));

test("download: pages of 200, one search request each, then nothing left to fetch", async () => {
  const folder = memoryFolder();
  const http = fakeOpenAlex(many());
  const r = await downloadCitingSet(folder, http, DIR, SETTINGS, { today: "2026-10-25" });
  assert.deepEqual([r.count, r.pages, r.done, r.works, r.complete, r.incomplete], [450, 3, 3, 450, true, ""]);
  assert.equal(http.calls.length, 3);
  assert.deepEqual(await folder.list(`${DIR}/citing`), ["download.json", "page-2000-2009-001.json", "page-2000-2009-002.json", "page-2000-2009-003.json"]);
  const again = await downloadCitingSet(folder, http, DIR, SETTINGS);
  assert.equal(http.calls.length, 3, "a finished download is not fetched again");
  assert.equal(again.complete, true);
  const a = await readAnalysis(folder, DIR);
  assert.equal(a.pages, 3);
  assert.equal(a.download.query, SETTINGS.query);
  assert.deepEqual([downloadState(a.download, SETTINGS).status, downloadState(a.download, { ...SETTINGS, to: 2010 }).status], ["complete", "changed"]);
  assert.equal(downloadState(null, SETTINGS, 3).status, "complete", "older data without a record of its search");
  assert.equal(downloadState(null, SETTINGS).status, "none");
});

test("download: when the daily budget runs out the pages so far are kept, and the next download continues", async () => {
  const folder = memoryFolder();
  const first = await downloadCitingSet(folder, fakeOpenAlex(many(), { budgetAfter: 1 }), DIR, SETTINGS);
  assert.equal(first.complete, false);
  assert.match(first.incomplete, /Downloaded 1 of 3 pages; the pages so far are kept\. OpenAlex's free daily budget is used up .*\(about 20 credits left\)/);
  const partial = downloadState((await readAnalysis(folder, DIR)).download, SETTINGS);
  assert.deepEqual([partial.status, partial.done, partial.pages, partial.credits], ["partial", 1, 3, 20]);
  const http = fakeOpenAlex(many());
  const second = await downloadCitingSet(folder, http, DIR, SETTINGS);
  assert.equal(second.complete, true);
  assert.equal(http.calls.length, 2, "only pages 2 and 3");
  assert.equal(second.works, 450);
  const stop = new AbortController();
  const third = await downloadCitingSet(memoryFolder(), fakeOpenAlex(many()), DIR, SETTINGS, { signal: stop.signal, onProgress: (m, t) => { if (t.done === 1) stop.abort(); } });
  assert.match(third.incomplete, /^Downloaded 2 of 3 pages; the pages so far are kept\. Stopped\./, "a stop asked for during page 2 takes effect before page 3");
});

test("download: more than 10,000 results are split into year ranges; a changed search starts again", async () => {
  const folder = memoryFolder();
  const http = fakeOpenAlex(many(), { tooMany: 5 });
  const r = await downloadCitingSet(folder, http, DIR, SETTINGS);
  assert.equal(r.complete, true);
  assert.equal(r.works, 450);
  const names = (await folder.list(`${DIR}/citing`)).filter(f => f.startsWith("page"));
  assert.deepEqual(names, ["page-2000-2004-001.json", "page-2000-2004-002.json", "page-2005-2009-001.json", "page-2005-2009-002.json"]);
  const changed = fakeOpenAlex(many().slice(0, 10));
  await downloadCitingSet(folder, changed, DIR, { ...SETTINGS, query: "modular AND electronics" });
  assert.deepEqual((await folder.list(`${DIR}/citing`)).filter(f => f.startsWith("page")), ["page-2000-2009-001.json"], "the old pages are removed");
  await assert.rejects(downloadCitingSet(folder, changed, DIR, { ...SETTINGS, query: "modular, electronics" }), /comma/);
  await assert.rejects(downloadCitingSet(folder, fakeOpenAlex(many(), { tooMany: 0 }), DIR, { ...SETTINGS, from: 2003, to: 2003, query: "x" }), /in 2003 alone/);
});

async function vaultWithDownload() {
  const folder = memoryFolder(files("00 - Library/Publication Summary"));
  await saveAnalysisSettings(folder, DIR, SETTINGS);
  await downloadCitingSet(folder, fakeOpenAlex(citingWorks()), DIR, SETTINGS, { today: "2026-10-25" });
  return folder;
}

test("run: looks up the cited works once, writes the VOSviewer files, the figure, the note and the result", async () => {
  const folder = await vaultWithDownload();
  assert.deepEqual(await listAnalyses(folder), ["Test"]);
  assert.deepEqual((await subfieldsOf(folder, DIR, SETTINGS))[0], ["Mechanical Engineering", 46]);
  const library = await openLibrary(folder);
  const http = fakeOpenAlex([]);
  const steps = [];
  const r = await runCoCitation(folder, library, DIR, SETTINGS, { name: "Test", http, clock, onStep: n => steps.push(n) });
  assert.deepEqual([...new Set(steps)], [1, 2, 3, 4, 5, 6]);
  assert.equal(http.calls.length, 1, "nine candidates: one lookup of up to 100");
  assert.deepEqual(JSON.parse(await folder.readText(`${DIR}/cited/requested.json`)), ["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8", "W99"]);
  assert.equal(r.incomplete, "");
  assert.deepEqual(r.scopes.map(s => s.nodes.length), [8, 8, 8]);
  assert.equal(r.scopes[0].cocit, undefined, "the page's copy leaves out the full co-citation lists");
  const out = "01 - Project 1 - PhD Overview/02 - Outputs/Test - co-citation";
  assert.deepEqual(await folder.list(out), ["Test - phases.svg",
    "map - 0 - all years 2000-2009.txt", "map - 1 - early 2000-2004.txt", "map - 2 - late 2005-2009.txt",
    "network - 0 - all years 2000-2009.txt", "network - 1 - early 2000-2004.txt", "network - 2 - late 2005-2009.txt"]);
  const note = await folder.readText("01 - Project 1 - PhD Overview/03 - Evidence synthesis/Test - co-citation phases.md");
  assert.match(note, /generated-by: Library Studio \(co-citation phases\)/);
  assert.match(note, /\*\*Downloaded\*\* on 2026-10-25: 49 works/);
  assert.deepEqual(JSON.parse(await folder.readText(`${DIR}/result.json`)).scopes.map(s => s.citing), [46, 20, 26]);

  const again = fakeOpenAlex([]);
  await runCoCitation(folder, library, DIR, SETTINGS, { name: "Test", http: again, clock });
  assert.equal(again.calls.length, 0, "a rerun needs no credits");
});

test("run: never overwrites a note it did not write; a used-up budget leaves the unknown works out and says so", async () => {
  const folder = await vaultWithDownload();
  const library = await openLibrary(folder);
  const notePath = "Notes/Mine.md";
  await folder.writeText(notePath, "# My own reading\n");
  await assert.rejects(runCoCitation(folder, library, DIR, { ...SETTINGS, notePath }, { name: "Test", http: fakeOpenAlex([]), clock }), /was not written by this tool/);
  assert.equal(await folder.readText(notePath), "# My own reading\n");

  const r = await runCoCitation(folder, library, DIR, SETTINGS, { name: "Test", http: fakeOpenAlex([], { budgetAfter: 0 }), clock });
  assert.match(r.incomplete, /could not be looked up/);
  assert.equal(r.nodes.length, 0);
  assert.equal(r.cleaning.missing.length, 9);
  const dry = await runCoCitation(memoryFolder(), library, DIR, SETTINGS, { name: "Test", clock }).catch(e => e.message);
  assert.match(dry, /No citing papers downloaded yet/);
});
