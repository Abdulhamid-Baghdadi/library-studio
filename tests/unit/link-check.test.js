import { test } from "node:test";
import assert from "node:assert/strict";
import { fixLinks, forbiddenLinks, plainReference, publicationIndex } from "../../src/domain/link-check.js";

const pubs = publicationIndex([
  { stem: "005 - 1995 - Ulrich - The Role", index: "5" },
  { stem: "003 - 1990 - Henderson & Clark - Architectural Innovation", index: "3" },
  { stem: "Odd name", index: "" },
]);

const TEXT = [
  "---", "type: publication", "references:", '  - "[[003 - 1990 - Henderson & Clark - Architectural Innovation]]"', "cited_by: []", "---",
  "See [[003 - 1990 - Henderson & Clark - Architectural Innovation]] and [[003 - 1990 - Henderson & Clark - Architectural Innovation.md|H&C]],",
  "![[005 - 1995 - Ulrich - The Role#Abstract]] (self), [[Odd name]], [[Concept map]] and [[005 - 1995 - Ulrich - The Role.pdf]].",
].join("\r\n");

test("forbiddenLinks: links to other publications outside the citation properties", () => {
  const hits = forbiddenLinks(TEXT, "005 - 1995 - Ulrich - The Role", pubs);
  assert.deepEqual(hits.map(h => [h.target, h.alias]), [
    ["003 - 1990 - Henderson & Clark - Architectural Innovation", null],
    ["003 - 1990 - Henderson & Clark - Architectural Innovation", "H&C"],
    ["Odd name", null],
  ]);
});

test("fixLinks replaces them by plain text and keeps everything else", () => {
  const fixed = fixLinks(TEXT, "005 - 1995 - Ulrich - The Role", pubs);
  assert.ok(fixed.includes('  - "[[003 - 1990 - Henderson & Clark - Architectural Innovation]]"'));   // the property stays
  assert.ok(fixed.includes("See Henderson & Clark 1990 (No. 003) and H&C,"));
  assert.ok(fixed.includes("![[005 - 1995 - Ulrich - The Role#Abstract]] (self), Odd name, [[Concept map]] and [[005 - 1995 - Ulrich - The Role.pdf]]."));
  assert.ok(fixed.includes("\r\n"));
  assert.deepEqual(forbiddenLinks(fixed, "005 - 1995 - Ulrich - The Role", pubs), []);
});

test("forbiddenLinks: links in cites are allowed, in the front matter only", () => {
  const H = "003 - 1990 - Henderson & Clark - Architectural Innovation";
  const note = [
    "---", "type: publication", "cites:", `  - "[[${H}]]"`, '  - "10.1/x"', "tags:", "  - a", `related: "[[${H}]]"`, "---",
    `cites: [[${H}]] written in the body`, "",
  ].join("\r\n");
  const hits = forbiddenLinks(note, "005 - 1995 - Ulrich - The Role", pubs);
  assert.equal(hits.length, 2, "the related property and the body line");
  assert.ok(hits.every(h => note.slice(h.start).startsWith(`[[${H}]]`) && h.start > note.indexOf("related:")));
  assert.deepEqual(forbiddenLinks(`---\ncites: ["[[${H}]]"]\n---\n`, "x", pubs), [], "a list written on one line");
});

test("plainReference", () => {
  assert.equal(plainReference("012 - 2004 - Sosa Eppinger & Rowles - X", null, pubs), "Sosa Eppinger & Rowles 2004 (No. 012)");
  assert.equal(plainReference("Odd name", null, new Map([["Odd name", "77"]])), "Odd name (No. 77)");
  assert.equal(plainReference("Odd name", "alias", pubs), "alias");
});
