import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeDoi, worksByDoiUrls, worksFromResponse } from "../../src/domain/openalex.js";

test("normalizeDoi", () => {
  assert.equal(normalizeDoi("https://doi.org/10.1016/ABC."), "10.1016/abc");
  assert.equal(normalizeDoi("doi: 10.1/x"), "10.1/x");
  assert.equal(normalizeDoi(undefined), "");
});

test("OpenAlex request URLs and response reading", () => {
  const urls = worksByDoiUrls(["10.1/a", "10.1/b", "10.1/c"], { mailto: "me@x.org", batch: 2 });
  assert.equal(urls.length, 2);
  assert.ok(urls[0].startsWith("https://api.openalex.org/works?filter=doi%3A10.1%2Fa%7C10.1%2Fb&per-page=2&select="));
  assert.ok(urls[0].includes("mailto=me%40x.org"));
  const works = worksFromResponse({ results: [{ id: "https://openalex.org/W1", doi: "https://doi.org/10.1/A", referenced_works: ["W2"] }] });
  assert.deepEqual([...works.keys()], ["10.1/a"]);
  assert.equal(works.get("10.1/a").id, "https://openalex.org/W1");
  assert.deepEqual(works.get("10.1/a").referenced, ["W2"]);
});
