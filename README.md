# Library Studio

**A workbench for a publication library kept as Obsidian notes. It runs in your browser and works directly on the vault folder on your own PC.**

**[▶ Open it in your browser](https://robotat-tube.github.io/library-studio/)** · Chrome or Edge on a computer · or run it locally with `Start Library Studio.cmd`

The library is a folder of publication notes (`00 - Library/NNN - Year - Authors - Title.md`, `type: publication`). Library Studio reads those notes and writes its results back into the vault; nothing is uploaded, there is no account, and everything it writes is a plain Markdown note, a JSON file or an export file.

## The tools

| Tool | What it does | Writes |
|---|---|---|
| **Library** | What is in the library: papers per concept map, reading status, tags; the way into each tool. | — |
| **Cluster discovery** | Groups the papers by what they are about (TF-IDF text similarity between mutual nearest neighbours, shared tags, wikilinks), finds communities with the Leiden algorithm repeated 100 times and combined by consensus clustering, checks robustness with a CPM density sweep, finds bridge papers (participation coefficient, betweenness), and compares the result with your concept maps (NMI, ARI). Interactive map and cluster cards on the page. | `Cluster discovery report.md`; unless it is a dry run: one hub note per cluster and the `[auto]` presets of the Graph Presets plugin (close Obsidian first). |
| **Citations** | Which library papers cite which, from each paper's OpenAlex reference list (looked up by DOI). | The properties `references` and `cited_by` of every publication note. |
| **Enrich** | Fills *empty* properties from OpenAlex (full author names, journal, year, URL, the Abstract section), proposes what it is unsure of (`suggested_doi` by exact title and year, `suggested_category` = nearest concept map by content), reports differences between note and OpenAlex, and lists what no database can fill. Existing values are never changed. | The notes (only empty properties, `suggested_*`, `enriched_by`); `00 - Library/Gaps.md`, `Candidates.md` (papers cited by 3+ library papers, not yet in the library), `References.json` (full reference lists). |
| **Link check** | The vault rule: a publication note must not link to another publication note except in those two properties. Finds violations and can replace them by plain text ("Authors Year (No. NNN)"). | The notes, when fixing. |
| **Export** | The library for colleagues who work in MS Office, and as BibTeX for reference managers and LaTeX/Pandoc. | `96 - Library export/Library.xlsx` (papers, citations, concept maps), `Library graph.html` (interactive network) and `00 - Library/Library.bib` (one entry per note; cite keys = the notes' `citekey` property, added once and then kept). |

Settings (⚙ in the sidebar, per vault): the library folder, where hub notes, report, presets and exports go, the vault's name for "Open in Obsidian" links, and an email for OpenAlex's polite pool.

## Getting started

1. Open **https://robotat-tube.github.io/library-studio/** in **Chrome or Edge** on a computer (or start it locally, see below).
2. **Open a vault folder…** and choose the vault (the folder that contains `00 - Library`). The browser asks once per visit before the app may read and edit files in it.
3. Pick a tool in the sidebar. Every page says where its results are saved.

Cluster discovery defaults to a **dry run** (report only). Untick it to replace the hub notes and the graph presets: close Obsidian first, so its Graph Presets plugin does not overwrite the new presets, and reload Obsidian afterwards.

## Run it on your own computer

Needs [Node.js](https://nodejs.org) 20 or newer; there are no other dependencies.

- Windows: double-click `Start Library Studio.cmd` · Mac: `Start Library Studio.command` (the first time: right-click → Open) · Linux: `start-library-studio.sh`
- or `npm run serve` and open http://localhost:8771/web/

The same engine runs from the command line, on a vault folder on disk:

```
node bin/library-studio.js cluster --vault "<vault>" [--write] [--runs 100 --k 5 --algorithm leiden --quality modularity --resolution 1]
node bin/library-studio.js citations --vault "<vault>" [--apply] [--mailto you@example.org]
node bin/library-studio.js enrich --vault "<vault>" [--apply] [--mailto you@example.org] [--api-key <key>]
node bin/library-studio.js check-links --vault "<vault>" [--fix]
node bin/library-studio.js export --vault "<vault>" [--no-citekeys]
```

The BibTeX entry type follows `publication_type` (journal-article → `@article`, conference-paper → `@inproceedings`, book-chapter → `@incollection`, thesis → `@phdthesis`, reports → `@techreport`, standards and datasets → `@misc`); the `file` field points to the PDF in `PDFs/`. Author strings are read in the formats the notes use ("Forster, P.; Storelvmo, T.", "Piers Forster; Trude Storelvmo", "Baldwin & Clark", "Stone Wood & Crawford", "Hirtz et al."); organisations are kept whole. The cite key is the first author's surname plus the year (`ulrich1995`, `baldwin2000a`), or an organisation's initials (`iso2006`).

## Algorithm first, Claude for the gaps

Everything a database knows comes from OpenAlex, deterministically and repeatably. What it cannot know (papers without a DOI, reference lists OpenAlex lacks, standards, reports, old proceedings) is listed in `Gaps.md`, and only that list goes to a reading pass: the Claude skill [`library-fill-gaps`](.claude/skills/library-fill-gaps/SKILL.md) reads those PDFs and writes verbatim abstracts, full author names and `references_pdf` (library papers found in the PDF's reference list), each note marked `enriched_by: pdf (Claude <date>)`. The citations tool counts `references_pdf` in `cited_by`, and the link check allows it. You review proposals and differences in `Gaps.md`.

OpenAlex has a free daily budget (about 1000 credits; a lookup of 50 DOIs costs 1, a title search 10). When it runs out the tools stop at once with a message and keep what they have. A free API key from openalex.org (Settings, or `--api-key` / `OPENALEX_API_KEY` on the command line) raises it.

## Method (cluster discovery)

1. **Graph** — nodes are the publication notes; edges combine (a) TF-IDF cosine similarity of the note text (title, tags, the sections about the paper; template lines repeated in 3+ notes are ignored), kept only between mutual k-nearest neighbours, (b) shared tags weighted by inverse document frequency, (c) explicit wikilinks between notes. The hand-made `category` field is not used, so the clusters are an independent check of the concept maps.
2. **Communities** — Leiden (Traag, Waltman & van Eck 2019) optimising modularity with resolution γ (Reichardt & Bornholdt 2006) or the Constant Potts Model; repeated with different seeds and combined by consensus clustering (Lancichinetti & Fortunato 2012). Louvain (Blondel et al. 2008) is available for comparison.
3. **Robustness** — CPM sweep over density thresholds 1–32 × the graph density; clusters that stay together are robust cores.
4. **Quality and roles** — modularity Q; participation coefficient P and within-module degree z (Guimerà & Amaral 2005); betweenness (Freeman 1977). Bridge papers: P ≥ 0.5 or among the most central by betweenness.
5. **Labels** — terms whose TF-IDF weight is highest in the cluster relative to the rest of the library.

The whole analysis is deterministic for a given seed and runs in about a second for 200 notes. It replaces a Python script (networkx, scikit-learn, leidenalg) and was checked against it: same graph, same vocabulary, identical partition on the library it was built for.

## For developers

Plain JavaScript (ES modules), no framework, no bundler, no dependencies. The code is split into layers (domain rules, ports, services, adapters, UI); see [ARCHITECTURE.md](ARCHITECTURE.md).

```
npm test                 # unit tests
npm run check            # architecture: each layer imports only what it may
npm run serve            # http://localhost:8771/web/
npm run build            # the static site in dist/
node scripts/serve.js 8771 --fixture "<copy of a vault>"   # then open /web/?fixture to test without the folder picker
```

Every push to `main` is tested, built and published on GitHub Pages (`.github/workflows/pages.yml`). Vault data is never part of this repository.
