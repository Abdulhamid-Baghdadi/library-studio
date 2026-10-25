/**
 * Co-citation phases as use cases. An analysis is a folder in the vault's scratch area ("tmp/co-citation/<name>",
 * not in git, hidden from Obsidian) that keeps its settings and everything downloaded from OpenAlex, so a rerun
 * costs no credits:
 *   settings.json           the settings (domain/co-citation DEFAULTS) plus `outputDir` and `notePath`
 *   citing/download.json    what was downloaded: filter, search, year chunks with their pages, date, complete
 *   citing/page-….json      OpenAlex result pages of the citing set (the replica's older names page001.json … too)
 *   cited/cited-….json      metadata of the cited works; cited/requested.json lists every id asked for
 *   result.json             the last result, for the page
 *
 *   DATA_DIR, outputsFor(name)                default places
 *   listAnalyses(folder, dataDir)             names of the analyses, sorted
 *   readAnalysis(folder, dir)                 { settings, download, pages, result }
 *   saveAnalysisSettings(folder, dir, settings)
 *   subfieldsOf(folder, dir, settings)        [[subfield, papers]] of the downloaded set (for the subfield filter)
 *   downloadCitingSet(folder, http, dir, settings, { mailto, today, onProgress, fresh, signal })
 *       → { count, pages, done, works, complete, incomplete }. Pages of 200 works; each request is a search and
 *       costs 10 credits. Resumes where the last download stopped; a search with more than 10,000 results is
 *       split into year ranges. When the daily budget runs out, or `signal` (an AbortSignal) is aborted, it keeps
 *       the pages so far (incomplete). onProgress(text, { count, pages, done }) before each page.
 *   downloadState(download, settings)        { status: "none" | "partial" | "complete" | "changed", done, pages, credits }
 *   runCoCitation(folder, library, dir, settings, { name, http, mailto, clock, onStep, write })
 *       looks up the cited works it still needs (1 credit per 100), analyses, and writes the VOSviewer files, the
 *       figure, the evidence-synthesis note and result.json → the result for the page (without the full
 *       co-citation lists), with `files`, `download`, `incomplete`
 * @module services/co-citation
 */
import { citedRecord, citingRecords, normalizeSettings, subfieldCounts } from "../domain/co-citation.js";
import { analyzeCoCitation, prepareCoCitation, STEPS } from "../domain/co-citation-analysis.js";
import { figureSvg, GENERATED_MARK, noteMarkdown } from "../domain/co-citation-notes.js";
import { citedWorksUrls, citingFilter, citingPageUrl, MAX_RESULTS, PER_PAGE, searchProblem } from "../domain/openalex.js";
import { compareCodePoints } from "../domain/text-rules.js";
import { vosviewerFiles } from "../domain/vosviewer.js";
import { getJson, OpenAlexBudgetError } from "./openalex-works.js";

export const DATA_DIR = "tmp/co-citation";
const PROJECT = "01 - Project 1 - PhD Overview";
export const outputsFor = name => ({
  outputDir: `${PROJECT}/02 - Outputs/${name} - co-citation`,
  notePath: `${PROJECT}/03 - Evidence synthesis/${name} - co-citation phases.md`,
});
const CREDITS_PER_SEARCH = 10;
const PAGE_FILE = /^page.*\.json$/, CITED_FILE = /^cited.*\.json$/;
const pad = n => String(n).padStart(3, "0");

const readJson = async (folder, path, fallback = null) => {
  if (!(await folder.exists(path))) return fallback;
  try { return JSON.parse(await folder.readText(path)); } catch { return fallback; }
};
const writeJson = (folder, path, data) => folder.writeText(path, JSON.stringify(data));

export async function listAnalyses(folder, dataDir = DATA_DIR) {
  const out = [];
  for (const name of await folder.list(dataDir)) if (await folder.isDirectory(`${dataDir}/${name}`)) out.push(name);
  return out.sort(compareCodePoints);
}

export async function readAnalysis(folder, dir) {
  const settings = await readJson(folder, `${dir}/settings.json`, {});
  const download = await readJson(folder, `${dir}/citing/download.json`);
  const pages = (await folder.list(`${dir}/citing`)).filter(f => PAGE_FILE.test(f)).length;
  return { settings, download, pages, result: await readJson(folder, `${dir}/result.json`) };
}

export async function saveAnalysisSettings(folder, dir, settings) {
  await folder.makeDir(dir);
  await folder.writeText(`${dir}/settings.json`, JSON.stringify(settings, null, 2));
}

async function readPages(folder, dir) {
  const names = (await folder.list(`${dir}/citing`)).filter(f => PAGE_FILE.test(f)).sort(compareCodePoints);
  const pages = [];
  for (const f of names) pages.push(JSON.parse(await folder.readText(`${dir}/citing/${f}`)));
  return pages;
}

export async function subfieldsOf(folder, dir, settings) {
  return subfieldCounts(citingRecords(await readPages(folder, dir)), settings);
}

/** The key that says whether a download belongs to these settings: the filter without the years, and the years. */
const downloadKey = s => ({ filter: citingFilter({ ...s, from: "Y", to: "Y" }), from: s.from, to: s.to });

