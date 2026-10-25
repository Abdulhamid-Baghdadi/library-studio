// Co-citation phases: which works a body of literature cites together, per phase of citing years (Mertens et al.
// 2023). Settings and the OpenAlex download on the left; the result as an interactive phase view, a table of the
// works, the data and cleaning, and the run log on the right. Each analysis lives in "<co-citation data folder>/<name>".
import {
  CO_CITATION_DEFAULTS, CO_CITATION_STEPS, downloadState, MERTENS_2023, OPENALEX_FIELDS, outputsFor, parseCorrections,
  perspectiveName, perspectiveOrder, searchProblem,
} from "../../src/index.js";
import { $, btn, busy, card, confirmBox, empty, h, modal, pill, savedIn, segmented, toast } from "../ui.js";
import { CO_HELP } from "../help.js";

const recall = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const remember = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private window */ } };
const fmt = n => Number(n ?? 0).toLocaleString("en-GB");
const count = (n, one, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;
const pct = x => (x == null ? "—" : `${Math.round(x * 100)} %`);
const NS = "http://www.w3.org/2000/svg";
const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Page state, kept across renders; reset when another vault is opened. */
const ST = { vault: null, ready: false, loading: false, analyses: [], name: null, A: null, subfields: [], tab: recall("cc_tab", "phases"), saveTimer: null };
const RUN = { running: false, step: 0, details: {}, log: [], started: 0, code: null, timer: null };
const DL = { running: false, text: "" };
const V = { s: 0, mode: recall("cc_mode", "persp"), sel: null, hl: null, hlLock: null, persp: null, q: "", timer: null };

// ---------------------------------------------------------------- tooltip help (the same as cluster discovery)
const tip = () => $("#tip");
function showTip(e, text) { tip().textContent = text; tip().classList.add("on"); moveTip(e); }
function moveTip(e) { const t = tip(); const x = e.clientX ?? e.target.getBoundingClientRect().left, y = e.clientY ?? e.target.getBoundingClientRect().bottom; t.style.left = Math.min(x + 14, innerWidth - 340) + "px"; t.style.top = (y + 14) + "px"; }
function hideTip() { tip().classList.remove("on"); }
const q = (key, label) => h("button", { type: "button", class: "q", "aria-label": `Help: ${label}`, onmouseenter: e => showTip(e, CO_HELP[key]), onmousemove: moveTip, onmouseleave: hideTip,
  onfocus: e => showTip(e, CO_HELP[key]), onblur: hideTip, onclick: e => showTip(e, CO_HELP[key]) }, "?");

export const coCitation = {
  id: "co-citation", title: "Co-citation phases", icon: "🗺️",
  desc: "Maps which works a body of literature cites together, and how that changes from phase to phase (co-citation analysis as in Mertens et al. 2023). The citing papers come from OpenAlex; the result goes to VOSviewer files, a note and the view here.",
  render(ctx) {
    const { backend } = ctx;
    if (ST.vault !== backend.entry?.id) Object.assign(ST, { vault: backend.entry?.id, ready: false, loading: false, A: null, name: null });
    if (!ST.ready) {
      if (!ST.loading) load(ctx);
      return h("p", { class: "muted", role: "status" }, "Reading the co-citation analyses…");
    }
    if (!ST.name) return start(ctx);
    const A = ST.A, S = A.settings, R = A.result;
    ctx.status = [pill(ST.name, "accent"),
      RUN.running ? pill("running…", "accent") : DL.running ? pill("downloading…", "accent") : R ? pill(`last run ${R.finished}`, "ok") : pill("no run yet")];
    ctx.actions = [h("div", { class: "seg", role: "group", "aria-label": "Result view" }, [["phases", "Phases"], ["works", "Works"], ["data", "Data"], ["run", "Run log"]].map(([k, t]) =>
      h("button", { type: "button", class: ST.tab === k ? "on" : "", "aria-pressed": ST.tab === k ? "true" : "false", onclick: () => { ST.tab = k; remember("cc_tab", k); ctx.rerender(); } }, t))),
      R?.notePath ? h("a", { class: "btn ghost", href: backend.noteLink(R.notePath), title: "Open the evidence-synthesis note in Obsidian" }, "Open note") : null];
    ctx.metrics = metrics(R);
    const main = ST.tab === "run" ? runLog() : !R ? empty("🗺️", "No result yet", noResultText(A)) :
      ST.tab === "works" ? worksTab(ctx, R) : ST.tab === "data" ? dataTab(ctx, A) : phaseView(ctx, R);
    return h("div", { class: "cl-grid" }, settingsCard(ctx, S), h("div", { class: "cl-main" }, main));
  },
};

function noResultText(A) {
  return A.pages ? "Check the settings on the left (the defaults follow Mertens et al. 2023) and press Run analysis." :
    "Write the search on the left and download the citing papers from OpenAlex; then run the analysis.";
}

async function load(ctx, name = null) {
  ST.loading = true;
  try {
    const { backend } = ctx;
    ST.analyses = await backend.coCitationAnalyses();
    const wanted = name ?? backend.settings.coCitation?.current;
    ST.name = ST.analyses.includes(wanted) ? wanted : ST.analyses[0] ?? null;
    ST.A = ST.name ? await backend.coCitationOpen(ST.name) : null;
    if (ST.A) ST.A.settings = { ...CO_CITATION_DEFAULTS, ...outputsFor(ST.name), ...ST.A.settings };
    ST.subfields = ST.A?.pages ? await backend.coCitationSubfields(ST.name, ST.A.settings) : [];
    if (ST.name && ST.name !== backend.settings.coCitation?.current) await backend.saveSettings({ coCitation: { current: ST.name } });
    Object.assign(V, { s: 0, sel: null, hl: null, hlLock: null, persp: null, q: "" });
  } catch (e) {
    console.error(e);
    toast(`The co-citation analyses could not be read: ${e.message}`, "err");
  } finally {
    ST.loading = false;
    ST.ready = true;
    ctx.rerender();
  }
}

/** Saves the settings of the open analysis a moment after the last change. */
function save(ctx) {
  clearTimeout(ST.saveTimer);
  const name = ST.name, settings = ST.A.settings;
  ST.saveTimer = setTimeout(() => ctx.backend.coCitationSave(name, settings).catch(e => toast(`The settings were not saved: ${e.message}`, "err")), 500);
}

const BAD_NAME = /[\\/:*?"<>|]/;
function newAnalysis(ctx, preset = null) {
  const input = h("input", { type: "text", id: "cc-new-name", autocomplete: "off", value: preset ? "Mertens replica" : "", "aria-describedby": "cc-new-help" });
  const body = h("div", { class: "stack" },
    h("label", { class: "field", for: "cc-new-name" }, h("span", {}, "Name of the analysis"), input,
      h("span", { class: "small muted", id: "cc-new-help" }, `Used for its folder (${ctx.backend.settings.coCitationDir}/<name>), the output folder and the note, e.g. "Modular electronics".`)));
  modal(preset ? "New analysis with the Mertens et al. 2023 settings" : "New co-citation analysis", body, [["Cancel"], ["Create", async () => {
    const name = input.value.trim();
    if (!name) return toast("Give the analysis a name.", "err");
    if (BAD_NAME.test(name)) return toast("A name cannot contain \\ / : * ? \" < > |, because it becomes a folder name.", "err");
    if (ST.analyses.includes(name)) return toast(`An analysis "${name}" exists already; choose it in the list.`, "err");
    await ctx.backend.coCitationSave(name, { ...CO_CITATION_DEFAULTS, ...(preset ?? {}), ...outputsFor(name) });
    toast(`Analysis "${name}" created`, "ok");
    ST.ready = false;
    await load(ctx, name);
  }, "primary"]]);
  setTimeout(() => input.focus());
}

function start(ctx) {
  return h("div", { class: "grid2" },
    card("Start a co-citation analysis", "An analysis keeps its settings and the papers downloaded from OpenAlex in its own folder, so it can be rerun without new credits.",
      h("ol", { class: "interp" },
        h("li", {}, "Write the search that finds the citing papers (title, abstract, keywords) and download them from OpenAlex: 10 credits per 200 papers."),
        h("li", {}, "Narrow the papers by subfield, set the phases and the thresholds."),
        h("li", {}, "Run: the cited works are looked up, cleaned and mapped per phase. VOSviewer files, a figure and a note are written into the vault.")),
      h("div", { class: "row" }, btn("New analysis…", () => newAnalysis(ctx), "primary"), btn("Start from the Mertens et al. 2023 settings…", () => newAnalysis(ctx, MERTENS_2023), "ghost"))),
    card("Where it writes", null, savedIn([[`${ctx.backend.settings.coCitationDir}/<name>`, "settings and downloaded data, not in git"],
      ["01 - Project 1 - PhD Overview/02 - Outputs/<name> - co-citation", "VOSviewer files and figure"], ["01 - Project 1 - PhD Overview/03 - Evidence synthesis/<name> - co-citation phases.md", "note"]])));
}

function metrics(R) {
  if (!R) return [];
  const m = (v, l, cls = "") => h("div", { class: `metric ${cls}` }, h("div", { class: "v" }, v), h("div", { class: "l" }, l));
  const all = R.scopes[0];
  return [m(fmt(R.citing.total), "citing papers"), m(all.nodes.length, "works, all years"), m(all.clusters.length, "clusters, all years"),
    m(all.density.toFixed(3), "density, all years"), R.scopes.length > 1 ? m(R.scopes.slice(1).map(s => s.nodes.length).join(" / "), "works per phase", R.scopes.length > 3 ? "span2" : "") : null,
    m(`${all.nodes.filter(i => R.nodes[i].lib).length} of ${all.nodes.length}`, "in the library")].filter(Boolean);
}

// ---------------------------------------------------------------- settings
function settingsCard(ctx, S) {
  const { backend } = ctx;
  const A = ST.A;
  const id = k => `cc-${k}`;
  // what decides the download: changing it updates the download box at once
  const DOWNLOAD_KEYS = new Set(["query", "from", "to", "types", "language", "fields"]);
  const set = (key, value, rerender = false) => {
    S[key] = value; save(ctx);
    if (rerender) ctx.rerender(); else if (DOWNLOAD_KEYS.has(key)) $(".cc-dl")?.replaceWith(downloadBox());
  };
  const num = (key, label, step = "1") => h("div", { class: "set" }, h("label", { for: id(key) }, label),
    h("input", { id: id(key), type: "number", step, min: "0", value: S[key], oninput: e => set(key, e.target.value) }), q(key, label));
  const text = (key, label, attrs = {}) => h("label", { class: "field cc-field", for: id(key) }, h("span", {}, label, " ", q(key, label)),
    h("input", { id: id(key), type: "text", autocomplete: "off", value: Array.isArray(S[key]) ? S[key].join(", ") : S[key] ?? "", oninput: e => set(key, e.target.value), ...attrs }));

  // 0 · the analysis
  const picker = h("div", { class: "cc-picker" },
    h("label", { for: "cc-analysis", class: "small muted" }, "Analysis"),
    h("select", { id: "cc-analysis", onchange: e => { ST.ready = false; load(ctx, e.target.value); } }, ST.analyses.map(n => h("option", { value: n, selected: n === ST.name }, n))),
    btn("New…", () => newAnalysis(ctx), "sm ghost", { title: "Start another analysis" }));

  // 1 · citing papers
  const queryBox = h("textarea", { id: id("query"), rows: 5, spellcheck: "false", class: "mono", "aria-describedby": "cc-query-problem", oninput: e => {
    $("#cc-query-problem").textContent = searchProblem(e.target.value); set("query", e.target.value); } }, S.query);
  const fields = new Set((S.fields ?? []).map(Number));
  const fieldList = h("details", { class: "fold" }, h("summary", {}, `Fields: ${fields.size ? `${fields.size} of 26` : "all"}`),
    h("div", { class: "cc-checks" }, OPENALEX_FIELDS.map(([fid, label]) => h("label", { class: "check small" },
      h("input", { type: "checkbox", checked: fields.has(fid), onchange: e => { if (e.target.checked) fields.add(fid); else fields.delete(fid); set("fields", [...fields].sort((a, b) => a - b), true); } }), label))));
  function downloadBox() {
    const state = downloadState(A.download, S, A.pages), problem = searchProblem(S.query);
    const status = { none: "Nothing downloaded yet.", partial: `Downloaded ${state.done} of ${state.pages} pages; about ${fmt(state.credits)} credits left to download.`,
      complete: state.recorded ? `${fmt(state.works)} works downloaded on ${state.date}.` : `${A.pages} pages of earlier downloaded data (no record of the search they came from).`,
      changed: `The search, the years or the filters changed since the download of ${state.date}: download again to use them (the ${state.pages} pages downloaded before are replaced).` }[state.status];
    const label = { none: "Download", partial: "Continue download", complete: "Download again…", changed: "Download again" }[state.status];
    const button = DL.running ? btn("■ Stop download", () => { backend.stopCoCitationDownload(); toast("The download stops after the current page."); }, "danger")
      : btn(label, e => download(ctx, e.currentTarget, state), !A.pages ? "primary" : state.status === "complete" ? "sm ghost" : "",
        { disabled: Boolean(problem), title: problem || "Download the citing papers from OpenAlex" });
    return h("div", { class: "cc-dl" },
      h("p", { class: "small" + (state.status === "changed" ? " cc-warn" : " muted"), role: "status", "aria-live": "polite" }, DL.running ? DL.text : problem ? `${status} ${problem}` : status), button);
  }
  const problem = searchProblem(S.query);

  // 2 · filter
  const kept = new Set(S.subfields ?? []);
  const allKept = !kept.size;
  const sub = ST.subfields.length ? h("details", { class: "fold" }, h("summary", {}, `Subfields: ${allKept ? "all" : `${kept.size} of ${ST.subfields.length}`}`),
    h("div", { class: "row", style: "margin:4px 0" }, btn("All", () => set("subfields", [], true), "sm ghost"), btn("None", () => set("subfields", ["-"], true), "sm ghost"), q("subfields", "Subfields")),
    h("div", { class: "cc-checks" }, ST.subfields.map(([name, n]) => h("label", { class: "check small" },
      h("input", { type: "checkbox", checked: allKept || kept.has(name), onchange: e => {
        const next = new Set(allKept ? ST.subfields.map(([x]) => x) : [...kept].filter(x => x !== "-"));
        if (e.target.checked) next.add(name); else next.delete(name);
        set("subfields", next.size === ST.subfields.length ? [] : [...next], true);
      } }), `${name || "(no subfield)"} `, h("span", { class: "muted" }, fmt(n))))))
    : h("p", { class: "small muted" }, "The subfields can be chosen once the papers are downloaded.");
  const core = h("label", { class: "check", for: id("core") }, h("input", { type: "checkbox", id: id("core"), checked: S.coreOnly !== false,
    onchange: async e => { set("coreOnly", e.target.checked); ST.subfields = await backend.coCitationSubfields(ST.name, S); ctx.rerender(); } }), "Core sources only");

  // 3 · phases
  const phases = S.phases ?? [];
  const phaseRows = h("div", { class: "cc-phases" }, phases.map((p, i) => h("div", { class: "cc-phase", role: "group", "aria-label": `Phase ${i + 1}` },
    h("input", { type: "text", "aria-label": `Name of phase ${i + 1}`, placeholder: `Phase ${i + 1}`, value: p.name ?? "", oninput: e => { p.name = e.target.value; save(ctx); } }),
    h("input", { type: "number", "aria-label": `First year of phase ${i + 1}`, value: p.from, oninput: e => { p.from = e.target.value; save(ctx); } }),
    h("span", { class: "muted", "aria-hidden": "true" }, "–"),
    h("input", { type: "number", "aria-label": `Last year of phase ${i + 1}`, value: p.to, oninput: e => { p.to = e.target.value; save(ctx); } }),
    btn("✕", () => { phases.splice(i, 1); set("phases", phases, true); }, "sm ghost icon", { "aria-label": `Remove phase ${i + 1}`, title: "Remove this phase" }))));
  const addPhase = btn("+ Add phase", () => {
    const last = phases.at(-1), from = last ? Number(last.to) + 1 : Number(S.from);
    phases.push({ name: "", from, to: Math.max(from, Number(S.to)) });
    set("phases", phases, true);
  }, "sm ghost");

  // 5 · cleaning
  const errors = parseCorrections(S.corrections).errors;
  const corrections = h("textarea", { id: id("corrections"), rows: 6, spellcheck: "false", class: "mono", "aria-describedby": "cc-corr-errors",
    placeholder: "merge W1489719656 W6732408\ndrop W4297081765\nlabel W1562578637 Ulrich & Eppinger 1995", oninput: e => set("corrections", e.target.value) }, S.corrections ?? "");

  // 6 · output and run
  const noData = !A.pages;
  const runBtn = RUN.running ? btn("■ Stop", () => { if (ctx.backend.stopCoCitation()) { RUN.log.push("Stopped."); RUN.code = 130; RUN.running = false; clearInterval(RUN.timer); ctx.rerender(); } }, "danger")
    : btn("▶ Run analysis", e => run(ctx), noData ? "" : "primary", { disabled: noData || DL.running, title: noData ? "Download the citing papers first." : DL.running ? "Wait for the download to finish." : "Map the co-citations and write the files" });

  return h("div", { class: "card settings cc-settings" },
    picker,
    h("h4", {}, "1 · Citing papers (OpenAlex)"),
    h("label", { class: "field cc-field", for: id("query") }, h("span", {}, "Search ", q("query", "Search")), queryBox,
      h("span", { class: "small cc-err", id: "cc-query-problem", role: "alert" }, S.query ? problem : "")),
    h("div", { class: "cc-years", role: "group", "aria-label": "Publication years" },
      h("label", { for: id("from"), class: "small" }, "Years"),
      h("input", { id: id("from"), type: "number", "aria-label": "First year", value: S.from, oninput: e => set("from", e.target.value) }),
      h("span", { class: "muted", "aria-hidden": "true" }, "–"),
      h("input", { id: id("to"), type: "number", "aria-label": "Last year", value: S.to, oninput: e => set("to", e.target.value) }), q("years", "Years")),
    text("types", "Document types", { oninput: e => set("types", e.target.value.split(",").map(x => x.trim()).filter(Boolean)) }),
    text("language", "Language"),
    h("div", { class: "cc-row" }, fieldList, q("fields", "Fields")),
    downloadBox(),
    h("h4", {}, "2 · Filter (no credits)"),
    h("div", { class: "set wide" }, core, q("coreOnly", "Core sources only")), sub,
    h("h4", {}, "3 · Phases"), phaseRows, h("div", { class: "row" }, addPhase, q("phases", "Phases")),
    h("h4", {}, "4 · Maps"),
    num("overallThreshold", "Citations, all-years map"), num("phaseThreshold", "Citations, phase map"), num("linkThreshold", "Co-citations for a line"),
    h("details", { class: "fold" }, h("summary", {}, "Clustering and layout"),
      num("resolution", "Resolution", "0.1"), num("runs", "Leiden runs"), num("layoutStarts", "Layout starts")),
    h("h4", {}, "5 · Cleaning"),
    h("label", { class: "field cc-field", for: id("corrections") }, h("span", {}, "Corrections ", q("corrections", "Corrections")), corrections,
      h("span", { class: "small cc-err", id: "cc-corr-errors", role: "alert" }, errors.map(e => `Line ${e.line}: ${e.why}.`).join(" "))),
    h("h4", {}, "6 · Output"),
    text("outputDir", "VOSviewer files and figure"), text("notePath", "Evidence-synthesis note"),
    h("div", { class: "runbox" }, runBtn),
    h("div", { class: "row" }, btn("Mertens et al. 2023 settings…", async () => {
      if (!(await confirmBox("Use the Mertens et al. 2023 settings?", `The search, years, fields, subfields, phases, thresholds and corrections of "${ST.name}" are replaced by those of the replica of Mertens et al. 2023. The output folder and the note stay.`, "Replace the settings"))) return;
      Object.assign(S, structuredClone(MERTENS_2023));
      await backend.coCitationSave(ST.name, S);
      ST.subfields = A.pages ? await backend.coCitationSubfields(ST.name, S) : [];
      ctx.rerender(); toast("Mertens et al. 2023 settings loaded", "ok");
    }, "sm ghost")),
    savedIn([[backend.coCitationDir(ST.name), "settings and downloaded data"], [S.outputDir, "VOSviewer files, figure"], [S.notePath, "note"]]));
}

// ---------------------------------------------------------------- download and run
async function download(ctx, button, state) {
  const { backend } = ctx;
  const S = ST.A.settings;
  const fresh = state.status === "complete";
  const replaced = (state.status === "changed" || fresh) && ST.A.pages ? ` The ${ST.A.pages} pages downloaded before are replaced.` : "";
  const what = state.status === "partial" ? `It continues where the last download stopped: about ${fmt(state.credits)} credits.`
    : "The first page tells how many papers match; a search with more than 10,000 is split into year ranges.";
  const ok = await confirmBox(state.status === "partial" ? "Continue the download?" : "Download the citing papers from OpenAlex?",
    h("div", {}, h("p", { class: "muted" }, `Each page of 200 papers is one search and costs 10 OpenAlex credits; without an API key OpenAlex allows about 1,000 credits a day (100 pages). ${what}${replaced}`),
      h("p", { class: "muted" }, "When the daily budget runs out, the pages so far are kept and the next download continues from there.")),
    state.status === "partial" ? "Continue download" : "Download");
  if (!ok) return;
  DL.running = true; DL.text = "Asking OpenAlex…";
  ctx.rerender();
  try {
    const r = await backend.coCitationDownload(ST.name, S, { fresh, onProgress: text => { DL.text = text; const el = $(".cc-dl p"); if (el) el.textContent = text; } });
    if (r.incomplete) toast(r.incomplete, "err"); else toast(`${fmt(r.works)} citing papers downloaded (${r.done} page${r.done === 1 ? "" : "s"})`, "ok");
  } catch (e) {
    console.error(e);
    toast(`The download failed: ${e.message}`, "err");
  } finally {
    DL.running = false;
    const keep = ST.A.result;
    ST.A = { ...(await backend.coCitationOpen(ST.name)), settings: S, result: keep };
    ST.subfields = ST.A.pages ? await backend.coCitationSubfields(ST.name, S) : [];
    ctx.rerender();
  }
}

async function run(ctx) {
  const { backend } = ctx;
  const S = ST.A.settings;
  const maps = 1 + (S.phases ?? []).length;
  const ok = await confirmBox("Write the co-citation maps?", h("div", {},
    h("p", { class: "muted" }, `Writes ${2 * maps} VOSviewer files (a map and a network file for each of the ${maps} maps) and a figure into "${S.outputDir}", replacing the map and network files there, and the note "${S.notePath}" (rewritten on every run).`),
    h("p", { class: "muted" }, "Cited works not looked up before are fetched from OpenAlex: 1 credit per 100 works.")), "Run and write");
  if (!ok) return;
  clearTimeout(ST.saveTimer);
  await backend.coCitationSave(ST.name, S);
  Object.assign(RUN, { running: true, step: 0, details: {}, log: [], started: Date.now(), code: null });
  ST.tab = "run";
  ctx.rerender();
  RUN.timer = setInterval(() => { if (ST.tab === "run") drawRun(); }, 1000);
  try {
    const r = await backend.coCitationRun(ST.name, S, { onStep: (n, text, detail) => { RUN.step = n; RUN.details[n] = detail; RUN.log.push(`[${n}/${CO_CITATION_STEPS.length}] ${text}${detail ? " | " + detail : ""}`); if (ST.tab === "run") drawRun(); } });
    RUN.code = 0;
    RUN.log.push(`${count(r.citing.total, "citing paper")}; ${r.scopes.map(s => `${s.phase}: ${count(s.nodes.length, "work")}, ${count(s.clusters.length, "cluster")}`).join("; ")}`, ...r.files.map(f => `written: ${f}`));
    if (r.incomplete) RUN.log.push(`Warning: ${r.incomplete}`);
    ST.A.result = r;
    const all = r.scopes[0];
    toast(`Done: ${count(all.nodes.length, "work")}, ${count(all.clusters.length, "cluster")}, density ${all.density.toFixed(3)}; ${count(r.files.length, "file")} written` + (r.incomplete ? ". Some works could not be looked up (see the run log)." : ""), r.incomplete ? "err" : "ok");
    Object.assign(V, { s: 0, sel: null, hl: null, hlLock: null, persp: null });
    ST.tab = "phases"; remember("cc_tab", "phases");
  } catch (e) {
    RUN.code = 1;
    RUN.log.push(`Error: ${e.message}`);
    toast(`The analysis failed: ${e.message}`, "err");
  } finally {
    RUN.running = false;
    clearInterval(RUN.timer);
    ctx.rerender();
  }
}

const elapsed = () => (RUN.started ? Math.round((Date.now() - RUN.started) / 1000) : 0);
function drawRun() { const el = $("#page .cl-main"); if (el) el.replaceChildren(runLog()); }
function runLog() {
  const done = !RUN.running && RUN.code === 0;
  const log = h("div", { class: "log", role: "log" }, RUN.log.join("\n") || "No run in this session yet.");
  setTimeout(() => { log.scrollTop = log.scrollHeight; });
  return h("div", { class: "grid2" },
    card("Progress", RUN.running ? `Running for ${elapsed()} s; a few seconds for a hundred works, longer for large maps.` : done ? "Finished." : RUN.code != null ? "Stopped or failed: see the log." : "Press Run analysis to start.",
      h("div", { class: "steps8" }, CO_CITATION_STEPS.map((t, i) => {
        const n = i + 1, cls = done || n < RUN.step ? "done" : n === RUN.step && RUN.running ? "now" : "";
        return h("div", { class: "s8 " + cls }, h("span", { class: "ic", "aria-hidden": "true" }, cls === "done" ? "✓" : ""), h("div", {}, t, RUN.details[n] ? h("div", { class: "d" }, RUN.details[n]) : null));
      }))),
    card("Log", null, log));
}

// ---------------------------------------------------------------- perspectives and colours
/** Perspective names: the ones typed on the Data tab win (by anchor work), else those of the run. */
function names(R) {
  const typed = new Map((ST.A.settings.perspectives ?? []).map(p => [p.anchor, p.name]));
  return new Map(R.perspectives.map(p => [p.k, typed.get(p.anchor) || perspectiveName(p)]));
}
const slotOf = (R, k) => R.perspectives.find(p => p.k === k)?.slot ?? 99;
const perspColour = (R, k) => (slotOf(R, k) < 3 ? `var(--series-${slotOf(R, k) + 1})` : "var(--series-other)");

// ---------------------------------------------------------------- the phase view
let resize = null;
function phaseView(ctx, R) {
  const { backend } = ctx;
  if (V.s >= R.scopes.length) V.s = 0;
  if (V.timer) { clearInterval(V.timer); V.timer = null; }
  const N = R.nodes, SC = R.scopes, P = names(R);
  const order = perspectiveOrder(R);
  const sets = SC.map(sc => new Set(sc.nodes));
  const years = N.map(n => n.avgYear), yMin = Math.floor(Math.min(...years)), yMax = Math.ceil(Math.max(...years));
  const tStep = y => Math.max(0, Math.min(5, Math.floor(((y - yMin) / (yMax - yMin + 1e-9)) * 6)));
  const fillOf = i => (V.mode === "persp" ? perspColour(R, N[i].persp) : `var(--seq-${tStep(N[i].avgYear)})`);
  const clusterOf = s => new Map(SC[s].nodes.map((i, j) => [i, SC[s].clusterOf[j]]));

  // ---- phase selector and tools
  const radios = h("div", { class: "cc-phase-row", role: "radiogroup", "aria-label": "Map" }, SC.map((sc, s) => h("button", {
    type: "button", role: "radio", class: "cc-phase-btn", "aria-checked": s === V.s ? "true" : "false", tabindex: s === V.s ? "0" : "-1",
    onclick: () => { stopPlay(); setScope(s); },
    onkeydown: e => {
      const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
      if (!d) return;
      e.preventDefault(); stopPlay();
      const t = (V.s + d + SC.length) % SC.length; setScope(t); radios.children[t].focus();
    },
  }, h("span", { class: "pn" }, sc.phase), h("span", { class: "py" }, sc.name), h("span", { class: "pc" }, `${fmt(sc.citing)} citing papers`))));
  const play = SC.length > 2 ? btn(V.timer ? "■ Stop" : "▶ Play the phases", () => {
    if (V.timer) return stopPlay();
    setScope(1);
    V.timer = setInterval(() => { if (V.s >= SC.length - 1) return stopPlay(); setScope(V.s + 1); }, 2800);
    play.textContent = "■ Stop";
  }, "sm") : null;
  function stopPlay() { if (V.timer) { clearInterval(V.timer); V.timer = null; if (play) play.textContent = "▶ Play the phases"; } }
  const colour = segmented([["persp", "Colour: perspective"], ["time", "Colour: average citing year"]], V.mode, m => { V.mode = m; remember("cc_mode", m); ctx.rerender(); }, "Colour by");
  const find = h("input", { type: "search", id: "cc-find", placeholder: "e.g. Baldwin, platform", autocomplete: "off", value: V.q,
    oninput: e => { V.q = e.target.value.trim().toLowerCase(); V.persp = null; drawMap(); drawLegend(); } });

  // ---- map
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("role", "group");
  svg.setAttribute("aria-label", "Co-citation map: one dot per work, placed by how often works are cited together. Tab to a work and press Enter to see its details.");
  const gE = el("g", {}, svg), gD = el("g", {}, svg), gL = el("g", { class: "cc-labels" }, svg), gH = el("g", {}, svg);
  const box = h("div", { class: "cc-mapbox" }, svg);
  const legend = h("div", { class: "legend cc-legend" });
  const hint = h("p", { class: "small muted cc-hint" });
  let W = 800, H = 520, pos = [];

  function layout() {
    W = Math.max(280, box.clientWidth);
    const portrait = W < 560;
    H = portrait ? Math.round(Math.min(600, W * 1.45)) : Math.round(Math.min(640, Math.max(360, W * 0.62)));
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("height", H);
    const gx = N.map(n => (portrait ? n.y : n.x)), gy = N.map(n => (portrait ? -n.x : n.y));
    const X0 = Math.min(...gx), X1 = Math.max(...gx), Y0 = Math.min(...gy), Y1 = Math.max(...gy);
    const pad = 30, k = Math.min((W - 2 * pad) / ((X1 - X0) || 1), (H - 2 * pad) / ((Y1 - Y0) || 1));
    const ox = (W - k * (X1 - X0)) / 2, oy = (H - k * (Y1 - Y0)) / 2;
    pos = N.map((n, i) => [ox + (gx[i] - X0) * k, oy + (gy[i] - Y0) * k]);
    drawMap();
  }
  const maxC = s => Math.max(1, ...SC[s].nodes.map(i => N[i].cites[s]));
  const rOf = (i, s, mc) => 3 + 16 * Math.sqrt(N[i].cites[s] / mc);
  function focusSet() {
    const sc = SC[V.s];
    if (V.hl !== null) { const c = clusterOf(V.s); return new Set(sc.nodes.filter(i => c.get(i) === V.hl)); }
    if (V.persp !== null) return new Set(sc.nodes.filter(i => N[i].persp === V.persp));
    if (V.q) return new Set(N.map((n, i) => i).filter(i => `${N[i].label} ${N[i].title}`.toLowerCase().includes(V.q)));
    if (V.sel !== null) { const f = new Set([V.sel]); for (const [a, b] of sc.links) { if (a === V.sel) f.add(b); if (b === V.sel) f.add(a); } return f; }
    return null;
  }
  function drawMap() {
    if (!pos.length) return;
    const s = V.s, sc = SC[s], set = sets[s], mc = maxC(s), F = focusSet();
    gE.replaceChildren(); gD.replaceChildren(); gH.replaceChildren();
    const lmax = Math.max(1, ...sc.links.map(l => l[2]));
    for (const [a, b, c] of sc.links) {
      const on = !F || (F.has(a) && F.has(b));
      const t = c / lmax;
      el("line", { class: "cc-edge", x1: pos[a][0], y1: pos[a][1], x2: pos[b][0], y2: pos[b][1], "stroke-width": (0.4 + 2.2 * t).toFixed(2), "stroke-opacity": (on ? 0.1 + 0.5 * t : 0.03).toFixed(3) }, gE);
    }
    N.forEach((n, i) => { if (!set.has(i)) el("circle", { class: "cc-ghost", cx: pos[i][0], cy: pos[i][1], r: 2.2 }, gD); });
    for (const i of [...sc.nodes].sort((a, b) => N[b].cites[s] - N[a].cites[s] || a - b)) {
      const r = rOf(i, s, mc), dim = F && !F.has(i) ? " dim" : "";
      el("circle", { class: "cc-dot" + dim, cx: pos[i][0], cy: pos[i][1], r, style: `fill:${fillOf(i)}` }, gD);
      if (N[i].lib) el("circle", { class: "cc-ring" + dim, cx: pos[i][0], cy: pos[i][1], r: r + 3 }, gD);
      if (i === V.sel) el("circle", { class: "cc-selring", cx: pos[i][0], cy: pos[i][1], r: r + 6.5 }, gD);
    }
    // targets: the most-cited first (keyboard order); drawn last, so the least-cited lie on top for the pointer
    for (const i of [...sc.nodes].sort((a, b) => N[b].cites[s] - N[a].cites[s] || a - b)) {
      const r = rOf(i, s, mc);
      const t = el("circle", { class: "cc-hit", "data-i": i, cx: pos[i][0], cy: pos[i][1], r: Math.max(r + 3, 12), tabindex: "0", role: "button",
        "aria-label": `${N[i].label}: ${N[i].cites[s]} citations in ${sc.name}, ${P.get(N[i].persp) ?? "no perspective"}${N[i].lib ? ", in the library" : ""}`,
        "aria-pressed": i === V.sel ? "true" : "false" }, gH);
      const text = () => `${N[i].label}\n${N[i].title}\n${N[i].cites[s]} citations in ${sc.name} · ${P.get(N[i].persp) ?? "—"}${N[i].lib ? ` · library No. ${String(N[i].lib.no).padStart(3, "0")}` : ""}`;
      t.addEventListener("mouseenter", e => showTip(e, text()));
      t.addEventListener("mousemove", moveTip);
      t.addEventListener("mouseleave", hideTip);
      t.addEventListener("focus", e => showTip(e, text()));
      t.addEventListener("blur", hideTip);
      t.addEventListener("click", () => select(i, true));
      t.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(i, true); } });
    }
    drawLabels(F);
    const inLib = sc.nodes.filter(i => N[i].lib).length;
    hint.textContent = `${sc.nodes.length} works with at least ${sc.threshold} citations in ${sc.name} · ${inLib} of them in the library (ringed) · lines: pairs co-cited at least ${R.settings.linkThreshold} times · grey dots: works shown in other maps`;
  }
  const measure = document.createElement("canvas").getContext("2d");
  function drawLabels(F) {
    const s = V.s, sc = SC[s], mc = maxC(s);
    gL.replaceChildren();
    let cand = [...sc.nodes].sort((a, b) => N[b].cites[s] - N[a].cites[s] || a - b);
    if (F) cand = cand.filter(i => F.has(i));
    if (V.sel !== null && sets[s].has(V.sel)) cand = [V.sel, ...cand.filter(i => i !== V.sel)];
    const limit = Math.max(6, Math.round((W * H) / 14000)), boxes = [];
    measure.font = `600 12px ${getComputedStyle(document.body).fontFamily}`;
    const fits = b => b.x0 >= 2 && b.x1 <= W - 2 && b.y0 >= 2 && b.y1 <= H - 2 && !boxes.some(o => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0);
    let placed = 0;
    for (const i of cand) {
      if (placed >= limit) break;
      const r = rOf(i, s, mc), [x, y] = pos[i], w = measure.measureText(N[i].label).width + 6;
      for (const [tx, ty, anchor] of [[x + r + 3, y + 4, "start"], [x - r - 3, y + 4, "end"], [x, y - r - 5, "middle"], [x, y + r + 14, "middle"]]) {
        const x0 = anchor === "start" ? tx : anchor === "end" ? tx - w : tx - w / 2;
        const b = { x0: x0 - 1, x1: x0 + w + 1, y0: ty - 13, y1: ty + 5 };
        if (!fits(b)) continue;
        boxes.push(b);
        el("text", { class: "cc-label" + (i === V.sel ? " sel" : ""), x: tx, y: ty, "text-anchor": anchor }, gL).textContent = N[i].label;
        placed++;
        break;
      }
    }
  }
  function drawLegend() {
    const ring = h("span", { class: "cc-key" }, h("span", { class: "cc-ringkey", "aria-hidden": "true" }), "in the library");
    if (V.mode === "persp") {
      legend.replaceChildren(...order.map(p => h("button", { type: "button", class: "lg" + (V.persp !== null && V.persp !== p.k ? " off" : ""), "aria-pressed": V.persp === p.k ? "true" : "false",
        title: "Show only this perspective", onclick: () => { V.persp = V.persp === p.k ? null : p.k; V.hl = null; V.hlLock = null; drawMap(); drawLegend(); drawClusters(); } },
        h("span", { class: "sw", style: `background:${perspColour(R, p.k)}`, "aria-hidden": "true" }), P.get(p.k))), ring);
    } else {
      legend.replaceChildren(h("span", { class: "cc-key" }, "Average year of the citing papers ", h("b", {}, yMin),
        h("span", { class: "cc-ramp", "aria-hidden": "true" }, [0, 1, 2, 3, 4, 5].map(k => h("i", { style: `background:var(--seq-${k})` }))), h("b", {}, yMax)), ring);
    }
  }

  // ---- side panel
  const phaseCard = h("div", { class: "card cc-side", "aria-live": "polite" });
  const clusterCard = h("div", { class: "card cc-side" });
  const workCard = h("div", { class: "card cc-side", id: "cc-work" });
  function drawPhase() {
    const sc = SC[V.s];
    const stat = (v, k) => h("div", { class: "cc-stat" }, h("span", { class: "v" }, v), h("span", { class: "k" }, k));
    phaseCard.replaceChildren(h("h3", {}, `${sc.phase} · ${sc.name}`),
      h("div", { class: "cc-stats" }, stat(fmt(sc.citing), "citing papers"), stat(sc.nodes.length, "works"), stat(sc.clusters.length, "clusters"),
        stat(fmt(sc.links.length), "lines"), stat(sc.density.toFixed(3), "density")),
      h("p", { class: "small muted" }, `Works with at least ${sc.threshold} citations by the ${fmt(sc.citing)} papers of ${sc.name}; on average ${sc.refsAvg.toFixed(1)} references per paper.`));
  }
  const clusterName = c => {
    const ranked = [...c.mix].sort((a, b) => b[1] - a[1]);
    return ranked[0][1] / c.size >= 0.7 || ranked.length === 1 ? P.get(ranked[0][0]) ?? "—" : ranked.slice(0, 2).map(([k]) => P.get(k)).join(" + ");
  };
  function drawClusters() {
    const sc = SC[V.s];
    clusterCard.replaceChildren(h("h3", {}, "Clusters in this map"),
      h("ul", { class: "cc-clusters" }, sc.clusters.map((c, j) => {
        const mixText = order.filter(p => new Map(c.mix).get(p.k)).map(p => `${new Map(c.mix).get(p.k)} ${P.get(p.k)}`).join(", ");
        const li = h("li", { class: "cc-cl" + (V.hlLock === c.k ? " on" : ""),
          onmouseenter: () => { if (V.hlLock === null) { V.hl = c.k; drawMap(); } }, onmouseleave: () => { if (V.hlLock === null) { V.hl = null; drawMap(); } } },
        h("button", { type: "button", "aria-pressed": V.hlLock === c.k ? "true" : "false", onclick: () => { V.hlLock = V.hlLock === c.k ? null : c.k; V.hl = V.hlLock; V.persp = null; drawClusters(); drawMap(); drawLegend(); } },
          h("span", { class: "ch" }, h("span", {}, `${j + 1} · ${clusterName(c)}`), h("span", { class: "muted small" }, `${c.size} work${c.size === 1 ? "" : "s"}`))),
        h("div", { class: "cc-mix", role: "img", "aria-label": mixText }, order.filter(p => new Map(c.mix).get(p.k)).map(p => h("i", { style: `flex:${new Map(c.mix).get(p.k)};background:${perspColour(R, p.k)}` }))),
        h("div", { class: "small muted" }, c.top.slice(0, 4).map(i => N[i].label).join(" · ")));
        return li;
      })));
  }
  function drawWork() {
    const i = V.sel;
    if (i === null) {
      workCard.replaceChildren(h("h3", {}, "Selected work"), h("p", { class: "small muted" }, "Click a dot (or Tab to it and press Enter), or a work under Works, to see its citations per phase and the works it is cited with most."));
      return;
    }
    const n = N[i], s = V.s, sc = SC[s];
    const partners = sc.links.filter(l => l[0] === i || l[1] === i).map(([a, b, c]) => [a === i ? b : a, c]).sort((x, y) => y[1] - x[1]).slice(0, 6);
    workCard.replaceChildren(...[h("h3", { tabindex: "-1" }, n.label),
      h("p", { class: "small" }, n.title, n.source ? h("span", { class: "muted" }, ` · ${n.source}`) : null),
      h("div", { class: "row small" }, h("span", { class: "cc-key" }, h("span", { class: "sw", style: `background:${perspColour(R, n.persp)}`, "aria-hidden": "true" }), P.get(n.persp) ?? "no perspective"),
        n.doi ? h("a", { href: `https://doi.org/${n.doi}`, target: "_blank", rel: "noopener" }, "DOI ↗") : null,
        h("a", { href: `https://openalex.org/${n.id}`, target: "_blank", rel: "noopener" }, "OpenAlex ↗")),
      n.lib ? h("div", { class: "row small" }, pill(`No. ${String(n.lib.no).padStart(3, "0")} in the library`, "ok"), h("a", { class: "btn sm", href: backend.paperLink(n.lib.stem) }, "Open in Obsidian"))
        : h("div", { class: "row small" }, pill("not in the library")),
      n.merged.length ? h("p", { class: "small muted" }, `Counted together with ${n.merged.length} other OpenAlex record${n.merged.length === 1 ? "" : "s"}: ${n.merged.join(", ")}.`) : null,
      SC.length > 1 ? bars(n) : null,
      sets[s].has(i) ? (partners.length ? h("div", {}, h("p", { class: "small muted" }, `Cited most often with, in ${sc.name}:`),
        h("ul", { class: "cc-partners" }, partners.map(([j, c]) => h("li", {}, h("button", { type: "button", onclick: () => select(j, false) }, N[j].label), h("span", { class: "muted small" }, ` ${c}`)))))
        : h("p", { class: "small muted" }, `No pair with this work reaches ${R.settings.linkThreshold} co-citations in ${sc.name}.`))
        : h("p", { class: "small muted" }, `Below the threshold of ${sc.threshold} citations in ${sc.name}.`)].filter(Boolean));
  }
  function bars(n) {
    const vals = SC.slice(1).map((sc, k) => n.cites[k + 1]), mx = Math.max(1, ...vals);
    const w = 300, hh = 104, top = 16, base = hh - 22, bw = Math.min(40, w / vals.length - 14);
    const s2 = document.createElementNS(NS, "svg");
    s2.setAttribute("viewBox", `0 0 ${w} ${hh}`);
    s2.setAttribute("role", "img");
    s2.setAttribute("aria-label", `Citations per phase: ${SC.slice(1).map((sc, k) => `${sc.phase} ${vals[k]}`).join(", ")}`);
    el("line", { x1: 0, x2: w, y1: base, y2: base, class: "cc-axis" }, s2);
    vals.forEach((v, k) => {
      const cx = (w / vals.length) * (k + 0.5), bh = ((base - top) * v) / mx, x = cx - bw / 2, y = base - bh, rr = Math.min(4, bh / 2, bw / 2);
      if (bh > 0) el("path", { d: `M${x},${base} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + bw - rr} Q${x + bw},${y} ${x + bw},${y + rr} V${base} Z`, style: `fill:${perspColour(R, n.persp)}`, opacity: V.s === 0 || V.s === k + 1 ? 1 : 0.45 }, s2);
      el("text", { x: cx, y: y - 4, "text-anchor": "middle", class: "cc-bar-v" }, s2).textContent = v;
      el("text", { x: cx, y: hh - 6, "text-anchor": "middle", class: "cc-bar-l" }, s2).textContent = SC[k + 1].phase;
    });
    return h("div", {}, h("p", { class: "small muted", style: "margin:6px 0 2px" }, "Citations per phase"), s2);
  }
  function select(i, fromMap) {
    V.sel = V.sel === i ? null : i;
    hideTip();
    drawWork(); drawMap();
    if (V.sel !== null && matchMedia("(max-width: 1000px)").matches) workCard.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "nearest" });
    if (fromMap) svg.querySelector(`.cc-hit[data-i="${i}"]`)?.focus();
    else workCard.querySelector("h3")?.focus();
  }
  function setScope(s) {
    V.s = s;
    [...radios.children].forEach((b, k) => { b.setAttribute("aria-checked", k === s ? "true" : "false"); b.tabIndex = k === s ? 0 : -1; });
    V.hl = null; V.hlLock = null;
    drawPhase(); drawClusters(); drawWork(); drawMap(); drawSep();
  }

  // ---- how separate the perspectives are, per phase
  const sepBox = h("div", { class: "cc-sep" });
  function drawSep() {
    if (SC.length < 3 || order.length < 2) return;
    const host = sepBox, w = Math.max(320, host.clientWidth || 640), hh = 220, L = 44, Rm = 190, T = 14, B = 30;
    const s3 = document.createElementNS(NS, "svg");
    s3.setAttribute("viewBox", `0 0 ${w} ${hh}`);
    s3.setAttribute("role", "img");
    s3.setAttribute("aria-label", "Line chart: per perspective, the share of its co-citations that go to another perspective, per phase. The table below gives the numbers.");
    const ph = SC.slice(1), x = k => L + ((w - L - Rm) * k) / Math.max(1, ph.length - 1), y = v => T + (hh - T - B) * (1 - v);
    if (V.s) el("rect", { class: "cc-band", x: x(V.s - 1) - 22, y: T - 4, width: 44, height: hh - T - B + 8, rx: 6 }, s3);
    for (const v of [0, 0.25, 0.5, 0.75, 1]) {
      el("line", { class: "cc-grid", x1: L, x2: w - Rm + 8, y1: y(v), y2: y(v) }, s3);
      el("text", { class: "cc-tick", x: L - 8, y: y(v) + 4, "text-anchor": "end" }, s3).textContent = `${v * 100} %`;
    }
    ph.forEach((sc, k) => { el("text", { class: "cc-xl", x: x(k), y: hh - 8, "text-anchor": "middle" }, s3).textContent = sc.phase; });
    const ends = [];
    for (const p of order) {
      const vals = ph.map(sc => sc.outShare[p.k]);
      const pts = vals.map((v, k) => (v == null ? null : [x(k), y(v)])).filter(Boolean);
      if (!pts.length) continue;
      el("polyline", { points: pts.map(q2 => q2.join(",")).join(" "), fill: "none", style: `stroke:${perspColour(R, p.k)}`, "stroke-width": 2, "stroke-linejoin": "round" }, s3);
      vals.forEach((v, k) => {
        if (v == null) return;
        el("circle", { cx: x(k), cy: y(v), r: 4.5, style: `fill:${perspColour(R, p.k)}`, class: "cc-marker" }, s3);
        const hit = el("circle", { cx: x(k), cy: y(v), r: 12, fill: "transparent" }, s3);
        const label = `${P.get(p.k)}\n${ph[k].phase} ${ph[k].name}: ${pct(v)} of its co-citations go to another perspective`;
        hit.addEventListener("mouseenter", e => showTip(e, label));
        hit.addEventListener("mousemove", moveTip);
        hit.addEventListener("mouseleave", hideTip);
      });
      const last = [...vals].reverse().find(v => v != null);
      ends.push({ k: p.k, y: y(last), v: last });
    }
    ends.sort((a, b) => a.y - b.y);
    for (let k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 15) ends[k].y = ends[k - 1].y + 15;
    for (const e of ends) el("text", { class: "cc-endlabel", x: x(ph.length - 1) + 12, y: e.y + 4 }, s3).textContent = `${P.get(e.k)} ${pct(e.v)}`;
    host.replaceChildren(s3);
  }
  const sepTable = h("details", { class: "fold" }, h("summary", {}, "The numbers as a table"),
    h("table", { class: "tbl" }, h("tr", {}, h("th", {}, "Perspective"), SC.slice(1).map(sc => h("th", { class: "num" }, `${sc.phase} ${sc.name}`))),
      order.map(p => h("tr", {}, h("td", {}, P.get(p.k)), SC.slice(1).map(sc => h("td", { class: "num" }, pct(sc.outShare[p.k])))))));

  // ---- assemble; draw once the map has a size
  resize?.disconnect();
  resize = new ResizeObserver(() => { layout(); drawSep(); });
  setTimeout(() => { layout(); drawSep(); resize.observe(box); resize.observe(sepBox); });   // draw at once: a hidden tab gets no first resize callback
  drawLegend(); drawPhase(); drawClusters(); drawWork();
  return h("div", { class: "cc-view" },
    h("div", { class: "card cc-top" }, radios,
      h("div", { class: "row cc-tools" }, play, colour, h("label", { class: "small", for: "cc-find" }, "Find a work"), find)),
    h("div", { class: "cc-main" },
      h("div", { class: "cc-left" },
        h("div", { class: "card cc-mapcard" }, legend, box, hint),
        SC.length > 2 && order.length > 1 ? card("How separate the perspectives are", "Share of each perspective's co-citations (among the works of a phase map) that link it to another perspective. Lower: the perspective is cited more on its own. It depends partly on how many works a perspective has in a phase, so read the trend more than the level.", sepBox, sepTable) : null),
      h("div", { class: "cc-aside" }, phaseCard, clusterCard, workCard)));
}

