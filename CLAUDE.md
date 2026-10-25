# Library Studio — notes for Claude

A browser app for a publication library kept as Obsidian notes (`00 - Library/Publication Summary/NNN - Year - Authors - Title.md`, `type: publication`; PDFs and `Library.bib` in `00 - Library`; older vaults kept the notes in `00 - Library` or `98 - Publications`, still found). It reads and writes the vault folder through the File System Access API; nothing is uploaded. Tools: cluster discovery, co-citation phases (time-phase co-citation maps of a literature from an OpenAlex search, as in Mertens et al. 2023: VOSviewer files, a figure and an evidence-synthesis note; each analysis keeps its settings and downloaded data in `tmp/co-citation/<name>`), enrich (OpenAlex metadata, proposals, Gaps.md / Candidates.md / References.json), the publication-link rule, export (xlsx + graph page + Library.bib). The Claude skill `.claude/skills/library-fill-gaps` does the reading pass over Gaps.md. It replaced the Python scripts of `95 - Tools` in the vault `Modular_Electronics_Obsidian v1`.

The vault in use is `Obsidian Research Library` (its `CLAUDE.md` and `00 - Library/Library schema.md` are the rules for the notes). The citations between papers belong to Scoping Review Workbench (repo `Abdulhamid-Baghdadi/scoping-review-workbench`, `Desktop\Scoping Review Workbench`): it writes `cites` (Report → Check citations, `bin/check-citations.js`). Library Studio only reads `cites` (export, link check); its own Citations tool, which wrote `references` / `cited_by`, was removed on 2026-10-20.

## Working with the user

- Ask questions and offer next steps as clickable choices (AskUserQuestion, 2–4 options, recommended first).
- After a change: test it (`npm test`, `npm run check`), check the page in the browser (light and dark, keyboard), commit and push when the user wants.

## Architecture (see ARCHITECTURE.md; `npm run check` enforces it)

- `src/domain` pure rules (no I/O, dates, platform APIs; randomness only via `random.js`) · `src/ports` interfaces (Folder, Http) · `src/services` use cases · `src/adapters` platform code · `src/ui/backend.js` the page's backend · `web/` the page (`main.js`, `pages/*.js`, `ui.js`, `cluster-worker.js`, `co-citation-worker.js`).
- The page calls `window.backend` instead of a server. The cluster analysis and the co-citation analysis run in module workers that get the vault's directory handle.

## Run and test

- `Start Library Studio.cmd` or `npm run serve` → http://localhost:8771/web/ — Chrome or Edge in a normal window.
- `npm test` unit tests · `npm run check` architecture · `npm run build` → `dist/`.
- Browser automation cannot use the folder picker: `node scripts/serve.js 8771 --fixture "<copy of a vault>"` and open `/web/?fixture` — `web/dev.js` copies the fixture into the browser's storage and opens it. Never test on the user's real vault; use a copy (notes only, empty files in place of PDFs are fine).
- Command line: `node bin/library-studio.js cluster|enrich|check-links|export|co-citation --vault "<vault>"`.
- Co-citation: the replica's data reproduces its report (`tests/unit/co-citation-replica.test.js`; set `CO_CITATION_REPLICA` to a folder with its `citing/` and `cited/`, `cited/requested.json` = its `candidate_ids.json`). Keep that test passing when the counting, cleaning, clustering or layout change.

## OpenAlex budget

- OpenAlex has a free daily budget (about 1000 credits; filter lookups 1, searches 10). Repeated test runs against the real API use it up for the day (429 with Retry-After of many hours). Test with fake `http` objects (see tests/unit/openalex-works.test.js); hit the real API only for a final check. `getJson` throws `OpenAlexBudgetError` at once instead of waiting.
- Citing sets (co-citation): `title_abstract_keywords.search.exact` is a search, 10 credits per page of 200. Cursor paging returned 401 after page 1, so pages are fetched by number, which OpenAlex allows up to 10,000 results; larger searches are split into year ranges. Cited-work lookups by id are filters (1 credit per 100).

## Writing code here

- Write JavaScript with the Write/Edit tools, not shell heredocs. Never put U+2028/U+2029 or other line separators literally into a regex; write the escape `\u2028` inside a string passed to `new RegExp`.
- Keep the vault format stable: note names, the property order of `Library schema.md` (`cites` last), the hub note and report layout, the `[auto] ` preset names. Never write `cites` (the Workbench owns it). Line endings of existing notes are kept (CRLF on Windows).
- When the vault's rules change (its `CLAUDE.md`, `Library schema.md`, the Workbench's `library-citations.js`), check this app against them: folder, property names, what is allowed in the link check.
- The analysis must stay deterministic for a seed; `tests/unit/community.test.js` and `graph-metrics.test.js` compare with the reference formulas.
- Hosting: GitHub Pages from Abdulhamid-Baghdadi/library-studio (`.github/workflows/pages.yml`, on every push to main).

## UI rules

The same rules as Scoping Review Workbench (its `CLAUDE.md`; full rules, sources and checks in its `docs/ui-ux-rules.md`). Check every page change against them before reporting it done:

- **Show status.** Every action gives feedback (toast, busy button, updated counts); long jobs show progress; each tool says where it writes (`savedIn`).
- **Words.** The library's own terms (publication note, enrich, link check, cluster), never code names; the same word for the same thing everywhere; help next to each setting (`web/help.js`).
- **Control.** Writing to the vault or bulk changes ask first (`confirmBox`), naming the action and how many notes it touches; preview before writing where there is one.
- **Consistency.** The shared helpers in `web/ui.js` (`h`, `btn`, `pill`, `segmented`, `card`, `modal`, `confirmBox`, `savedIn`) and the CSS tokens (`--accent`, `--muted`, `--border` …); never hard-coded colours.
- **Prevent errors.** Disable buttons that cannot work and say why; errors in plain language with what to do next (e.g. "Choose the vault folder first").
- **Minimal.** One primary button per card; secondary actions as ghost buttons; options visible rather than remembered.
- **Accessible (WCAG 2.2 AA):** text contrast ≥ 4.5:1 (UI parts ≥ 3:1) in light and dark; visible keyboard focus; everything clickable reachable by keyboard; targets ≥ 24 × 24 px; no information by colour alone; `prefers-reduced-motion` respected.
- **Verify** every UI change in the browser pane, in light and dark and with the keyboard.
