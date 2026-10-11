// Cluster discovery: settings, a run with progress, and the result as metrics, an interactive map and cluster cards.
import { CLUSTER_DEFAULTS, CLUSTER_STEPS } from "../../src/index.js";
import { $, btn, card, color, confirmBox, empty, h, modal, pill, savedIn, segmented, toast } from "../ui.js";
import { HELP } from "../help.js";

const recall = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const remember = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private window */ } };

let TAB = recall("cl_tab", "overview");
const RUN = { running: false, step: 0, details: {}, log: [], started: 0, code: null, timer: null };
let FOCUS = null;
const MAP = { colorBy: "cluster", only: null, sel: null, search: "", vb: null };

// ---------------------------------------------------------------- tooltip help
const tip = () => $("#tip");
function showTip(e, text) { tip().textContent = text; tip().classList.add("on"); moveTip(e); }
function moveTip(e) { const t = tip(); const x = e.clientX ?? e.target.getBoundingClientRect().left, y = e.clientY ?? e.target.getBoundingClientRect().bottom; t.style.left = Math.min(x + 14, innerWidth - 340) + "px"; t.style.top = (y + 14) + "px"; }
function hideTip() { tip().classList.remove("on"); }
const q = (key, label) => h("button", { type: "button", class: "q", "aria-label": `Help: ${label}`, onmouseenter: e => showTip(e, HELP[key]), onmousemove: moveTip, onmouseleave: hideTip,
  onfocus: e => showTip(e, HELP[key]), onblur: hideTip, onclick: e => showTip(e, HELP[key]) }, "?");

export const cluster = {
  id: "cluster", title: "Cluster discovery", icon: "🧩",
  desc: "Groups the papers by what they are about (text, tags, links) and compares the groups with your concept maps.",
  render(ctx) {
    const { backend } = ctx;
    const R = backend.lastCluster;
    const S = { ...backend.settings.cluster };
    const v = k => S[k] ?? CLUSTER_DEFAULTS[k];

    ctx.status = [RUN.running ? pill(`running · step ${RUN.step}/8 · ${elapsed()}s`, "accent") : R ? pill("last run " + (R.finished || ""), "ok") : pill("no run yet"),
      R && R.settingsUsed && R.settingsUsed.dryRun === false ? pill("hub notes updated", "info") : null];
    ctx.actions = [h("div", { class: "seg", role: "group", "aria-label": "Result view" }, [["overview", "Overview"], ["map", "Map"], ["clusters", "Clusters"], ["run", "Run log"]].map(([k, t]) =>
      h("button", { type: "button", class: TAB === k ? "on" : "", "aria-pressed": TAB === k ? "true" : "false", onclick: () => { TAB = k; remember("cl_tab", k); ctx.rerender(); } }, t))),
      R ? h("a", { class: "btn ghost", href: backend.noteLink(R.report), title: "Open the report in Obsidian" }, "Open report") : null];
    ctx.metrics = metrics(R);

    // ---- settings column
    const save = () => backend.saveSettings({ cluster: S });
    const num = (key, label, step = "0.1") => h("div", { class: "set" }, h("label", { for: `cl-${key}` }, label),
      h("input", { id: `cl-${key}`, type: "number", step, value: v(key), oninput: e => { S[key] = e.target.value; save(); } }), q(key, label));
    const sel = (key, label, opts) => h("div", { class: "set" }, h("label", { for: `cl-${key}` }, label),
      h("select", { id: `cl-${key}`, onchange: e => { S[key] = e.target.value; save().then(ctx.rerender); } }, opts.map(([o, t]) => h("option", { value: o, selected: v(key) === o }, t))), q(key, label));
    const cpm = v("quality") === "cpm";
    const dry = h("input", { type: "checkbox", id: "cl-dry", checked: v("dryRun") !== false, onchange: e => { S.dryRun = e.target.checked; save().then(ctx.rerender); } });
    const settings = h("div", { class: "card settings" },
      h("p", { class: "small muted", style: "margin:0 0 4px" }, `${backend.library.papers.length} publication notes are clustered by content — your concept maps are not used, so the result is an independent check.`),
      h("h4", {}, "1 · Graph layers"),
      num("wText", "Text similarity"), num("k", "Neighbours k", "1"), num("wTag", "Shared tags"), num("wLink", "Wikilinks"),
      h("h4", {}, "2 · Detection"),
      sel("algorithm", "Algorithm", [["leiden", "Leiden"], ["louvain", "Louvain"]]),
      sel("quality", "Quality", [["modularity", "Modularity"], ["cpm", "CPM"]]),
      h("div", { class: "set" }, h("label", { for: "cl-gamma" }, cpm ? "Density γ" : "Resolution γ"),
        h("input", { id: "cl-gamma", type: "text", inputmode: "decimal", value: cpm ? (S.gamma ?? "") : v("resolution"), placeholder: cpm ? "auto" : "1.0",
          oninput: e => { S[cpm ? "gamma" : "resolution"] = e.target.value; save(); } }), q("resolution", "γ")),
      num("runs", "Consensus runs", "10"), num("threshold", "Consensus threshold", "0.05"), num("bridgeP", "Bridge threshold P", "0.05"), num("seed", "Seed", "1"),
      h("h4", {}, "3 · Output"),
      h("div", { class: "set wide" }, h("label", { class: "check", for: "cl-dry" }, dry, "Dry run — report only"), q("dryRun", "Dry run")),
      v("dryRun") === false ? h("div", { class: "callout warn small" }, "Hub notes and graph presets will be replaced. Close Obsidian first, so its Graph Presets plugin does not overwrite them; reload Obsidian afterwards.") : null,
      h("div", { class: "runbox" }, RUN.running ? btn("■ Stop", () => stop(ctx), "danger") : btn("▶ Run analysis", e => run(ctx, S), "primary")),
      h("div", { class: "row", style: "justify-content:space-between" },
        btn("↺ Defaults", async () => { for (const k of Object.keys(S)) delete S[k]; await backend.saveSettings({ cluster: {} }); ctx.rerender(); toast("Default settings restored"); }, "sm ghost")),
      savedIn([[`${backend.settings.reportDir}/Cluster discovery report.md`, "report"], [backend.settings.hubDir, "hub notes"], [backend.settings.presetsFile, "[auto] presets"]]));

    const page = PAGES[TAB](ctx, R);
    return h("div", { class: "cl-grid" }, settings, h("div", { class: "cl-main" }, page));
  },
};