function el(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}

// ---------------------------------------------------------------- works
function worksTab(ctx, R) {
  const { backend } = ctx;
  if (V.s >= R.scopes.length) V.s = 0;
  const N = R.nodes, sc = R.scopes[V.s], P = names(R);
  const cl = new Map(sc.nodes.map((i, j) => [i, sc.clusterOf[j]]));
  const rows = [...sc.nodes].sort((a, b) => N[b].cites[V.s] - N[a].cites[V.s] || a - b);
  const scopeSel = h("select", { id: "cc-works-scope", onchange: e => { V.s = Number(e.target.value); ctx.rerender(); } },
    R.scopes.map((x, s) => h("option", { value: s, selected: s === V.s }, `${x.phase} ${x.name}`)));
  return card(`Works in the map ${sc.phase} ${sc.name}`, `${rows.length} works with at least ${sc.threshold} citations, most cited first. Click a work to show it on the map.`,
    h("div", { class: "row", style: "margin-bottom:8px" }, h("label", { for: "cc-works-scope", class: "small" }, "Map"), scopeSel),
    h("div", { class: "scroll" }, h("table", { class: "tbl cc-works" },
      h("tr", {}, ["Work", "Year", "Perspective", "Cluster", "Citations here", "All years", "Avg. citing year", "Library"].map((t, k) => h("th", { class: k >= 3 && k <= 6 ? "num" : "" }, t))),
      rows.map(i => h("tr", {},
        h("td", {}, h("button", { type: "button", class: "linkish", onclick: () => { V.sel = i; ST.tab = "phases"; remember("cc_tab", "phases"); ctx.rerender(); } }, N[i].label),
          h("div", { class: "small muted" }, N[i].title)),
        h("td", {}, N[i].year || ""), h("td", {}, h("span", { class: "cc-key" }, h("span", { class: "sw", style: `background:${perspColour(R, N[i].persp)}`, "aria-hidden": "true" }), P.get(N[i].persp) ?? "—")),
        h("td", { class: "num" }, sc.clusters.findIndex(c => c.k === cl.get(i)) + 1), h("td", { class: "num" }, N[i].cites[V.s]), h("td", { class: "num" }, N[i].cites[0]),
        h("td", { class: "num" }, N[i].avgYear.toFixed(1)),
        h("td", {}, N[i].lib ? h("a", { href: backend.paperLink(N[i].lib.stem), title: "Open in Obsidian" }, `No. ${String(N[i].lib.no).padStart(3, "0")}`) : ""))))));
}

