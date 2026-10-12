import { test } from "node:test";
import assert from "node:assert/strict";
import { getJson, OpenAlexBudgetError, withApiKey } from "../../src/services/openalex-works.js";
import { enrichLibrary, openLibrary } from "../../src/index.js";
import { memoryFolder } from "../../src/adapters/memory-folder.js";
import { files } from "./fixtures/library.js";

const reply = (status, headers = {}, body = {}) => ({ status, header: n => headers[n] ?? null, json: async () => body });

test("getJson: a used-up daily budget is reported at once, not waited for", async () => {
  let calls = 0;
  const http = { get: async () => { calls++; return reply(429, { "Retry-After": "69356", "X-RateLimit-Remaining": "4" }); } };
  await assert.rejects(getJson(http, "https://api.openalex.org/works"), e => e instanceof OpenAlexBudgetError && /resets in about 19 h/.test(e.message));
  assert.equal(calls, 1);
});

test("getJson: 404 is null, a short rate limit is retried", async () => {
  assert.equal(await getJson({ get: async () => reply(404) }, "u"), null);
  let n = 0;
  const http = { get: async () => (++n === 1 ? reply(429, { "Retry-After": "0" }) : reply(200, {}, { ok: 1 })) };
  assert.deepEqual(await getJson(http, "u"), { ok: 1 });
  assert.equal(n, 2);
});

test("withApiKey adds the key to OpenAlex requests only", async () => {
  const seen = [];
  const http = withApiKey({ get: async url => { seen.push(url); return reply(200); } }, "k e y");
  await http.get("https://api.openalex.org/works?filter=x");
  await http.get("https://api.openalex.org/works/W1");
  await http.get("https://example.org/x");
  assert.deepEqual(seen, ["https://api.openalex.org/works?filter=x&api_key=k%20e%20y", "https://api.openalex.org/works/W1?api_key=k%20e%20y", "https://example.org/x"]);
  const plain = { get: async () => reply(200) };
  assert.equal(withApiKey(plain, ""), plain);
});

test("enrichLibrary keeps the DOI results when the budget runs out during the title searches", async () => {
  const folder = memoryFolder(files());
  const lib = await openLibrary(folder);
  const http = { get: async url => url.includes("title.search") ? reply(429, { "Retry-After": "40000" })
    : reply(200, {}, { results: [{ id: "W1", doi: "https://doi.org/10.1/a", title: lib.papers[0].title, publication_year: 1981, authorships: [{ author: { display_name: "Donald V. Steward" } }], referenced_works: [] }] }) };
  const r = await enrichLibrary(folder, lib, http, { apply: true, clock: { today: () => "2026-10-12" } });
  assert.equal(r.matched, 1);
  assert.match(r.incomplete, /Title searches stopped early .* budget is used up/);
  assert.ok((await folder.readText(`98 - Publications/${lib.papers[0].stem}.md`)).includes("authors: Donald V. Steward"));
  assert.ok(await folder.exists("98 - Publications/Gaps.md"));
});
