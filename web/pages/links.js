// Link check: a publication note must not link to another publication note, except in the citation property cites.
import { btn, busy, card, confirmBox, h, savedIn, toast } from "../ui.js";

let LAST = null;

export const links = {
  id: "links", title: "Link check", icon: "🧷",
  desc: "The vault rule: publication notes refer to each other in plain text, e.g. “Ulrich 1995 (No. 005)”; Obsidian links between them are allowed only in the generated property cites.",
  render(ctx) {
    const { backend } = ctx;
    const s = backend.settings;
    const checkBtn = btn("Check links", async e => {
      LAST = await busy(e.currentTarget, () => backend.checkLinks(), "Checking…");
      if (LAST) { toast(LAST.total ? `${LAST.total} link(s) between publication notes` : "No links between publication notes", LAST.total ? "" : "ok"); ctx.rerender(); }
    }, "primary");
    const fixBtn = LAST && LAST.total && !LAST.fixed ? btn("Fix all…", async e => {
      const button = e.currentTarget;                 // currentTarget is gone after the first await
      const ok = await confirmBox("Fix all links?", `Each of the ${LAST.total} link(s) in ${LAST.findings.length} note(s) becomes plain text: its alias, or "Authors Year (No. NNN)". This edits the notes in "${s.libraryDir}".`, "Fix all");
      if (!ok) return;
      LAST = await busy(button, () => backend.checkLinks({ fix: true }), "Fixing…");
      if (LAST) { toast(`Replaced ${LAST.total} link(s) with plain-text references`, "ok"); ctx.rerender(); }
    }) : null;
    return h("div", {},
      h("div", { class: "grid2" },
        card("Why", null, h("ul", { class: "interp" },
          h("li", {}, "Paper-to-paper links only in ", h("code", {}, "cites"), " keep the graph view readable: the Extended Graph plugin can hide those, and every other link to a paper means a concept map, a project note or a definition."),
          h("li", {}, h("code", {}, "cites"), " is written by Scoping Review Workbench and never changed here (older vaults: also ", h("code", {}, "references"), ", ", h("code", {}, "references_pdf"), ", ", h("code", {}, "cited_by"), ")."),
          h("li", {}, "Allowed in a publication note: its own PDF, concept maps in ", h("code", {}, "category"), ", and other non-publication notes."),
          h("li", {}, "Fixing replaces a link by its alias, or by “Authors Year (No. NNN)”."))),
        card("Run", null, h("div", { class: "row" }, checkBtn, fixBtn),
          LAST ? h("div", { class: `callout ${LAST.total && !LAST.fixed ? "warn" : "ok"}`, role: "status", style: "margin-top:12px" },
            LAST.fixed ? `Replaced ${LAST.total} link(s) with plain-text references.` : LAST.total ? `${LAST.total} link(s) between publication notes in ${LAST.findings.length} note(s).` : "No links between publication notes — the vault rule is respected.") : null,
          savedIn([[`${s.libraryDir}/*.md`, "the notes are edited in place when fixing"]]))),
      LAST && LAST.findings.length ? card(LAST.fixed ? "Fixed" : "Findings", null, h("table", { class: "tbl" },
        h("tr", {}, h("th", {}, "Note"), h("th", { class: "num" }, "Links"), h("th", {}, "Linked publications")),
        LAST.findings.map(f => h("tr", {}, h("td", {}, h("a", { href: backend.paperLink(f.stem), title: "Open in Obsidian" }, f.stem)), h("td", { class: "num" }, f.count),
          h("td", { class: "small muted" }, [...new Set(f.targets)].join("; ")))))) : null);
  },
};