/** Where the download of an analysis stands, for the page: nothing yet, part of it, all of it, or for another search. */
export function downloadState(download, settings, pages = 0) {
  if (!download) return { status: pages ? "complete" : "none", done: pages, pages, credits: 0, recorded: false };
  const key = downloadKey(normalizeSettings(settings));
  const chunks = download.chunks ?? [];
  const done = chunks.reduce((a, c) => a + c.done, 0), total = chunks.reduce((a, c) => a + c.pages, 0);
  const changed = download.key?.filter !== key.filter || download.key?.from !== key.from || download.key?.to !== key.to;
  const status = changed ? "changed" : download.complete ? "complete" : "partial";
  return { status, done, pages: total, credits: download.complete ? 0 : Math.max(10, (total - done) * CREDITS_PER_SEARCH), recorded: true, date: download.date, works: download.works ?? 0 };
}

class Stopped extends Error {}

export async function downloadCitingSet(folder, http, dir, settings, { mailto = "", today = "", onProgress = () => {}, fresh = false, signal = null } = {}) {
  const s = normalizeSettings(settings);
  const problem = searchProblem(s.query);
  if (problem) throw new Error(problem);
  if (s.from > s.to) throw new Error("The first year is after the last year.");
  const key = downloadKey(s);
  const statePath = `${dir}/citing/download.json`;
  let state = await readJson(folder, statePath);
  if (fresh || !state || state.key?.filter !== key.filter || state.key?.from !== key.from || state.key?.to !== key.to) {
    for (const f of await folder.list(`${dir}/citing`)) if (PAGE_FILE.test(f)) await folder.remove(`${dir}/citing/${f}`);
    state = { key, query: s.query, filter: citingFilter(s), date: today, chunks: [{ from: s.from, to: s.to, count: null, pages: 0, done: 0 }], complete: false };
  }
  await folder.makeDir(`${dir}/citing`);
  const save = () => writeJson(folder, statePath, state);
  const totals = () => {
    const known = state.chunks.filter(c => c.count != null);
    return { count: known.reduce((a, c) => a + c.count, 0), pages: known.reduce((a, c) => a + c.pages, 0), done: state.chunks.reduce((a, c) => a + c.done, 0) };
  };
  let incomplete = "";
  try {
    for (let k = 0; k < state.chunks.length; k++) {
      const chunk = state.chunks[k];
      const filter = citingFilter({ ...s, from: chunk.from, to: chunk.to });
      const fetchPage = async page => {
        if (signal?.aborted) throw new Stopped();
        const t = totals();
        onProgress(`Downloading the citing papers: page ${t.done + 1}${t.pages ? ` of ${t.pages}` : ""} (${chunk.from}–${chunk.to})…`, t);
        const json = await getJson(http, citingPageUrl(filter, page, { mailto }));
        if (!json) throw new Error("OpenAlex did not find the search (404).");
        return json;
      };
      if (chunk.count == null) {
        const first = await fetchPage(1);
        const count = Number(first.meta?.count) || 0;
        if (count > MAX_RESULTS) {
          if (chunk.from === chunk.to) throw new Error(`${count.toLocaleString("en")} works match in ${chunk.from} alone; OpenAlex lists at most 10,000 per search. Narrow the search, the fields or the document types.`);
          const mid = Math.floor((chunk.from + chunk.to) / 2);
          state.chunks.splice(k, 1, { from: chunk.from, to: mid, count: null, pages: 0, done: 0 }, { from: mid + 1, to: chunk.to, count: null, pages: 0, done: 0 });
          await save();
          k--;
          continue;
        }
        Object.assign(chunk, { count, pages: Math.ceil(count / PER_PAGE), done: 0 });
        if (count) await writeJson(folder, `${dir}/citing/page-${chunk.from}-${chunk.to}-${pad(1)}.json`, first.results ?? []);
        chunk.done = count ? 1 : 0;
        await save();
      }
      while (chunk.done < chunk.pages) {
        const json = await fetchPage(chunk.done + 1);
        await writeJson(folder, `${dir}/citing/page-${chunk.from}-${chunk.to}-${pad(chunk.done + 1)}.json`, json.results ?? []);
        chunk.done++;
        await save();
      }
    }
    state.complete = true;
  } catch (e) {
    if (!(e instanceof OpenAlexBudgetError) && !(e instanceof Stopped)) { await save(); throw e; }
    const t = totals();
    const why = e instanceof Stopped ? "Stopped." : e.message;
    incomplete = `Downloaded ${t.done} of ${t.pages || "?"} pages; the pages so far are kept. ${why} Download again to continue where it stopped (about ${(Math.max(0, t.pages - t.done)) * CREDITS_PER_SEARCH} credits left).`;
  }
  state.date = today || state.date;
  const t = totals();
  state.works = citingRecords(await readPages(folder, dir)).length;
  await save();
  return { ...t, works: state.works, complete: state.complete, incomplete };
}

