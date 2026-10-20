# Library Studio — notes for Claude

A browser app for a publication library kept as Obsidian notes (`00 - Library/Publication Summary/NNN - Year - Authors - Title.md`, `type: publication`; PDFs and `Library.bib` in `00 - Library`; older vaults kept the notes in `00 - Library` or `98 - Publications`, still found). It reads and writes the vault folder through the File System Access API; nothing is uploaded. Tools: cluster discovery, enrich (OpenAlex metadata, proposals, Gaps.md / Candidates.md / References.json), the publication-link rule, export (xlsx + graph page + Library.bib). The Claude skill `.claude/skills/library-fill-gaps` does the reading pass over Gaps.md. It replaced the Python scripts of `95 - Tools` in the vault `Modular_Electronics_Obsidian v1`.

The vault in use is `Obsidian Research Library` (its `CLAUDE.md` and `00 - Library/Library schema.md` are the rules for the notes). The citations between papers belong to Scoping Review Workbench (repo `Abdulhamid-Baghdadi/scoping-review-workbench`, `Desktop\Scoping Review Workbench`): it writes `cites` (Report → Check citations, `bin/check-citations.js`). Library Studio only reads `cites` (export, link check); its own Citations tool, which wrote `references` / `cited_by`, was removed on 2026-10-20.

## Working with the user

- Ask questions and offer next steps as clickable choices (AskUserQuestion, 2–4 options, recommended first).
- After a change: test it (`npm test`, `npm run check`), check the page in the browser (light and dark, keyboard), commit and push when the user wants.

## Architecture (see ARCHITECTURE.md; `npm run check` enforces it)

- `src/domain` pure rules (no I/O, dates, platform APIs; randomness only via `random.js`) · `src/ports` interfaces (Folder, Http) · `src/services` use cases · `src/adapters` platform code · `src/ui/backend.js` the page's backend · `web/` the page (`main.js`, `pages/*.js`, `ui.js`, `cluster-worker.js`).
- The page calls `window.backend` instead of a server. The cluster analysis runs in a module worker that gets the vault's directory handle.

## Run and test

- `Start Library Studio.cmd` or `npm run serve` → http://localhost:8771/web/ — Chrome or Edge in a normal window.
- `npm test` unit tests · `npm run check` architecture · `npm run build` → `dist/`.
- Browser automation cannot use the folder picker: `node scripts/serve.js 8771 --fixture "<copy of a vault>"` and open `/web/?fixture` — `web/dev.js` copies the fixture into the browser's storage and opens it. Never test on the user's real vault; use a copy (notes only, empty files in place of PDFs are fine).
- Command line: `node bin/library-studio.js cluster|enrich|check-links|export --vault "<vault>"`.

## OpenAlex budget

- OpenAlex has a free daily budget (about 1000 credits; filter lookups 1, searches 10). Repeated test runs against the real API use it up for the day (429 with Retry-After of many hours). Test with fake `http` objects (see tests/unit/openalex-works.test.js); hit the real API only for a final check. `getJson` throws `OpenAlexBudgetError` at once instead of waiting.

## Writing code here

- Write JavaScript with the Write/Edit tools, not shell heredocs. Never put U+2028/U+2029 or other line separators literally into a regex; write the escape `\u2028` inside a string passed to `new RegExp`.
- Keep the vault format stable: note names, the property order of `Library schema.md` (`cites` last), the hub note and report layout, the `[auto] ` preset names. Never write `cites` (the Workbench owns it). Line endings of existing notes are kept (CRLF on Windows).
- When the vault's rules change (its `CLAUDE.md`, `Library schema.md`, the Workbench's `library-citations.js`), check this app against them: folder, property names, what is allowed in the link check.
- The analysis must stay deterministic for a seed; `tests/unit/community.test.js` and `graph-metrics.test.js` compare with the reference formulas.
- Hosting: GitHub Pages from Abdulhamid-Baghdadi/library-studio (`.github/workflows/pages.yml`, on every push to main).
