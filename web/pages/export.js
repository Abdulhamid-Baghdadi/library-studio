// Export: Library.xlsx and an interactive graph page for colleagues who do not use Obsidian.
import { btn, busy, card, h, savedIn, toast } from "../ui.js";

let LAST = null;

export const exportPage = {
  id: "export", title: "Export", icon: "📊",
  desc: "The library as a workbook (one row per paper, the citations, the papers per concept map) and as an interactive graph page.",
  render(ctx) {
    const { backend } = ctx;
    const s = backend.settings;
    const runBtn = btn("Export now", async e => {
      LAST = await busy(e.currentTarget, () => backend.export(), "Writing…");
      if (LAST) { toast(`Exported ${LAST.papers} papers`, "ok"); ctx.rerender(); }
    }, "primary");
    const download = (path, type) => async e => {
      const url = await backend.fileUrl(path, type);
      const a = Object.assign(document.createElement("a"), { href: url, download: path.split("/").pop() });
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    };
    const openPage = async () => { window.open(await backend.fileUrl(`${s.exportDir}/Library graph.html`, "text/html"), "_blank"); };
    return h("div", {},
      h("div", { class: "grid2" },
        card("What is written", null, h("ul", { class: "interp" },
          h("li", {}, h("b", {}, "Library.xlsx"), " — sheet Library: one row per paper with filters and links to the DOI and the PDF; sheet Citations: who cites whom; sheet Concept maps: the papers per map."),
          h("li", {}, h("b", {}, "Library graph.html"), " — papers and concept maps as a network, with switches per link type; opens in any browser."),
          h("li", {}, "The vault stays the source: rerun after changing the library. PDF links work while the files stay in the vault folder next to the library."))),
        card("Run", null, h("div", { class: "row" }, runBtn,
          LAST ? btn("⬇ Download Library.xlsx", download(`${s.exportDir}/Library.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"), "ghost") : null,
          LAST ? btn("Open graph page ↗", openPage, "ghost") : null),
        LAST ? h("div", { class: "callout ok", role: "status", style: "margin-top:12px" }, `${LAST.papers} papers · graph: ${LAST.nodes} nodes, ${LAST.edges} links.`) : null,
        savedIn([[`${s.exportDir}/Library.xlsx`], [`${s.exportDir}/Library graph.html`]]))));
  },
};
