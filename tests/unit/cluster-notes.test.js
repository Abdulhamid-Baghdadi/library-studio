import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze } from "../../src/domain/cluster-analysis.js";
import { hubName, hubNames, hubNotes, palette, reportMarkdown, resultJson, updatePresets } from "../../src/domain/cluster-notes.js";
import { fixed, general, percent, signed } from "../../src/domain/text-rules.js";
import { library } from "./fixtures/library.js";

test("palette matches colorsys.hls_to_rgb(h, 0.55, 0.70) with golden-angle hues", () => {
  assert.deepEqual(palette(5), [14433083, 3893980, 10083387, 14433224, 3923137]);
});

test("hubName strips characters a file name cannot have", () => {
  assert.equal(hubName(3, ["a/b", "c:d", "e|f", "g"]), "C03 - ab, cd, ef");
});

test("number formats as Python's", () => {
  assert.equal(fixed(0.125, 2), "0.12");          // ties to even on the exact binary value
  assert.equal(fixed(2.675, 2), "2.67");
  assert.equal(signed(1.5, 2), "+1.50");
  assert.equal(signed(-0.004, 2), "-0.00");
  assert.equal(percent(0.456), "46%");
  assert.equal(general(1), "1");
  assert.equal(general(0.0123456), "0.01235");
  assert.equal(general(12345.678), "1.235e+04");
  assert.equal(general(0.00001234), "1.234e-05");
});

const a = analyze(library(), { runs: 5, seed: 7 }, { libraryDir: "Lib" });
const names = hubNames(a);

test("hub notes: one per cluster, every member linked, generated mark present", () => {
  const notes = hubNotes(a, { today: "2026-10-12", hubNames: names });
  assert.equal(notes.length, a.parts.length);
  notes.forEach((n, c) => {
    assert.equal(n.name, names[c]);
    assert.ok(n.text.startsWith("---\ntype: discovered-cluster\ngenerated-by: Library Studio (cluster discovery)\ngenerated: 2026-10-12\n"));
    for (const i of a.parts[c]) assert.ok(n.text.includes(`[[${a.notes[i].stem}|`));
    assert.ok(n.text.includes("## Neighbouring clusters"));
  });
});

test("report: front matter, agreement table, one section per cluster, sweep table", () => {
  const md = reportMarkdown(a, { today: "2026-10-12", hubNames: names });
  assert.ok(md.startsWith("---\ntype: evidence-synthesis\n"));
  assert.ok(md.includes("## Agreement with the concept maps"));
  for (const [c, name] of names.entries()) {
    assert.ok(md.includes(`## C${String(c + 1).padStart(2, "0")} — `));
    assert.ok(md.includes(`- **Hub note:** [[${name}]]`));
  }
  assert.ok(md.includes("| 32× |"));
  assert.ok(!/\[\[\d{3} - [^\]|]+\]\]/.test(md.split("## Method")[1]));   // the method section refers to papers in plain text
});

test("updatePresets replaces the [auto] presets, keeps the user's, resets an active [auto] preset", () => {
  const data = { presets: [
    { id: "u1", name: "My preset", options: { search: "x", colorGroups: [1], scale: 1, showArrow: true }, nodePositions: [] },
    { id: "a1", name: "[auto] old", options: {}, nodePositions: [] },
  ], activePresetId: "a1", restoreOnStartup: true };
  let n = 0;
  const { data: out, added, removed } = updatePresets(data, a, { hubNames: names, hubDir: "Hubs", libraryDir: "Lib", now: "2026-10-12T10:00:00", uuid: () => `id${++n}` });
  assert.equal(removed, 1);
  assert.equal(added, 2 + a.parts.length);
  assert.equal(out.activePresetId, null);
  assert.equal(out.restoreOnStartup, true);
  assert.equal(out.presets[0].name, "My preset");
  assert.deepEqual(out.presets.slice(1).map(p => p.name.startsWith("[auto] ")), Array(added).fill(true));
  const all = out.presets[1];
  assert.equal(all.name, "[auto] All clusters (hubs)");
  assert.equal(all.id, "id1");
  assert.equal(all.options.search, '(path:"Lib" -file:"tags") OR path:"Hubs"');
  assert.deepEqual([all.options.scale, all.options.linkStrength, all.options.centerStrength, all.options.showArrow, all.options.showOrphans], [0.12, 0.25, 0.05, true, true]);
  assert.equal(all.options.colorGroups.length, a.parts.length);
  assert.ok(all.options.colorGroups[0].query.startsWith('path:"Hubs/C01 - " OR path:"Lib/'));
  assert.equal(all.nodePositions.length, a.notes.length + a.parts.length);
  assert.ok(all.nodePositions.some(p => p.id === `Hubs/${names[0]}.md`));
  const first = out.presets[3];
  assert.ok(first.name.startsWith("[auto] Cluster 01 – "));
  assert.equal(first.nodePositions.length, a.parts[0].length + 1);
  assert.equal(JSON.parse(JSON.stringify(out)).presets.length, out.presets.length);   // plain data
});

test("resultJson has what the page shows", () => {
  const r = resultJson(a, { report: "R.md" });
  assert.equal(r.notes, a.notes.length);
  assert.equal(r.clusters.length, a.parts.length);
  assert.equal(r.graph.nodes.length, a.notes.length);
  assert.equal(r.graph.edges.length, a.graph.edgeCount());
  assert.ok(r.clusters.every(c => c.papers.length === c.size && typeof c.robustness === "number"));
  assert.equal(r.report, "R.md");
});
