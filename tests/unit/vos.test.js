import { test } from "node:test";
import assert from "node:assert/strict";
import { associationStrength, vosClusters, vosLayout } from "../../src/domain/vos.js";
import { mapFile, networkFile, vosviewerFiles } from "../../src/domain/vosviewer.js";

test("association strength: s_ij = 2m c_ij / (c_i c_j), counted inside the given works", () => {
  // works 10, 11, 12: c(10,11) = 2, c(11,12) = 1; c_10 = 2, c_11 = 3, c_12 = 1, m = 3
  assert.deepEqual(associationStrength([10, 11, 12], [[10, 11, 2], [11, 12, 1]]), [[0, 1, 2], [1, 2, 2]]);
  // a pair with a work outside the set is left out, also from the totals
  assert.deepEqual(associationStrength([10, 11], [[10, 11, 2], [11, 12, 1]]), [[0, 1, 2]]);
});

/** Two groups of four works cited together, joined by one weak pair. */
const pairs = [];
for (const g of [[0, 1, 2, 3], [4, 5, 6, 7]]) for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) pairs.push([g[a], g[b], 20]);
pairs.push([0, 4, 5]);

test("VOS clustering: CPM on association strength finds the two groups, the same every time", () => {
  const nodes = [0, 1, 2, 3, 4, 5, 6, 7];
  const r = vosClusters(nodes, pairs, { runs: 5 });
  assert.equal(r.count, 2);
  assert.equal(new Set([0, 1, 2, 3].map(i => r.cluster.get(i))).size, 1);
  assert.notEqual(r.cluster.get(0), r.cluster.get(4));
  assert.deepEqual([...vosClusters(nodes, pairs, { runs: 5 }).cluster], [...r.cluster]);
  assert.equal(vosClusters(nodes, pairs, { resolution: 50, runs: 5 }).count, 8, "a resolution above every association strength leaves each work alone");
});

test("VOS layout: deterministic, groups apart, centred and turned onto its widest axis", () => {
  const S = associationStrength([0, 1, 2, 3, 4, 5, 6, 7], pairs);
  const xy = vosLayout(8, S, { starts: 3, iterations: 400 });
  assert.deepEqual(vosLayout(8, S, { starts: 3, iterations: 400 }), xy);
  const d = (i, j) => Math.hypot(xy[i][0] - xy[j][0], xy[i][1] - xy[j][1]);
  const inside = Math.max(d(0, 1), d(1, 2), d(5, 6), d(6, 7)), across = Math.min(d(1, 5), d(2, 6), d(3, 7));
  assert.ok(across > 2 * inside, `groups apart: ${across} vs ${inside}`);
  const mean = k => xy.reduce((a, p) => a + p[k], 0) / 8;
  assert.ok(Math.abs(mean(0)) < 1e-9 && Math.abs(mean(1)) < 1e-9);
  const sxx = xy.reduce((a, p) => a + p[0] ** 2, 0), syy = xy.reduce((a, p) => a + p[1] ** 2, 0), sxy = xy.reduce((a, p) => a + p[0] * p[1], 0);
  assert.ok(sxx >= syy && Math.abs(sxy) < 1e-9);
  assert.deepEqual(vosLayout(1, []), [[0, 0]]);
  assert.deepEqual(vosLayout(0, []), []);
});

test("VOSviewer files: a map and a network file per scope, ids shared, y flipped", () => {
  const result = {
    nodes: [
      { id: "W1", label: "Ulrich 1995", title: "The role of\tproduct architecture", year: 1995, doi: "10.1016/0048-7333(94)00775-3", lib: { no: 5 }, cites: [12, 4], avgYear: 2008.25, x: 0.123456, y: -0.5 },
      { id: "W2", label: "Pine 1993", title: "Mass customization", year: 1993, doi: "", lib: null, cites: [9, 9], avgYear: 2004, x: -1, y: 0.25 },
    ],
    scopes: [
      { phase: "All years", name: "1990–2020", nodes: [0, 1], clusterOf: [0, 1], cocit: [[0, 1, 7]] },
      { phase: "Emergence", name: "1990–2006", nodes: [1], clusterOf: [0], cocit: [] },
    ],
  };
  assert.equal(mapFile(result, 0), [
    "id\tlabel\tdescription\turl\tx\ty\tcluster\tweight<Citations>\tscore<Avg. citing year>",
    "1\tUlrich 1995\tThe role of product architecture (1995). Library No. 005\thttps://doi.org/10.1016/0048-7333(94)00775-3\t0.1235\t0.5000\t1\t12\t2008.2",
    "2\tPine 1993\tMass customization (1993)\thttps://openalex.org/W2\t-1.0000\t-0.2500\t2\t9\t2004",
  ].join("\n") + "\n");
  assert.equal(networkFile(result, 0), "1\t2\t7\n");
  assert.deepEqual(vosviewerFiles(result).map(f => f.name), [
    "map - 0 - all years 1990-2020.txt", "network - 0 - all years 1990-2020.txt", "map - 1 - emergence 1990-2006.txt", "network - 1 - emergence 1990-2006.txt",
  ]);
  assert.equal(mapFile(result, 1).split("\n")[1].split("\t")[0], "2", "a work keeps its id in every file");
});
