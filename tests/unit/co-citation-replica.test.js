// The OpenAlex replica of Mertens et al. 2023 (vault note "Mertens co-citation phases - OpenAlex replica", 25 Oct 2026),
// rebuilt from its downloaded data. The data is not in the repository (18 MB): set CO_CITATION_REPLICA to a folder with
// its citing/ and cited/ folders (cited/requested.json = the replica's candidate_ids.json), e.g. a copy of
// "<vault>/tmp/mertens-replica/oa". Without it the test is skipped.
import { test } from "node:test";
import assert from "node:assert/strict";
import { nodeFolder } from "../../src/adapters/node-folder.js";
import { MERTENS_2023, runCoCitation } from "../../src/index.js";

const DIR = process.env.CO_CITATION_REPLICA;
const clock = { today: () => "2026-10-25", now: () => "2026-10-25 22:00", iso: () => "" };

test("Mertens et al. 2023 replica: the report's numbers", { skip: !DIR && "set CO_CITATION_REPLICA to the replica's data folder" }, async () => {
  const r = await runCoCitation(nodeFolder(DIR), { papers: [] }, ".", MERTENS_2023, { name: "Mertens replica", clock, write: false });
  assert.equal(r.citing.total, 2870);
  assert.deepEqual(r.scopes.map(s => s.citing), [2870, 653, 806, 860, 551]);
  assert.deepEqual(r.scopes.map(s => s.nodes.length), [102, 51, 105, 77, 28]);
  assert.deepEqual(r.scopes.map(s => s.clusters.length), [3, 3, 4, 3, 3]);
  assert.equal(r.scopes[0].density.toFixed(3), "0.305");
  const top = r.scopes[0].nodes.reduce((a, i) => (r.nodes[i].cites[0] > r.nodes[a].cites[0] ? i : a));
  assert.deepEqual([r.nodes[top].label, r.nodes[top].cites[0]], ["Ulrich 1995", 438]);
  const org = r.perspectives.find(p => p.name === "Organisation and architecture");
  assert.deepEqual(r.scopes.slice(1).map(s => Math.round(s.outShare[org.k] * 1000) / 1000), [0.558, 0.37, 0.305, 0.184]);
  assert.equal(r.cleaning.merged.length, 7);
  assert.deepEqual(r.cleaning.dropped.map(d => d.cites), [334, 73, 44, 43, 39]);
});
