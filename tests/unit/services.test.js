import { test } from "node:test";
import assert from "node:assert/strict";
import { memoryFolder } from "../../src/adapters/memory-folder.js";
import { checkLinks, exportLibrary, isVault, openLibrary, runClusterDiscovery } from "../../src/index.js";
import { files, NOTES } from "./fixtures/library.js";

const clock = { today: () => "2026-10-12", now: () => "2026-10-12 09:00", iso: () => "2026-10-12T09:00:00.000Z" };

test("openLibrary reads the publication notes and skips the others", async () => {
  const folder = memoryFolder({ ...files(), "98 - Publications/tags.md": "---\ntype: index\n---\n", "98 - Publications/PDFs/x.pdf": new Uint8Array(1) });
  const lib = await openLibrary(folder);
  assert.equal(lib.papers.length, NOTES.length);
  assert.deepEqual(lib.skipped, ["tags.md"]);
  assert.equal(lib.dir, "98 - Publications", "an older vault keeps its library folder");
  await assert.rejects(openLibrary(memoryFolder({ "other/a.md": "" })), /No folder "00 - Library\/Publication Summary"/);
});

test("openLibrary finds 00 - Library, also when the setting still names 98 - Publications", async () => {
  const renamed = Object.fromEntries(Object.entries(files()).map(([p, v]) => [p.replace(/^98 - Publications\//, "00 - Library/"), v]));
  const lib = await openLibrary(memoryFolder(renamed), { libraryDir: "98 - Publications" });
  assert.equal(lib.dir, "00 - Library");
  assert.equal(lib.papers.length, NOTES.length);
  assert.equal(await isVault(memoryFolder(renamed)), true);
  assert.equal(await isVault(memoryFolder({ "other/a.md": "" })), false);
});

test("openLibrary finds the notes in 00 - Library/Publication Summary, also when the setting names 00 - Library", async () => {
  const folder = memoryFolder({ ...files("00 - Library/Publication Summary"), "00 - Library/Library schema.md": "---\ntype: schema\n---\n" });
  for (const libraryDir of [undefined, "00 - Library", "98 - Publications"]) {
    const lib = await openLibrary(folder, { libraryDir });
    assert.equal(lib.dir, "00 - Library/Publication Summary");
    assert.equal(lib.root, "00 - Library");
    assert.equal(lib.papers.length, NOTES.length);
  }
  const empty = await openLibrary(memoryFolder({ "00 - Library/Library schema.md": "---\ntype: schema\n---\n" }));
  assert.equal(empty.dir, "00 - Library", "a library without publication notes yet: the folder that exists");
  assert.equal(empty.papers.length, 0);
});

test("openLibrary reads cites: links between library papers, and who cites whom", async () => {
  const lib = await openLibrary(memoryFolder(files()));
  const [steward, pimmler, browning] = lib.papers;
  assert.deepEqual(pimmler.cites, [`[[${steward.stem}]]`, "10.9/outside"]);
  assert.deepEqual(browning.refs, [steward.stem, pimmler.stem]);
  assert.deepEqual(steward.citedBy, [pimmler.stem, browning.stem]);
  assert.deepEqual(pimmler.citedBy, [browning.stem]);
  assert.deepEqual(browning.citedBy, []);
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
  assert.equal(before.total, 2);                               // the repair paper links two publications; links in `cites` are allowed
  assert.deepEqual(before.findings.map(f => f.count), [2]);
  const fixed = await checkLinks(folder, lib, { fix: true });
  assert.equal(fixed.total, 2);
  const text = await folder.readText(`98 - Publications/${NOTES[6].stem}.md`);
  assert.ok(text.includes("Pimmler & Eppinger 1994 (No. 002) Simpson 2002 (No. 005)"));
  assert.equal((await checkLinks(folder, await openLibrary(folder))).total, 0);
  assert.ok((await folder.readText(`98 - Publications/${NOTES[2].stem}.md`)).includes(`cites:\n  - "[[${NOTES[0].stem}]]"`), "cites is left as it is");
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
  assert.deepEqual(data.edges.filter(e => e.kind === "citation").map(e => [e.from.slice(0, 3), e.to.slice(0, 3)]), [["002", "001"], ["003", "001"], ["003", "002"]]);
  assert.deepEqual([data.nodes[0].cited, data.nodes[0].status], [2, "read"]);
  const bytes = await folder.readBytes("96 - Library export/Library.xlsx");
  assert.deepEqual([...bytes.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
});

test("exportLibrary in the current layout: PDFs and Library.bib in 00 - Library, next to Publication Summary", async () => {
  const folder = memoryFolder({ ...files("00 - Library/Publication Summary"), [`00 - Library/PDFs/${NOTES[0].stem}.pdf`]: new Uint8Array(1) });
  const r = await exportLibrary(folder, await openLibrary(folder), { template: "<script>const DATA = /*DATA*/null;</script>", citekeys: false });
  assert.equal(r.files[2], "00 - Library/Library.bib");
  assert.ok((await folder.readText("00 - Library/Library.bib")).includes("file     = {:PDFs/" + NOTES[0].stem + ".pdf:PDF}"));
  const data = JSON.parse(/const DATA = (.*);<\/script>/.exec(await folder.readText("96 - Library export/Library graph.html"))[1]);
  assert.equal(data.nodes[0].pdf, `../00 - Library/PDFs/${NOTES[0].stem}.pdf`);
  assert.equal(await folder.exists("00 - Library/Publication Summary/Library.bib"), false);
});
