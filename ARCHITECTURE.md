# Architecture

Library Studio is a browser app whose data is an Obsidian vault folder on the user's PC. The code is split into layers so that the analysis and the note formats can be tested without a browser, run unchanged in Node and the browser, and always write the same files.

```
            ┌──────────────── ui ────────────────┐
            │  web/ pages, src/ui/backend.js      │
            └────────────────┬───────────────────┘
                             ▼
┌─ adapters ─┐   ┌──────── services ────────┐
│ node-folder│◄──│ use cases: open library, │
│ memory     │   │ cluster, enrich, links,   │
│ browser    │   │ export                    │
└─────┬──────┘   └─────┬─────────────┬──────┘
      │                ▼             ▼
      │          ┌── ports ──┐  ┌── domain ──┐
      └─────────►│ Folder,   │  │ pure rules │
     implements  │ Http      │  │ and formats│
                 └───────────┘  └────────────┘
```

## Design authority

This file is the app's design authority. It was written on 2026-10-11, before the shared design rules
([UA-SMARTLab/design-rules](https://github.com/UA-SMARTLab/design-rules)) existed, and was compared with them at commit
[`bf1d0d0`](https://github.com/UA-SMARTLab/design-rules/tree/bf1d0d0) on 2026-11-02; since then the app changes its own rules here and never the shared ones.

```mermaid
flowchart TD
    DR["<b>UA-SMARTLab/design-rules</b><br/>on GitHub, shared by all projects<br/>rules · skill · bibliography"]
    AR["<b>This project's ARCHITECTURE.md</b><br/>in git · the project's design authority<br/>the rules in this project's names<br/>departures: rule · why · date · propose back?"]
    CH["<b>architecture.json</b> and<br/>the project's own tests"]
    US(["The user, or a session<br/>on the user's word"])

    DR -- "1. compared once, at commit bf1d0d0<br/>(this file came first)" --> AR
    US -- "2. a rule added, changed or dropped:<br/>edited here, never upstream" --> AR
    AR -- "3. held by" --> CH
    AR -. "4. proposed back;<br/>the user decides" .-> DR
    DR -. "5. a later change upstream:<br/>taken in only on purpose" .-> AR
```

Solid arrows happen every time; dashed ones only when the user chooses.

## Layers

| Layer | Folder | Contains | May import |
|---|---|---|---|
| **domain** | `src/domain/` | Pure functions: note front matter, publication notes, the clustering text pipeline (TF-IDF), the similarity graph, the graph algorithms (Leiden, Louvain, consensus, betweenness, roles, NMI/ARI, layouts), the analysis, the generated notes and presets, OpenAlex requests and enrichment, the link rule, the export (xlsx and zip writers), the co-citation phases (counting and cleaning in `co-citation.js`, the VOS methods in `vos.js`, the whole analysis in `co-citation-analysis.js`, VOSviewer files, the note and the figure). No I/O, no clock, no platform APIs; randomness only through `random.js` with a seed. | domain |
| **ports** | `src/ports/` | Interfaces the services need from outside: `Folder` (the vault), `Http` (OpenAlex). Types only. | domain, ports |
| **services** | `src/services/` | Use cases: open the library, run cluster discovery and write its results, enrich from OpenAlex, check links, export, the co-citation phases (download the citing set, look up cited works, write the maps). Receive their ports as parameters. | domain, ports, services |
| **adapters** | `src/adapters/` | The ports for each platform: Node file system (command line, tests), in-memory (tests), browser File System Access API, `fetch`, IndexedDB store of opened vaults. | domain, ports, adapters |
| **ui** | `src/ui/` | `backend.js`: the open vault, its settings, one method per tool; runs the cluster analysis and the co-citation analysis in workers (`web/cluster-worker.js`, `web/co-citation-worker.js`). The page itself is `web/` (`main.js` start screen and shell, `pages/` one module per tool, `ui.js` DOM helpers). | the public API (`src/index.js`), adapters |

`npm run check` enforces the "may import" column and that domain, ports and services use no platform modules, so they run in the browser as they are.

## Rules

- **The vault is the contract.** File names, note formats and the presets file follow the vault's rules (its `CLAUDE.md` and `00 - Library/Library schema.md`); the citation property `cites` is written by Scoping Review Workbench and only read here. Older layouts and property names are still read, so existing vaults keep working. Text is read and written as it is: line endings are kept (the notes are CRLF on Windows).
- **Effects at the edges.** Dates, ids and file access are passed in; domain functions return values instead of writing. The analysis is a pure function of the notes and the settings (seeded randomness), so a run can be reproduced.
- **One module, one concern**, named after what it is about, with its API documented at the top.
- **Public API.** Code outside `src/` (web, bin, tests of the API) imports from `src/index.js`.

## Where it departs from the design rules

Compared on 2026-11-02 with the design rules at `bf1d0d0`, by reading the code and running `npm run check`,
`npm test` (123 pass), the design rules' citation check and a one-off search for import cycles (55 modules, none).
What agrees: the layers by the uses relation, one front door (`src/index.js`), no cycles, a pure domain (no clock or
`Math.random`; randomness only seeded through `random.js`), plain ES modules with no framework and no packages
(`scripts/build-site.js` only copies the files, no bundler), the vault's formats kept stable, light and dark themes
through CSS tokens.

None of these is worth proposing back (a suggestion; the user decides): each is work not yet done here, not a better
rule.

- **The layering check is not in the contract's form** (2026-11-02): `scripts/check-architecture.js` keeps its layer
  table in the code, not in an `architecture.json`, and does not look for cycles, so the design rules' audit tool
  cannot read it or draw the dependency matrix. To do: an `architecture.json`, a cycle test, the matrix.
- **The README shows no pictures** (2026-11-02): no animation of the main task, no light and dark screenshots, no
  diagram of its parts. To do: by the skill's `readme.md`.
- **A few colours outside the tokens** (2026-11-02): white text on status colours (`#fff`) and the start page's cyan
  gradient (`#06b6d4`) are written in place, not as tokens, so dark mode cannot change them. To do: tokens.
- **Not compared yet**: the rest of the UI rules (contrast, keyboard, targets, crowded views, feedback times), which
  need the app open in the browser pane in light, dark, by keyboard and at phone width.

## Tests

| Kind | Where | Run |
|---|---|---|
| Unit | `tests/unit/` | `npm test` |
| Architecture | `scripts/check-architecture.js` | `npm run check` |
| Citations | `tests/unit/design-citations.test.js`: every "Author (Year)" in a bibliography, the design rules' or this project's `bibliography.json` (11 subject papers, each matched against its record on 2026-11-02) | `npm test` |

The graph algorithms have their own tests (planted partitions, comparison with the reference formulas). The whole pipeline was also compared with the Python analysis it replaces on a real library: same vocabulary, same edges and weights, identical partition.
