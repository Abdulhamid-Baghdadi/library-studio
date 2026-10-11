// Library overview: what is in the library, where the tools write, and the way into each tool.
import { btn, card, h, pill, savedIn, toast } from "../ui.js";

const metric = (v, l, cls = "") => h("div", { class: `metric ${cls}` }, h("div", { class: "v" }, v), h("div", { class: "l" }, l));
const count = (items) => { const m = new Map(); for (const x of items) m.set(x, (m.get(x) || 0) + 1); return [...m].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))); };

export const overview = {
  id: "overview", title: "Library", icon: "📚",
  desc: "The publication notes of this vault: what is in them, and what the tools write.",
  render(ctx) {
    const { backend } = ctx;
    const P = backend.library.papers, s = backend.settings;
    const cats = count(P.flatMap(p => p.categories));
    const tags = count(P.flatMap(p => p.tags));
    const statuses = count(P.map(p => p.status || "—"));
    const cites = P.reduce((a, p) => a + p.refs.length, 0);
    const last = backend.lastCluster;
    ctx.metrics = [
      metric(P.length, "publication notes"), metric(P.filter(p => p.doi).length, "with a DOI"), metric(P.filter(p => p.pdf).length, "with a PDF"),
      metric(cats.length, "concept maps"), metric(tags.length, "tags"), metric(cites, "citations between papers"),
      metric(P.filter(p => !p.categories.length).length, "without concept map", P.some(p => !p.categories.length) ? "bad" : "good"),
    ];
    ctx.actions = [btn("↻ Reload library", async e => { await backend.reload(); ctx.rerender(); toast("Library re-read from the vault", "ok"); }, "ghost")];
    const open = id => () => { localStorage.setItem("tool", id); location.reload(); };
    return h("div", {},
      h("div", { class: "grid2" },
        card("Concept maps", "Papers per concept map (`category` property).", h("table", { class: "tbl" },
          h("tr", {}, h("th", {}, "Concept map"), h("th", { class: "num" }, "Papers")),
          cats.map(([c, n]) => h("tr", {}, h("td", {}, c), h("td", { class: "num" }, n))),
          h("tr", {}, h("td", { class: "muted" }, "none"), h("td", { class: "num" }, P.filter(p => !p.categories.length).length)))),
        card("Reading status", "The `status` property.", h("div", { class: "row" }, statuses.map(([st, n]) => pill(`${st} · ${n}`))),
          h("h3", { style: "margin-top:16px" }, "Most used tags"), h("div", { class: "row" }, tags.slice(0, 20).map(([t, n]) => pill(`#${t} · ${n}`))))),
      h("div", { class: "grid2" },
        card("Cluster discovery", last ? `Last run ${last.finished}: ${last.clusters.length} clusters, Q = ${last.Q}, NMI vs concept maps ${last.nmi}.` : "No run yet in this browser.",
          h("div", { class: "row" }, btn("Open cluster discovery →", open("cluster"), "primary sm")),
          savedIn([[`${s.reportDir}/Cluster discovery report.md`, "report"], [s.hubDir, "hub notes"], [s.presetsFile, "[auto] presets"]])),
        card("Citations, links, export", null,
          h("ul", { class: "interp" },
            h("li", {}, h("b", {}, "Citations"), " — fills `references` and `cited_by` of every note from OpenAlex. ", btn("Open →", open("citations"), "sm ghost")),
            h("li", {}, h("b", {}, "Link check"), " — a publication note must not link to another one except in those two properties. ", btn("Open →", open("links"), "sm ghost")),
            h("li", {}, h("b", {}, "Export"), ` — Library.xlsx and an interactive graph page in ${s.exportDir}. `, btn("Open →", open("export"), "sm ghost"))))),
      backend.library.skipped.length ? h("p", { class: "small muted" }, `Not publication notes (ignored): ${backend.library.skipped.join(", ")}`) : null);
  },
};
