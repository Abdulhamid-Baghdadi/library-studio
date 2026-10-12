import { test } from "node:test";
import assert from "node:assert/strict";
import { memoryFolder } from "../../src/adapters/memory-folder.js";
import { checkLinks, exportLibrary, isVault, openLibrary, runClusterDiscovery, updateCitations } from "../../src/index.js";
import { files, NOTES } from "./fixtures/library.js";

const clock = { today: () => "2026-10-12", now: () => "2026-10-12 09:00", iso: () => "2026-10-12T09:00:00.000Z" };

test("openLibrary reads the publication notes and skips the others", async () => {
  const folder = memoryFolder({ ...files(), "98 - Publications/tags.md": "---\ntype: index\n---\n", "98 - Publications/PDFs/x.pdf": new Uint8Array(1) });
  const lib = await openLibrary(folder);
  assert.equal(lib.papers.length, NOTES.length);
  assert.deepEqual(lib.skipped, ["tags.md"]);
  assert.equal(lib.dir, "98 - Publications", "an older vault keeps its library folder");
  await assert.rejects(openLibrary(memoryFolder({ "other/a.md": "" })), /No folder "00 - Library"/);
});

test("openLibrary finds 00 - Library, also when the setting still names 98 - Publications", async () => {
  const renamed = Object.fromEntries(Object.entries(files()).map(([p, v]) => [p.replace(/^98 - Publications\//, "00 - Library/"), v]));
  const lib = await openLibrary(memoryFolder(renamed), { libraryDir: "98 - Publications" });
  assert.equal(lib.dir, "00 - Library");
  assert.equal(lib.papers.length, NOTES.length);
  assert.equal(await isVault(memoryFolder(renamed)), true);
  assert.equal(await isVault(memoryFolder({ "other/a.md": "" })), false);
});

test("runClusterDiscovery: dry run writes only the report; a full run writes hub notes and presets", async () => {
  const folder = memoryFolder({ ...files(), ".obsidian/plugins/graph-presets/data.json": JSON.stringify({ presets: [{ id: "u", name: "Mine", options: {}, nodePositions: [] }], activePresetId: "u" }) });
  const lib = await openLibrary(folder);
  const steps = [];
  const dry = await runClusterDiscovery(folder, lib, { runs: 5, seed: 3, dryRun: true }, { clock, onStep: (n, t) => steps.push(`${n} ${t}`) });
  assert.equal(steps.length, 8);
  assert.equal(dry.hubs, null);
  assert.equal(dry.presets, null);
  assert.ok(await folder.exists("01 - Project 1 - PhD Overview/03 - Evidence synthesis/Cluster discovery report.md"));
  assert.deepEqual(await folder.list("01 - Project 1 - PhD Overview/06 - Discovered clusters"), []);

  await folder.writeText("Hubs/C99 - stale.md", "---\ngenerated-by: 95 - Tools/Cluster discovery/cluster_discovery.py\n---\n");
  await folder.writeText("Hubs/Keep me.md", "my own note");
  const full = await runClusterDiscovery(folder, lib, { runs: 5, seed: 3, dryRun: false }, { clock, paths: { hubDir: "Hubs" }, ids: () => "fixed-id" });
  assert.equal(full.hubs.removed, 1);
  assert.equal(full.hubs.written, full.clusters.length);
  const hubs = await folder.list("Hubs");
  assert.ok(hubs.includes("Keep me.md"));
  assert.ok(!hubs.includes("C99 - stale.md"));
  assert.equal(hubs.length, full.clusters.length + 1);
  const presets = JSON.parse(await folder.readText(".obsidian/plugins/graph-presets/data.json"));
  assert.equal(presets.presets[0].name, "Mine");
  assert.equal(presets.presets.length, 1 + full.presets.added);
  assert.equal(presets.activePresetId, "u");
  assert.ok(await folder.exists(".obsidian/plugins/graph-presets/data.json.bak"));
  assert.equal(full.finished, "2026-10-12 09:00");
  assert.equal(full.settings.dryRun, false);
});

test("runClusterDiscovery creates the presets file when the plugin has none", async () => {
  const folder = memoryFolder(files());
  const lib = await openLibrary(folder);
  const r = await runClusterDiscovery(folder, lib, { runs: 3, dryRun: false }, { clock });
  assert.equal(r.presets.removed, 0);
  assert.equal(JSON.parse(await folder.readText(".obsidian/plugins/graph-presets/data.json")).presets.length, r.presets.added);
});

test("checkLinks finds and fixes links between publication notes", async () => {
  const folder = memoryFolder(files());
  const lib = await openLibrary(folder);
  const before = await checkLinks(folder, lib);
  assert.equal(before.total, 2);                               // the repair paper links two publications
  assert.deepEqual(before.findings.map(f => f.count), [2]);
  const fixed = await checkLinks(folder, lib, { fix: true });
  assert.equal(fixed.total, 2);
  const text = await folder.readText(`98 - Publications/${NOTES[6].stem}.md`);
  assert.ok(text.includes("Pimmler & Eppinger 1994 (No. 002) Simpson 2002 (No. 005)"));
  assert.equal((await checkLinks(folder, await openLibrary(folder))).total, 0);
});

test("updateCitations: dry run counts, apply writes the properties", async () => {
  const folder = memoryFolder(files());
  const lib = await openLibrary(folder);
  let calls = 0;
  const http = { get: async url => ({ status: 200, header: () => null, json: async () => {
    calls++;
    if (url.includes("mailto")) assert.ok(url.includes("mailto=me%40x.org"));
    return { results: [
      { id: "W1", doi: "https://doi.org/10.1/a", referenced_works: [] },
      { id: "W2", doi: "https://doi.org/10.1/b", referenced_works: ["W1"] },
      { id: "W3", doi: "https://doi.org/10.1/c", referenced_works: ["W1", "W2", "W0"] },
    ] };
  } }) };
  const dry = await updateCitations(folder, lib, http, { mailto: "me@x.org" });
  assert.equal(calls, 1);
  assert.deepEqual([dry.publications, dry.found, dry.links, dry.missing, dry.written], [8, 3, 3, 5, 0]);
  assert.deepEqual(dry.mostCited.slice(0, 2).map(m => [m.stem.slice(0, 3), m.count]), [["001", 2], ["002", 1]]);
  const done = await updateCitations(folder, lib, http, { apply: true });
  assert.equal(done.written, 8);                               // every note: the properties move before `category`, as the vault rule puts them
  const steward = await folder.readText(`98 - Publications/${NOTES[0].stem}.md`);
  assert.ok(steward.includes(`references: []\ncited_by:\n  - "[[${NOTES[1].stem}]]"\n  - "[[${NOTES[2].stem}]]"\ncategory:`));
  const again = await updateCitations(folder, await openLibrary(folder), http, { apply: true });
  assert.equal(again.written, 0);
});

test("exportLibrary writes the workbook and the graph page", async () => {
  const folder = memoryFolder({ ...files(), [`98 - Publications/PDFs/${NOTES[0].stem}.pdf`]: new Uint8Array(1) });
  const lib = await openLibrary(folder);
  const r = await exportLibrary(folder, lib, { template: "<script>const DATA = /*DATA*/null;</script>" });
  assert.deepEqual(r.files, ["96 - Library export/Library.xlsx", "96 - Library export/Library graph.html", "98 - Publications/Library.bib"]);
  assert.deepEqual(r.bibtex, { entries: 8, citekeysWritten: 8 });
  const bib = await folder.readText("98 - Publications/Library.bib");
  assert.ok(bib.includes("@article{steward1981,") && bib.includes("file     = {:PDFs/" + NOTES[0].stem + ".pdf:PDF}"));
  assert.ok((await folder.readText(`98 - Publications/${NOTES[0].stem}.md`)).includes("\ndoi: 10.1/a\ncitekey: steward1981\n"));
  const again = await exportLibrary(folder, await openLibrary(folder), { template: "<script>const DATA = /*DATA*/null;</script>" });
  assert.equal(again.bibtex.citekeysWritten, 0);
  assert.equal(r.papers, 8);
  assert.equal(r.nodes, 8 + 3);
  const page = await folder.readText("96 - Library export/Library graph.html");
  const data = JSON.parse(/const DATA = (.*);<\/script>/.exec(page)[1]);
  assert.equal(data.nodes[0].pdf, `../98 - Publications/PDFs/${NOTES[0].stem}.pdf`);
  assert.equal(data.nodes[1].pdf, "");
  assert.equal(data.edges.filter(e => e.kind === "category").length, 7);
  const bytes = await folder.readBytes("96 - Library export/Library.xlsx");
  assert.deepEqual([...bytes.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
});