// ---------------------------------------------------------------- data, cleaning, perspectives
function dataTab(ctx, A) {
  const R = A.result, S = A.settings;
  const order = perspectiveOrder(R);
  const typed = new Map((S.perspectives ?? []).map(p => [p.anchor, p.name]));
  const persp = card("Perspectives", "The clusters of the all-years map. Name them here: the view uses the names at once; rerun to use them in the note and the figure. The first three named get the first three colours, in this order.",
    h("table", { class: "tbl" }, h("tr", {}, h("th", {}, "Colour"), h("th", {}, "Most-cited work"), h("th", { class: "num" }, "Works"), h("th", {}, "Name")),
      order.map(p => h("tr", {},
        h("td", {}, h("span", { class: "sw cc-swatch", style: `background:${perspColour(R, p.k)}`, "aria-hidden": "true" })),
        h("td", {}, p.top), h("td", { class: "num" }, p.size),
        h("td", {}, h("input", { type: "text", "aria-label": `Name of the perspective around ${p.top}`, value: typed.get(p.anchor) ?? p.name ?? "", placeholder: perspectiveName({ ...p, name: "" }),
          oninput: e => {
            const list = (S.perspectives ?? []).filter(x => x.anchor !== p.anchor);
            const name = e.target.value.trim();
            const at = (S.perspectives ?? []).findIndex(x => x.anchor === p.anchor);
            if (name) list.splice(at >= 0 ? at : list.length, 0, { anchor: p.anchor, name });
            S.perspectives = list; save(ctx);
          } }))))));
  const c = R.cleaning;
  const clean = card("Cleaning", "What the run merged and dropped. Add merge, drop or label lines under Cleaning on the left when a record is wrong; the ids are OpenAlex work ids.",
    c.merged.length ? h("div", {}, h("h4", { class: "cc-h4" }, `Merged: ${c.merged.length} works counted from several records`),
      h("table", { class: "tbl" }, h("tr", {}, h("th", {}, "Work"), h("th", {}, "Records (id · year · citations · title)")),
        c.merged.map(g => h("tr", {}, h("td", {}, g.label), h("td", { class: "small" }, g.members.map(m => h("div", {}, h("code", {}, m.id), ` · ${m.year || "—"} · ${m.cites} · ${m.title}`))))))) : h("p", { class: "small muted" }, "No records were merged."),
    c.dropped.length ? h("div", {}, h("h4", { class: "cc-h4" }, `Dropped: ${c.dropped.length} records`),
      h("table", { class: "tbl" }, h("tr", {}, h("th", {}, "Record"), h("th", {}, "Why"), h("th", { class: "num" }, "Citations")),
        c.dropped.map(d => h("tr", {}, h("td", {}, h("code", {}, d.id), d.title ? ` ${d.title}` : ""), h("td", {}, d.why === "correction" ? "by a correction" : "OpenAlex no longer has it (deleted or merged)"), h("td", { class: "num" }, d.cites))))) : null,
    c.missing.length ? h("div", { class: "callout warn small", style: "margin-top:10px" }, `${c.missing.length} works reach a threshold but have no metadata yet, so they are not shown: ${c.missing.map(m => m.id).join(", ")}. Run again with a connection to OpenAlex to look them up.`) : null,
    c.errors.length ? h("div", { class: "callout warn small", style: "margin-top:10px" }, `Corrections not understood: ${c.errors.map(e => `line ${e.line} (${e.why})`).join("; ")}.`) : null);
  const d = R.download;
  const data = card("Downloaded data", null, h("table", { class: "tbl" },
    [["Search", d?.query ?? `${S.query} (from the settings; the data has no record of its search)`], ["OpenAlex filter", d?.filter ?? "—"], ["Downloaded", d ? `${d.date}: ${fmt(d.works)} works${d.complete === false ? " (incomplete)" : ""}` : `${A.pages} pages`],
      ["Citing papers kept", `${fmt(R.citing.total)} (with references, ${S.coreOnly !== false ? "core sources, " : ""}${(S.subfields ?? []).length ? `${S.subfields.length} subfields` : "every subfield"})`],
      ["Cited works looked up", fmt(R.citing.candidates)]].map(([a, b]) => h("tr", {}, h("td", { class: "muted" }, a), h("td", {}, b)))),
    d?.differs ? h("div", { class: "callout warn small", style: "margin-top:10px" }, "The search in the settings has changed since this download; the result above comes from the downloaded data.") : null,
    R.incomplete ? h("div", { class: "callout warn small", style: "margin-top:10px" }, R.incomplete) : null);
  return h("div", {}, data, persp, clean);
}
