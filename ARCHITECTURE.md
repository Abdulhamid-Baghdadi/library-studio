# Architecture

Library Studio is a browser app whose data is an Obsidian vault folder on the user's PC. The code is split into layers so that the analysis and the note formats can be tested without a browser, run unchanged in Node and the browser, and always write the same files.

```
            ┌──────────────── ui ────────────────┐
            │  web/ pages, src/ui/backend.js      │
            └────────────────┬───────────────────┘
                             ▼
┌─ adapters ─┐   ┌──────── services ────────┐
│ node-folder│◄──│ use cases: open library, │
│ memory     │   │ cluster, citations, links,│
│ browser    │   │ export                    │
└─────┬──────┘   └─────┬─────────────┬──────┘
      │                ▼             ▼
      │          ┌── ports ──┐  ┌── domain ──┐
      └─────────►│ Folder,   │  │ pure rules │
     implements  │ Http      │  │ and formats│
                 └───────────┘  └────────────┘
```

## Layers

| Layer | Folder | Contains | May import |
|---|---|---|---|
| **domain** | `src/domain/` | Pure functions: note front matter, publication notes, the clustering text pipeline (TF-IDF), the similarity graph, the graph algorithms (Leiden, Louvain, consensus, betweenness, roles, NMI/ARI, layouts), the analysis, the generated notes and presets, citations, the link rule, the export (xlsx and zip writers). No I/O, no clock, no platform APIs; randomness only through `random.js` with a seed. | domain |
| **ports** | `src/ports/` | Interfaces the services need from outside: `Folder` (the vault), `Http` (OpenAlex). Types only. | domain, ports |
| **services** | `src/services/` | Use cases: open the library, run cluster discovery and write its results, update citations, check links, export. Receive their ports as parameters. | domain, ports, services |
| **adapters** | `src/adapters/` | The ports for each platform: Node file system (command line, tests), in-memory (tests), browser File System Access API, `fetch`, IndexedDB store of opened vaults. | domain, ports, adapters |
| **ui** | `src/ui/` | `backend.js`: the open vault, its settings, one method per tool; runs the cluster analysis in a worker (`web/cluster-worker.js`). The page itself is `web/` (`main.js` start screen and shell, `pages/` one module per tool, `ui.js` DOM helpers). | the public API (`src/index.js`), adapters |

`npm run check` enforces the "may import" column and that domain, ports and services use no platform modules, so they run in the browser as they are.

## Rules

- **The vault is the contract.** File names, note formats and the presets file stay as the Python tools wrote them, so existing vaults keep working. Text is read and written as it is: line endings are kept (the notes are CRLF on Windows).
- **Effects at the edges.** Dates, ids and file access are passed in; domain functions return values instead of writing. The analysis is a pure function of the notes and the settings (seeded randomness), so a run can be reproduced.
- **One module, one concern**, named after what it is about, with its API documented at the top.
- **Public API.** Code outside `src/` (web, bin, tests of the API) imports from `src/index.js`.

## Tests

| Kind | Where | Run |
|---|---|---|
| Unit | `tests/unit/` | `npm test` |
| Architecture | `scripts/check-architecture.js` | `npm run check` |

The graph algorithms have their own tests (planted partitions, comparison with the reference formulas). The whole pipeline was also compared with the Python analysis it replaces on a real library: same vocabulary, same edges and weights, identical partition.
