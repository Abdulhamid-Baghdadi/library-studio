// Enrich: fills empty metadata from OpenAlex, proposes what is uncertain, and writes the gaps and candidate lists.
import { btn, busy, card, confirmBox, h, pill, savedIn, toast } from "../ui.js";

let LAST = null;

const row = (a, b) => h("tr", {}, h("td", { class: "muted" }, a), h("td", { class: "num" }, b));

export const enrich = {
  id: "enrich", title: "Enrich", icon: "✨",
  desc: "Fills empty properties from OpenAlex, proposes a DOI or a concept map where it is not sure, and lists what no database can fill: the reading list for Claude or for you.",
  render(ctx) {
    const { backend } = ctx;
    const s = backend.settings;
    const P = backend.library.papers;
    const metric = (v, l) => h("div", { class: "metric" }, h("div", { class: "v" }, v), h("div", { class: "l" }, l));
    ctx.metrics = [metric(P.length, "publications"), metric(P.filter(p => !p.doi).length, "without DOI"), metric(P.filter(p => !p.abstract).length, "without abstract"),
      metric(P.filter(p => !p.categories.length).length, "without concept map"), metric(P.filter(p => p.enrichedBy.length).length, "enriched before")];
    const status = h("p", { class: "small muted", role: "status" }, LAST ? (LAST.apply ? `Written: ${LAST.written} notes changed, 3 report files.` : "Dry run: nothing written yet.") : "");
    const dryBtn = btn("Dry run", async e => {
      const button = e.currentTarget;
      LAST = await busy(button, () => backend.enrich({ onProgress: m => { status.textContent = m; } }), "Asking OpenAlex…");
      if (LAST) { toast(`${LAST.matched} of ${LAST.papers} papers found in OpenAlex`, "ok"); ctx.rerender(); }
    });
    const applyBtn = btn("Apply…", async e => {
      const button = e.currentTarget;
      const n = LAST ? ` (last dry run: ${Object.values(LAST.fills).reduce((a, b) => a + b, 0)} fills, ${LAST.suggestions.doi + LAST.suggestions.category} proposals)` : "";
      const ok = await confirmBox("Enrich the notes?", `Empty properties in "${s.libraryDir}" are filled from OpenAlex, proposals go into suggested_doi / suggested_category, and Gaps.md, Candidates.md and References.json are rewritten${n}. Existing values are never changed; each touched note gets an enriched_by entry.`, "Apply");
      if (!ok) return;
      LAST = await busy(button, () => backend.enrich({ apply: true, onProgress: m => { status.textContent = m; } }), "Writing…");
      if (LAST) { toast(`Enriched: ${LAST.written} notes changed`, "ok"); ctx.rerender(); }
    }, "primary");
    const summary = LAST ? card(LAST.apply ? "Written" : "What would be written", `${LAST.matched} of ${LAST.papers} papers found in OpenAlex by DOI.`,
      LAST.incomplete ? h("div", { class: "callout warn small", role: "status", style: "margin-bottom:10px" }, "⚠ ", LAST.incomplete) : null,
      h("div", { class: "grid2" },
        h("table", { class: "tbl" }, h("tr", {}, h("th", {}, "Fills (empty properties)"), h("th", {})),
          row("authors (full names)", LAST.fills.authors), row("journal / venue", LAST.fills.journal), row("year", LAST.fills.year), row("url", LAST.fills.url), row("abstract section", LAST.fills.abstract)),
        h("table", { class: "tbl" }, h("tr", {}, h("th", {}, "To review"), h("th", {})),
          row("suggested_doi", LAST.suggestions.doi), row("suggested_category", LAST.suggestions.category), row("disagreements note vs OpenAlex", LAST.disagreements),
          row("papers with gaps (for the reading pass)", LAST.gaps), row("candidate papers (cited by 3+ library papers)", LAST.candidates))),
      LAST.apply ? h("div", { class: "row", style: "margin-top:10px" },
        h("a", { class: "btn sm", href: backend.noteLink(`${s.libraryDir}/Gaps.md`) }, "Open Gaps.md"), h("a", { class: "btn sm", href: backend.noteLink(`${s.libraryDir}/Candidates.md`) }, "Open Candidates.md")) : null) : null;
    return h("div", {},
      h("div", { class: "grid2" },
        card("How it works", null, h("ul", { class: "interp" },
          h("li", {}, h("b", {}, "Facts"), " come from the paper's DOI in OpenAlex and fill only empty properties: authors (full names, also when the note only has the as-cited surnames), journal, year, URL, and the Abstract section. Existing values are never overwritten; differences are reported."),
          h("li", {}, h("b", {}, "Proposals"), " are written apart: ", h("code", {}, "suggested_doi"), " when a paper without DOI is found by exact title and year, ", h("code", {}, "suggested_category"), " for notes without a concept map (nearest concept map by content). You accept by moving the value."),
          h("li", {}, h("b", {}, "Gaps.md"), " lists what no database can fill; the Claude skill ", h("code", {}, "library-fill-gaps"), " reads those PDFs and writes into ", h("code", {}, "references_pdf"), " and the abstract. ", h("b", {}, "Candidates.md"), " lists papers cited by three or more library papers that are not in the library."),
          h("li", {}, s.mailto ? `Requests carry your email (${s.mailto}) for OpenAlex's polite pool.` : h("span", {}, "No email set for OpenAlex's polite pool — optional, set it in ", btn("Settings", () => window.settingsDialog(), "sm ghost"), ".")))),
        card("Run", "Dry run first; apply writes the notes and the three files.", h("div", { class: "row" }, dryBtn, applyBtn), status,
          savedIn([[`${s.libraryDir}/*.md`, "empty properties, suggested_*, enriched_by, Abstract"], [`${s.libraryDir}/Gaps.md`], [`${s.libraryDir}/Candidates.md`], [`${s.libraryDir}/References.json`, "full reference lists"]]))),
      summary);
  },
};