async function readMeta(folder, dir) {
  const meta = new Map();
  for (const f of (await folder.list(`${dir}/cited`)).filter(f => CITED_FILE.test(f)).sort(compareCodePoints)) {
    for (const w of JSON.parse(await folder.readText(`${dir}/cited/${f}`)) ?? []) { const r = citedRecord(w); meta.set(r.id, r); }
  }
  const requested = new Set((await readJson(folder, `${dir}/cited/requested.json`, [])).map(id => String(id).split("/").pop()));
  return { meta, requested };
}

/** Looks up the cited works not asked for yet, 100 per request; returns a message when the budget ran out. */
async function fetchMeta(folder, http, dir, ids, { meta, requested, mailto, onStep }) {
  const need = ids.filter(id => !requested.has(id) && !meta.has(id));
  if (!need.length) return "";
  await folder.makeDir(`${dir}/cited`);
  let n = (await folder.list(`${dir}/cited`)).filter(f => CITED_FILE.test(f)).length;
  try {
    for (let i = 0; i < need.length; i += 100) {
      const batch = need.slice(i, i + 100);
      onStep(2, STEPS[1], `${Math.min(i + 100, need.length)} of ${need.length} works (1 credit per 100)`);
      const json = await getJson(http, citedWorksUrls(batch, { mailto })[0]);
      const results = json?.results ?? [];
      await writeJson(folder, `${dir}/cited/cited-${pad(++n)}.json`, results);
      for (const w of results) { const r = citedRecord(w); meta.set(r.id, r); }
      for (const id of batch) requested.add(id);
      await writeJson(folder, `${dir}/cited/requested.json`, [...requested].sort(compareCodePoints));
    }
  } catch (e) {
    if (!(e instanceof OpenAlexBudgetError)) throw e;
    return `Some cited works could not be looked up, so they are left out of the maps. ${e.message}`;
  }
  return "";
}

export async function runCoCitation(folder, library, dir, rawSettings, { name, http = null, mailto = "", clock, onStep = () => {}, write = true }) {
  const settings = normalizeSettings(rawSettings);
  const { outputDir, notePath } = { ...outputsFor(name), ...pick(rawSettings, ["outputDir", "notePath"]) };
  if (write && (await folder.exists(notePath)) && !(await folder.readText(notePath)).includes(GENERATED_MARK)) {
    throw new Error(`"${notePath}" exists and was not written by this tool. Choose another note path in the settings, or rename that note.`);
  }
  onStep(1, STEPS[0], "reading the downloaded pages");
  const pages = await readPages(folder, dir);
  if (!pages.length) throw new Error("No citing papers downloaded yet. Download them first (Citing papers → Download).");
  const download = await readJson(folder, `${dir}/citing/download.json`);
  const prepared = prepareCoCitation(citingRecords(pages), settings);
  if (!prepared.papers.length) throw new Error("No citing paper passes the filters. Check the years, the core-sources switch and the subfields.");
  onStep(1, STEPS[0], `${prepared.papers.length} citing papers`);

  const { meta, requested } = await readMeta(folder, dir);
  const need = prepared.candidates.filter(id => !requested.has(id) && !meta.has(id)).length;
  onStep(2, STEPS[1], need ? `${need} works to look up` : "all known");
  let incomplete = need && http ? await fetchMeta(folder, http, dir, prepared.candidates, { meta, requested, mailto, onStep }) : "";
  if (need && !http) incomplete = `${need} cited works have not been looked up (no connection to OpenAlex); they are left out of the maps.`;

  const result = analyzeCoCitation(prepared, meta, { requested, library: library.papers, onStep });
  const today = clock.today();
  const dl = download ? {
    query: download.query, filter: download.filter, date: download.date, works: download.works, complete: download.complete,
    differs: download.key?.filter !== citingFilter({ ...settings, from: "Y", to: "Y" }),
  } : null;
  const figure = `${name} - phases.svg`;
  const files = [];
  if (write) {
    onStep(6, STEPS[5], outputDir);
    await folder.makeDir(outputDir);
    for (const f of await folder.list(outputDir)) if (/^(map|network) - \d+ - .*\.txt$/.test(f)) await folder.remove(`${outputDir}/${f}`);
    for (const f of vosviewerFiles(result)) { await folder.writeText(`${outputDir}/${f.name}`, f.text); files.push(`${outputDir}/${f.name}`); }
    await folder.writeText(`${outputDir}/${figure}`, figureSvg(result, { name, today }));
    files.push(`${outputDir}/${figure}`);
    await folder.makeDir(notePath.split("/").slice(0, -1).join("/"));
    await folder.writeText(notePath, noteMarkdown(result, { name, today, figure, figurePath: `${outputDir}/${figure}`, vosDir: outputDir, dataDir: dir, download: dl }));
    files.push(notePath);
  }
  const view = {
    ...result, scopes: result.scopes.map(({ cocit, ...rest }) => rest),
    name, finished: clock.now(), download: dl, incomplete, files, outputDir, notePath,
  };
  if (write) await writeJson(folder, `${dir}/result.json`, view);
  return view;
}

const pick = (o, keys) => Object.fromEntries(keys.filter(k => o?.[k]).map(k => [k, String(o[k]).trim().replace(/[\\/]+$/, "")]));