const elapsed = () => (RUN.started ? Math.round((Date.now() - RUN.started) / 1000) : 0);

function metrics(R) {
  if (!R) return [];
  const m = (v, l, cls = "") => h("div", { class: `metric ${cls}` }, h("div", { class: "v" }, v), h("div", { class: "l" }, l));
  return [m(R.notes, "papers"), m(R.edges, "links"), m(R.clusters.length, "clusters"), m(R.Q, "modularity Q", R.Q > 0.3 ? "good" : "bad"),
    m(R.nmi, "NMI vs concept maps"), m(R.disconnected, "disconnected clusters", R.disconnected ? "bad" : "good"),
    m(R.clusters.reduce((a, c) => a + c.bridges.length, 0), "bridge papers")];
}

// ---------------------------------------------------------------- running
async function run(ctx, S) {
  const { backend } = ctx;
  const settings = { ...S };
  if (settings.dryRun === false) {
    const ok = await confirmBox("Replace hub notes and graph presets?",
      h("div", {}, h("p", { class: "muted" }, `Every generated hub note in "${backend.settings.hubDir}" is deleted and recreated, and the "[auto]" presets in "${backend.settings.presetsFile}" are replaced (a .bak copy is kept). Your own notes and presets are untouched.`),
        h("p", { class: "muted" }, h("b", {}, "Close Obsidian first"), " — otherwise its Graph Presets plugin may overwrite the new presets. Reload Obsidian when the run is finished.")), "Obsidian is closed, run");
    if (!ok) return;
  }
  if (settings.quality === "cpm") { settings.gamma = settings.gamma ?? ""; delete settings.resolution; }
  Object.assign(RUN, { running: true, step: 0, details: {}, log: [], started: Date.now(), code: null });
  TAB = "run"; remember("cl_tab", "run");
  ctx.rerender();
  RUN.timer = setInterval(() => { if (TAB === "run") drawRun(ctx); }, 1000);
  try {
    const r = await backend.cluster(settings, { onStep: (n, text, detail) => { RUN.step = n; RUN.details[n] = detail; RUN.log.push(`[${n}/8] ${text}${detail ? " | " + detail : ""}`); if (TAB === "run") drawRun(ctx); } });
    RUN.code = 0;
    RUN.log.push(`${r.notes} notes, ${r.edges} edges, ${r.clusters.length} clusters, Q = ${r.Q}, NMI = ${r.nmi}, ARI = ${r.ari}`);
    if (r.hubs) RUN.log.push(`Hub notes: replaced ${r.hubs.removed} old with ${r.hubs.written} new in ${r.hubs.dir}`);
    if (r.presets) RUN.log.push(`Presets: replaced ${r.presets.removed} old '[auto]' presets with ${r.presets.added} new (backup: ${r.presets.backup})`);
    toast(`Done — ${r.clusters.length} clusters, Q = ${r.Q}` + (r.presets ? ". Reload Obsidian (Ctrl+R) so the plugin reads the new presets." : ""), "ok");
    TAB = "overview"; remember("cl_tab", "overview"); MAP.vb = null; MAP.only = null; MAP.sel = null;
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
function stop(ctx) {
  if (ctx.backend.stopCluster()) { RUN.log.push("Stopped."); RUN.code = 130; }
}

const PAGES = {};

// ---------------------------------------------------------------- overview
PAGES.overview = (ctx, R) => {
  if (!R) return empty("🔭", "No result yet", "Choose settings on the left (the defaults are fine) and press Run analysis. A dry run only rewrites the report.");
  const L = R.layers || {};
  return h("div", {},
    h("div", { class: "grid2" },
      card("What the numbers mean", null, h("ul", { class: "interp" },
        h("li", {}, h("b", {}, `Q = ${R.Q}`), R.Q > 0.3 ? " — clear community structure (above 0.3)." : " — weak community structure (0.3 or below)."),
        h("li", {}, h("b", {}, `NMI = ${R.nmi}`), R.nmi >= 0.6 ? " — the content grouping largely matches your concept maps." : " — the content suggests a partly different grouping than your concept maps. Look at the Map coloured by concept map."),
        h("li", {}, h("b", {}, `${R.disconnected} disconnected clusters`), " — Leiden guarantees 0."),
        h("li", {}, h("b", {}, "Robustness"), " per cluster: share that stays together when the density threshold rises. ≥ 70 % robust · 45–70 % splits into sub-cores · < 45 % loose umbrella."),
        h("li", {}, h("b", {}, "Bridge papers"), " connect several clusters (high participation P) — often the integrating papers of a field."))),
      card("How the graph was built", null, h("table", { class: "tbl" },
        [["Method", `${R.algorithm} + ${R.quality}, γ = ${Number(R.gamma).toPrecision(3)}`], ["Text links", L.text || 0], ["Tag links", L.tag || 0], ["Wikilinks", L.link || 0],
          ["Boilerplate lines ignored", R.boilerplate], ["Settings", R.settings ? `k ${R.settings.k} · weights ${R.settings.wText}/${R.settings.wTag}/${R.settings.wLink} · ${R.settings.runs} runs · seed ${R.settings.seed}` : "—"]]
          .map(([a, b]) => h("tr", {}, h("td", { class: "muted" }, a), h("td", {}, b)))))),
    card("Clusters at a glance", "Size and robustness. Click a row to open the cluster.", h("table", { class: "tbl" },
      h("tr", {}, ["", "Cluster", "Papers", "Robustness", ""].map(t => h("th", {}, t))),
      R.clusters.map((c, i) => h("tr", { class: "click", onclick: () => { FOCUS = i; TAB = "clusters"; remember("cl_tab", "clusters"); ctx.rerender(); } },
        h("td", {}, h("span", { class: "sw", style: `display:inline-block;width:12px;height:12px;border-radius:50%;background:${color(i)}`, "aria-hidden": "true" })),
        h("td", {}, h("b", {}, c.id), " ", c.terms.slice(0, 4).join(", ")), h("td", { class: "num" }, c.size),
        h("td", { style: "width:30%" }, h("div", { class: "bar", role: "img", "aria-label": `robustness ${Math.round(c.robustness * 100)} %` }, h("i", { style: `width:${c.robustness * 100}%;background:${c.robustness >= 0.7 ? "var(--ok)" : c.robustness >= 0.45 ? "var(--warn)" : "var(--bad)"}` }))),
        h("td", { class: "num" }, Math.round(c.robustness * 100) + " %"))))));
};

// ---------------------------------------------------------------- clusters
PAGES.clusters = (ctx, R) => {
  if (!R) return empty("🧩", "No clusters yet", "Run the analysis first.");
  const { backend } = ctx;
  const cards = R.clusters.map((c, i) => h("div", { class: "card ccard", id: "c" + i, style: `border-top:4px solid ${color(i)}` },
    h("div", { class: "row" }, h("h3", { style: "margin:0" }, c.id), pill(`${c.size} papers`), pill(`robustness ${Math.round(c.robustness * 100)} %`, c.robustness >= 0.7 ? "ok" : c.robustness >= 0.45 ? "warn" : "bad"),
      c.bridges.length ? pill(`${c.bridges.length} bridge`, "info") : null),
    h("div", { class: "terms" }, c.terms.map(t => h("span", {}, t))),
    c.papers.map(p => h("a", { class: "paper", href: backend.paperLink(p.stem), title: "Open in Obsidian" },
      h("span", { class: "id" }, p.id), h("span", {}, p.title), c.bridges.includes(p.id) ? pill("⟷ bridge", "info") : null)),
    h("div", { class: "row end", style: "margin-top:8px" }, btn("Show on map", () => { MAP.only = new Set([i]); MAP.colorBy = "cluster"; TAB = "map"; remember("cl_tab", "map"); ctx.rerender(); }, "sm"))));
  setTimeout(() => { if (FOCUS != null) { $("#c" + FOCUS)?.scrollIntoView({ behavior: "smooth" }); FOCUS = null; } }, 50);
  return h("div", {}, h("p", { class: "muted small" }, "Papers are sorted by how central they are in their cluster. Click a paper to open its note in Obsidian."), h("div", { class: "cgrid" }, cards));
};

// ---------------------------------------------------------------- map
PAGES.map = (ctx, R) => {
  if (!R || !R.graph) return empty("🗺️", "No map yet", "Run the analysis first.");
  const { backend } = ctx;
  const G = R.graph, N = G.nodes;
  const cats = [...new Set(N.map(n => n.cat))].sort();
  const col = n => MAP.colorBy === "cluster" ? color(n.c) : color(cats.indexOf(n.cat));
  const adj = new Map(N.map(n => [n.n, new Set()]));
  G.edges.forEach(([a, b]) => { adj.get(a).add(b); adj.get(b).add(a); });
  const xs = N.map(n => n.x), ys = N.map(n => n.y), pad = 120;
  const full = [Math.min(...xs) - pad, Math.min(...ys) - 3 * pad, Math.max(...xs) - Math.min(...xs) + 2 * pad, Math.max(...ys) - Math.min(...ys) + 4 * pad];
  MAP.vb ||= [...full];
  const r = Math.max(full[2], full[3]) / 75;
  const ns = "http://www.w3.org/2000/svg";
  const svgEl = document.createElementNS(ns, "svg");
  svgEl.setAttribute("role", "img");
  svgEl.setAttribute("aria-label", "Map of the papers: one dot per paper, placed by cluster");
  const setVB = () => svgEl.setAttribute("viewBox", MAP.vb.join(" "));
  setVB();
  const gE = document.createElementNS(ns, "g"), gN = document.createElementNS(ns, "g");
  svgEl.append(gE, gN);
  const byN = new Map(N.map(n => [n.n, n]));
  const visible = n => (!MAP.only || MAP.only.has(MAP.colorBy === "cluster" ? n.c : cats.indexOf(n.cat))) && (!MAP.search || (n.id + " " + n.title).toLowerCase().includes(MAP.search));
  const focus = MAP.sel != null ? new Set([MAP.sel, ...adj.get(MAP.sel)]) : null;
  G.edges.forEach(([a, b, w]) => {
    const A = byN.get(a), B = byN.get(b);
    const l = document.createElementNS(ns, "line");
    Object.entries({ x1: A.x, y1: A.y, x2: B.x, y2: B.y, stroke: A.c === B.c ? col(A) : "var(--faint)", "stroke-width": r * 0.12 * (0.5 + w), "stroke-opacity": 0.35 }).forEach(([k, v]) => l.setAttribute(k, v));
    if ((focus && !(focus.has(a) && focus.has(b) && (a === MAP.sel || b === MAP.sel))) || !visible(A) || !visible(B)) l.setAttribute("stroke-opacity", 0.04);
    gE.append(l);
  });
  N.forEach(n => {
    const c = document.createElementNS(ns, "circle");
    Object.entries({ cx: n.x, cy: n.y, r: r * (n.bridge ? 1.25 : 0.9), fill: col(n), stroke: n.bridge ? "var(--text)" : "var(--surface)", "stroke-width": r * (n.bridge ? 0.35 : 0.2), class: "node", tabindex: "0", role: "button", "aria-label": `${n.id} ${n.title}` }).forEach(([k, v]) => c.setAttribute(k, v));
    if ((focus && !focus.has(n.n)) || !visible(n)) c.classList.add("dim");
    const label = `${n.id} · ${n.title}\nC${String(n.c + 1).padStart(2, "0")} · P ${n.P}${n.bridge ? " · bridge" : ""}`;
    c.addEventListener("mouseenter", e => showTip(e, label));
    c.addEventListener("mousemove", moveTip); c.addEventListener("mouseleave", hideTip);
    c.addEventListener("focus", e => showTip(e, label)); c.addEventListener("blur", hideTip);
    const select = e => { e.stopPropagation(); MAP.sel = MAP.sel === n.n ? null : n.n; hideTip(); ctx.rerender(); };
    c.addEventListener("click", select);
    c.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(e); } });
    gN.append(c);
  });
  let drag = null;
  svgEl.addEventListener("mousedown", e => { drag = { x: e.clientX, y: e.clientY, vb: [...MAP.vb] }; svgEl.classList.add("drag"); });
  const endDrag = () => { drag = null; svgEl.classList.remove("drag"); };
  svgEl.addEventListener("mouseup", endDrag); svgEl.addEventListener("mouseleave", endDrag);
  svgEl.addEventListener("mousemove", e => { if (!drag) return; const k = MAP.vb[2] / svgEl.clientWidth; MAP.vb[0] = drag.vb[0] - (e.clientX - drag.x) * k; MAP.vb[1] = drag.vb[1] - (e.clientY - drag.y) * k; setVB(); });
  svgEl.addEventListener("wheel", e => {
    e.preventDefault();
    const f = e.deltaY > 0 ? 1.15 : 1 / 1.15, rect = svgEl.getBoundingClientRect();
    const px = MAP.vb[0] + (e.clientX - rect.left) / rect.width * MAP.vb[2], py = MAP.vb[1] + (e.clientY - rect.top) / rect.height * MAP.vb[3];
    MAP.vb = [px - (px - MAP.vb[0]) * f, py - (py - MAP.vb[1]) * f, MAP.vb[2] * f, MAP.vb[3] * f]; setVB();
  }, { passive: false });
  svgEl.addEventListener("click", () => { if (MAP.sel != null) { MAP.sel = null; ctx.rerender(); } });

  const search = h("input", { type: "search", "aria-label": "Find a paper", placeholder: "Find a paper…", value: MAP.search, oninput: e => { MAP.search = e.target.value.toLowerCase(); ctx.rerender(); setTimeout(() => { const i = $(".maptools input"); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }); } });
  const sel = MAP.sel != null ? byN.get(MAP.sel) : null;
  const cl = sel ? R.clusters[sel.c] : null;
  const groups = MAP.colorBy === "cluster" ? R.clusters.map((c, i) => [i, `${c.id} ${c.terms.slice(0, 2).join(", ")}`]) : cats.map((c, i) => [i, c.replace(/^\d+- /, "")]);
  const zoom = f => { MAP.vb = [MAP.vb[0] + MAP.vb[2] * (1 - f) / 2, MAP.vb[1] + MAP.vb[3] * (1 - f) / 2, MAP.vb[2] * f, MAP.vb[3] * f]; setVB(); };
  return h("div", {},
    h("div", { class: "mapwrap" }, svgEl,
      h("div", { class: "maptools" }, search,
        segmented([["cluster", "Colour: clusters"], ["cat", "Colour: concept maps"]], MAP.colorBy, k => { MAP.colorBy = k; MAP.only = null; ctx.rerender(); }, "Colouring"),
        btn("⤢ Fit", () => { MAP.vb = [...full]; ctx.rerender(); }, "sm"), btn("+", () => zoom(0.7), "sm", { "aria-label": "Zoom in" }), btn("−", () => zoom(1.4), "sm", { "aria-label": "Zoom out" })),
      sel ? h("div", { class: "detail" },
        h("div", { class: "row" }, h("b", { style: "font-family:var(--mono)" }, sel.id), pill(cl.id), sel.bridge ? pill("⟷ bridge", "info") : null),
        h("h3", { style: "margin:6px 0" }, sel.title),
        h("div", { class: "small muted" }, `P = ${sel.P} · stability ${sel.stability} · concept map: ${sel.cat.replace(/^\d+- /, "")}`),
        h("div", { class: "small", style: "margin-top:8px" }, h("b", {}, `${adj.get(sel.n).size} linked papers`)),
        [...adj.get(sel.n)].map(j => byN.get(j)).map(m => h("div", { class: "small linked", onclick: e => { e.stopPropagation(); MAP.sel = m.n; ctx.rerender(); } },
          h("span", { style: `display:inline-block;width:8px;height:8px;border-radius:50%;background:${col(m)};margin-right:6px`, "aria-hidden": "true" }), `${m.id} ${m.title}`)),
        h("div", { class: "row", style: "margin-top:10px" }, h("a", { class: "btn sm primary", href: backend.paperLink(sel.stem) }, "Open in Obsidian"))) : null),
    h("div", { class: "legend" }, groups.map(([i, t]) => h("button", { type: "button", class: "lg" + (MAP.only && !MAP.only.has(i) ? " off" : ""), "aria-pressed": MAP.only && MAP.only.has(i) ? "true" : "false", onclick: () => {
      MAP.only = MAP.only && MAP.only.size === 1 && MAP.only.has(i) ? null : new Set([i]); ctx.rerender(); } },
    h("span", { class: "sw", style: `background:${color(i)}`, "aria-hidden": "true" }), t)),
    MAP.only ? btn("show all", () => { MAP.only = null; ctx.rerender(); }, "sm ghost") : null),
    h("p", { class: "small muted" }, "Scroll to zoom, drag to move. Click a dot (or Tab to it and press Enter) to see its links; click a legend entry to show one group. Dots with a dark ring are bridge papers. Switch to 'concept maps' colouring to see where the content disagrees with your maps."));
};

// ---------------------------------------------------------------- run log
function drawRun(ctx) { const el = $("#page .cl-main"); if (el) el.replaceChildren(PAGES.run(ctx, ctx.backend.lastCluster)); }
PAGES.run = (ctx) => {
  const step = RUN.step, done = !RUN.running && RUN.code === 0;
  const log = h("div", { class: "log", role: "log" }, RUN.log.join("\n") || "No run in this session yet.");
  setTimeout(() => { log.scrollTop = log.scrollHeight; });
  return h("div", { class: "grid2" },
    card("Progress", RUN.running ? `Running for ${elapsed()} s — a few seconds with 100 runs.` : done ? "Finished." : RUN.code != null ? "Stopped or failed — see the log." : "Press Run analysis to start.",
      h("div", { class: "steps8" }, CLUSTER_STEPS.map((t, i) => {
        const n = i + 1, cls = done || n < step ? "done" : n === step && RUN.running ? "now" : "";
        return h("div", { class: "s8 " + cls }, h("span", { class: "ic", "aria-hidden": "true" }, cls === "done" ? "✓" : ""), h("div", {}, t, RUN.details[n] ? h("div", { class: "d" }, RUN.details[n]) : null));
      }))),
    card("Log", null, log));
};
