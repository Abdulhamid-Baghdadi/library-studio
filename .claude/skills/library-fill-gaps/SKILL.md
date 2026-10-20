---
name: library-fill-gaps
description: Work through Gaps.md of a publication library (Library Studio): read the PDFs of the papers no database could fill and write what they say into the notes (abstract, authors, year, venue, and the reference list into an empty cites), with provenance. Use when the user asks to fill the gaps, complete the metadata or references from the PDFs, or run the reading pass of the library.
---

# Fill the gaps of the library from the PDFs

The library is a folder of publication notes (`00 - Library/Publication Summary/NNN - Year - Authors - Title.md`, `type: publication`) in an Obsidian vault; the PDFs are in `00 - Library/PDFs/`. Library Studio's **enrich** tool has already filled everything OpenAlex knows and written `00 - Library/Publication Summary/Gaps.md`: the papers that remain incomplete and why. Your job is the reading pass over that list, nothing more. You never decide what a paper means; you copy what it says. The vault's `CLAUDE.md` and `00 - Library/Library schema.md` are the rules; where they differ from this skill, they win.

## Before you start

1. Ask which vault, if more than one is open. Run Library Studio's enrich tool first if `Gaps.md` is older than the notes (`node bin/library-studio.js enrich --vault "<vault>" --apply`, from the Library Studio folder).
2. Read `Gaps.md`. Each bullet names a note, its gaps and its PDF (in `00 - Library/PDFs/`).
3. Work on the real notes only with the user's go-ahead; otherwise work on a copy and show the diff.

## For each paper in "Papers with gaps"

Open the PDF (the `pdf` skill). If it has no PDF, is unreadable or is a scan without text, skip it: it stays in `Gaps.md` for the user.

| Gap | What to write | Where |
|---|---|---|
| authors known by surname only | the full author names from the first page, `First Last; First Last` | `authors` property (replace the surnames-only value) |
| no abstract | the abstract **verbatim** from the PDF | under `## Abstract` in the body |
| no DOI | a DOI printed in the PDF, if any | `suggested_doi` property (never `doi`) |
| year / journal empty | as printed | `year`, `journal` properties |
| OpenAlex has no reference list / DOI not indexed / no DOI, **and `cites` is empty** | the PDF's reference list, one entry per reference | `cites` property, as Scoping Review Workbench writes it (below) |

`cites` entries, in the order of the reference list: `"[[NNN - Year - Authors - Title]]"` when the work is a library paper (same DOI, or same title ignoring case and punctuation, year and first author; when in doubt, not a link); otherwise its DOI (`"10.1016/…"`, lower case) when the PDF prints one; otherwise the reference as printed. Never change a `cites` that already has entries: it comes from OpenAlex and belongs to the Workbench.

After editing a note add provenance to `enriched_by:` — `pdf (Claude <today>)` for metadata and abstract, `pdf references (Claude <today>)` for a reference list. Keep the note's line endings and the property order of `Library schema.md` (… `tags`, hand-written properties, `enriched_by`, `added_by`, `added_on`, `included_in`, and `cites` last).

## Rules

- Verbatim means verbatim: no paraphrase, no "improved" abstract. Hyphenation at line breaks may be joined; nothing else changes.
- Do not write summaries, "why this paper matters", definitions or tags here. That is separate work the user asks for explicitly.
- Do not fill `category` or `doi`; propose through `suggested_category` / `suggested_doi` only.
- A publication note must not link to another publication note except in `cites`. Everything else in plain text ("Ulrich 1995 (No. 005)"). Run the link check afterwards: `node bin/library-studio.js check-links --vault "<vault>"`.
- Finish with Scoping Review Workbench's offline relink, from the vault folder: `node "<Scoping Review Workbench>/bin/check-citations.js"` (preview; `--write` to save), so DOIs of library papers become links; then Library Studio's `export` (Library.bib).

## Report

List what you wrote per note (property, how many references and how many of them library links), what you could not read, and what still needs the user (DOIs to confirm, concept maps to accept). Point to `Gaps.md` for the remaining items.
