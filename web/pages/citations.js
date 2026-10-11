// Citations: fills `references` and `cited_by` of every publication note from OpenAlex.
import { btn, busy, card, confirmBox, h, pill, savedIn, toast } from "../ui.js";

let LAST = null;

export const citations = {
  id: "citations", title: "Citations", icon: "🔗",
  desc: "Which library papers cite which, from OpenAlex, written into the properties references and cited_by of every publication note.",
  render(ctx) {
    const { backend } = ctx;
    const s = backend.settings;
    const P = backend.library.papers;
    const withDoi = P.filter(p => p.doi).length;
    const metric = (v, l) => h("div", { class: "metric" }, h("div", { class: "v" }, v), h("div", { class: "l" }, l));
    ctx.metrics = LAST ? [metric(LAST.publications, "publications"), metric(LAST.found, "found in OpenAlex"), metric(LAST.missing, "not in OpenAlex"), metric(LAST.links, "citations between papers")]
      : [metric(P.length, "publications"), metric(withDoi, "with a DOI"), metric(P.reduce((a, p) => a + p.refs.length, 0), "citations in the notes now")];
    const status = h("p", { class: "small muted", role: "status" }, LAST ? (LAST.apply ? `Written: ${LAST.written} notes changed.` : "Dry run: nothing written yet.") : "");
    const countBtn = btn("Count citations (dry run)", async e => {
      LAST = await busy(e.currentTarget, () => backend.citations({ onProgress: m => { status.textContent = m; } }), "Asking OpenAlex…");
      if (LAST) { toast(`${LAST.links} citations between library papers`, "ok"); ctx.rerender(); }
    });
    const writeBtn = btn("Write references and cited_by…", async e => {
      const ok = await confirmBox("Write the citation properties?", `The properties references and cited_by of all ${P.length} publication notes in "${s.libraryDir}" are rewritten from OpenAlex. Nothing else in the notes changes. Links to other publications are allowed only in these two properties.`, "Write");
      if (!ok) return;
      LAST = await busy(e.currentTarget, () => backend.citations({ apply: true, onProgress: m => { status.textContent = m; } }), "Writing…");
      if (LAST) { toast(`Written: ${LAST.written} notes changed`, "ok"); ctx.rerender(); }
    }, "primary");
    return h("div", {},
      h("div", { class: "grid2" },
        card("How it works", null, h("ul", { class: "interp" },
          h("li", {}, "Each paper with a DOI is looked up in OpenAlex; its reference list is matched against the other papers of the library."),
          h("li", {}, h("b", {}, "references"), " = library papers this paper cites; ", h("b", {}, "cited_by"), " = library papers citing it. Papers without a DOI, or not indexed, get empty lists."),
          h("li", {}, "A reference list can be incomplete, especially for older papers and books. Rerun after adding papers."),
          h("li", {}, s.mailto ? `Requests carry your email (${s.mailto}) for OpenAlex's polite pool.` : h("span", {}, "No email set for OpenAlex's polite pool — optional, set it in ", btn("Settings", () => window.settingsDialog(), "sm ghost"), ".")))),
        card("Run", "Count first; writing rewrites the two properties in every note.", h("div", { class: "row" }, countBtn, writeBtn), status,
          savedIn([[`${s.libraryDir}/*.md`, "properties references, cited_by"]]))),
      LAST ? card("Most cited within the library", `${LAST.found} of ${LAST.publications} papers were found in OpenAlex.`, h("table", { class: "tbl" },
        h("tr", {}, h("th", { class: "num" }, "Cited by"), h("th", {}, "Paper")),
        LAST.mostCited.map(m => h("tr", {}, h("td", { class: "num" }, m.count), h("td", {}, h("a", { href: backend.paperLink(m.stem), title: "Open in Obsidian" }, m.stem)))))) : null);
  },
};
