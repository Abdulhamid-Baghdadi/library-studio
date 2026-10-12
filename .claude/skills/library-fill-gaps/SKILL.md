---
name: library-fill-gaps
description: Work through Gaps.md of a publication library (Library Studio): read the PDFs of the papers no database could fill and write what they say into the notes (references_pdf, abstract, authors, year, venue), with provenance. Use when the user asks to fill the gaps, complete the metadata or references from the PDFs, or run the reading pass of the library.
---

# Fill the gaps of the library from the PDFs

The library is a folder of publication notes (`98 - Publications/NNN - Year - Authors - Title.md`, `type: publication`) in an Obsidian vault. Library Studio's **enrich** tool has already filled everything OpenAlex knows and written `98 - Publications/Gaps.md`: the papers that remain incomplete and why. Your job is the reading pass over that list, nothing more. You never decide what a paper means; you copy what it says.

## Before you start

1. Ask which vault, if more than one is open. Run Library Studio's enrich tool first if `Gaps.md` is older than the notes (`node bin/library-studio.js enrich --vault "<vault>" --apply`, from the Library Studio folder).
2. Read `Gaps.md`. Each bullet names a note, its gaps and its PDF (`98 - Publications/PDFs/…`).
3. Work on the real notes only with the user's go-ahead; otherwise work on a copy and show the diff.

## For each paper in "Papers with gaps"

Open the PDF (the `pdf` skill). If it has no PDF, is unreadable or is a scan without text, skip it: it stays in `Gaps.md` for the user.

| Gap | What to write | Where |
|---|---|---|
| authors known by surname only | the full author names from the first page, `First Last; First Last` | `authors` property (replace the surnames-only value) |
| no abstract | the abstract **verbatim** from the PDF | under `## Abstract` in the body |
| no DOI | a DOI printed in the PDF, if any | `suggested_doi` property (never `doi`) |
| year / journal empty | as printed | `year`, `journal` properties |
| OpenAlex has no reference list / DOI not indexed / no DOI | the entries of the PDF's reference list that are library papers | `references_pdf` property: a list of links `"[[NNN - Year - Authors - Title]]"` to those notes |

Matching a reference to a library paper: same DOI, or same title (ignoring case and punctuation) and year. When in doubt, leave it out. Never write into `references` or `cited_by`: those belong to the OpenAlex tool, which recomputes `cited_by` from both `references` and `references_pdf`.

After editing a note add provenance: `enriched_by:` list item `pdf (Claude <today>)`. Keep the note's line endings and property order; add missing properties next to the related ones (`references_pdf` after `references`).

## Rules

- Verbatim means verbatim: no paraphrase, no "improved" abstract. Hyphenation at line breaks may be joined; nothing else changes.
- Do not write summaries, "why this paper matters", definitions or tags here. That is separate work the user asks for explicitly.
- Do not fill `category` or `doi`; propose through `suggested_category` / `suggested_doi` only.
- A publication note must not link to another publication note except in `references`, `references_pdf` and `cited_by`. Everything else in plain text ("Ulrich 1995 (No. 005)"). Run the link check afterwards: `node bin/library-studio.js check-links --vault "<vault>"`.
- Finish with `node bin/library-studio.js citations --vault "<vault>" --apply` (recomputes `cited_by` with your `references_pdf`) and `export` (Library.bib).

## Report

List what you wrote per note (property, how many references matched), what you could not read, and what still needs the user (DOIs to confirm, concept maps to accept). Point to `Gaps.md` for the remaining items.
