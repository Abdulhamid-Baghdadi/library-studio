// Export: Library.xlsx and an interactive graph page for colleagues who do not use Obsidian.
import { btn, busy, card, confirmBox, h, savedIn, toast } from "../ui.js";

let LAST = null;

export const exportPage = {
  id: "export", title: "Export", icon: "📊",
  desc: "The library as a workbook (one row per paper, the citations, the papers per concept map) and as an interactive graph page.",
  render(ctx) {
    const { backend } = ctx;
    const s = backend.settings;
    const missing = backend.citekeysMissing;
    const runBtn = btn("Export now", async e => {
      if (missing && !(await confirmBox("Add cite keys to the notes?", `${missing} publication note(s) have no citekey property yet. The export adds one (e.g. ulrich1995) after the doi property of each, so the BibTeX entries have stable keys. Nothing else in the notes changes.`, "Add keys and export"))) return;
      LAST = await busy(e.currentTarget, () => backend.export(), "Writing…");
      if (LAST) { toast(`Exported ${LAST.papers} papers` + (LAST.bibtex.citekeysWritten ? `; citekey added to ${LAST.bibtex.citekeysWritten} notes` : ""), "ok"); ctx.rerender(); }
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
          h("li", {}, h("b", {}, "Library.bib"), ` — one BibTeX entry per paper (author, title, year, venue, DOI, keywords, abstract, PDF file), in ${s.libraryDir}. Zotero, Mendeley, JabRef, Pandoc and the Obsidian Citations plugin read it. Cite keys are the notes' `, h("code", {}, "citekey"), " property: added once, then kept, so you can rename a key in the note."),
          h("li", {}, "The vault stays the source: rerun after changing the library. PDF links work while the files stay in the vault folder next to the library."))),
        card("Run", null, h("div", { class: "row" }, runBtn,
          LAST ? btn("⬇ Download Library.xlsx", download(`${s.exportDir}/Library.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"), "ghost") : null,
          LAST ? btn("Open graph page ↗", openPage, "ghost") : null,
          LAST ? btn("⬇ Download Library.bib", download(`${s.libraryDir}/Library.bib`, "application/x-bibtex"), "ghost") : null),
        LAST ? h("div", { class: "callout ok", role: "status", style: "margin-top:12px" }, `${LAST.papers} papers · graph: ${LAST.nodes} nodes, ${LAST.edges} links · BibTeX: ${LAST.bibtex.entries} entries.`) : null,
        missing ? h("p", { class: "small muted" }, `${missing} note(s) without a citekey property: the export adds them (you are asked first).`) : null,
        savedIn([[`${s.exportDir}/Library.xlsx`], [`${s.exportDir}/Library graph.html`], [`${s.libraryDir}/Library.bib`], [`${s.libraryDir}/*.md`, "citekey property"]]))));
  },
};
