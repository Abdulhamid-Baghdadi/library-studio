import { test } from "node:test";
import assert from "node:assert/strict";
import { citationGraph, citationSummary, normalizeDoi, withCitations } from "../../src/domain/citations.js";
import { worksByDoiUrls, worksFromResponse } from "../../src/domain/openalex.js";

test("normalizeDoi", () => {
  assert.equal(normalizeDoi("https://doi.org/10.1016/ABC."), "10.1016/abc");
  assert.equal(normalizeDoi("doi: 10.1/x"), "10.1/x");
  assert.equal(normalizeDoi(undefined), "");
});

test("citationGraph: references and cited_by between library papers only", () => {
  const dois = new Map([["A", "10.1/a"], ["B", "10.1/b"], ["C", ""], ["D", "10.1/d"]]);
  const works = new Map([
    ["10.1/a", { id: "W1", referenced: ["W2", "W9", "W1"] }],   // cites B, something outside, and itself
    ["10.1/b", { id: "W2", referenced: [] }],
    // D has a DOI but is not in OpenAlex
  ]);
  const g = citationGraph(dois, works);
  assert.deepEqual([...g.refs], [["A", ["B"]], ["B", []]]);
  assert.deepEqual([...g.cited], [["A", []], ["B", ["A"]], ["C", []], ["D", []]]);
  assert.equal(g.found, 2);
  const s = citationSummary(dois, g, 2);
  assert.deepEqual(s, { publications: 4, found: 2, links: 1, missing: 2, mostCited: [{ stem: "B", count: 1 }, { stem: "A", count: 0 }] });
});

test("withCitations replaces both properties before category and keeps CRLF", () => {
  const note = "---\r\ntype: publication\r\nreferences:\r\n  - \"[[Old]]\"\r\ncategory:\r\n  - \"[[Map]]\"\r\n---\r\nbody\r\n";
  const out = withCitations(note, ["X", "Y"], []);
  assert.equal(out, "---\r\ntype: publication\r\nreferences:\r\n  - \"[[X]]\"\r\n  - \"[[Y]]\"\r\ncited_by: []\r\ncategory:\r\n  - \"[[Map]]\"\r\n---\r\nbody\r\n");
  const again = withCitations(out, ["X", "Y"], []);
  assert.equal(again, out);                                           // idempotent
  const noCat = withCitations("---\ntype: publication\n---\n", [], ["Z"]);
  assert.equal(noCat, "---\ntype: publication\nreferences: []\ncited_by:\n  - \"[[Z]]\"\n---\n");
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
