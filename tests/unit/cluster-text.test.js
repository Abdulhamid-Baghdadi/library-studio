import { test } from "node:test";
import assert from "node:assert/strict";
import { boilerplate, contentLines, cosineMatrix, noteText, tfidf, tokens } from "../../src/domain/cluster-text.js";

test("tokens: lower-cased words of 3+ letters, hyphens inside, Python word boundaries", () => {
  assert.deepEqual(tokens("Design-for-X of the DSM: a b cd efg"), ["design-for-x", "the", "dsm", "efg"]);
  assert.deepEqual(tokens("foo- bar--baz"), ["foo", "bar--baz"]);                  // a trailing hyphen is not part of the word
  assert.deepEqual(tokens("café naïve"), []);                                     // é is a word character: no boundary after "caf"
  assert.deepEqual(tokens("x2y abc3 w_ord"), []);                                 // digits and _ join the word
});

test("contentLines drops reader-perspective sections and blank lines", () => {
  const body = "intro line\nsecond\n## Abstract\nA1\n\nA2\n### Open gaps\ngap\n## Method\nM1\n";
  // the text before the first heading loses its first line (it is read as that chunk's heading), as the Python did
  assert.deepEqual(contentLines(body), ["second", "A1", "A2", "M1"]);
});

test("boilerplate: lines of 4+ words repeated in 3+ notes", () => {
  const notes = [
    { lines: ["This line is template text", "unique one"] },
    { lines: ["this line is TEMPLATE text!", "short rep"] },
    { lines: ["This line is template text", "short rep"] },
    { lines: ["short rep"] },
  ];
  assert.deepEqual([...boilerplate(notes)], ["this line is template text"]);    // "short rep" has 2 words
});

test("noteText: title twice, tags, cleaned body", () => {
  const t = noteText({ title: "T", tags: ["a-b"], lines: ["see [[X|alias]] $$m$$ # h *x*"] }, new Set());
  assert.equal(t, "T T a b see alias     h  x ");
});

test("tfidf: df filter, bigrams across removed stop words, l2 norm, idf", () => {
  const texts = ["alpha gamma beta", "alpha the gamma", "alpha delta", "zeta"];
  const X = tfidf(texts, { stopWords: new Set(["the"]), minDf: 2, maxDf: 0.5 });
  // alpha: df 3 > 0.5·4 → out; "alpha gamma" bigram in docs 1 and 2 (the stop word is removed before the bigrams) → in; gamma df 2 → in; "gamma beta" df 1 → out
  assert.deepEqual(X.vocab, ["alpha gamma", "gamma"]);
  assert.ok(Math.abs(X.idf[1] - (Math.log(5 / 3) + 1)) < 1e-12);
  const row = X.rows[0];
  assert.deepEqual([...row.idx], [0, 1]);
  const norm = Math.hypot(...row.val);
  assert.ok(Math.abs(norm - 1) < 1e-12);
  assert.deepEqual([...X.rows[3].idx], []);
  const S = cosineMatrix(X.rows);
  assert.ok(Math.abs(S[0 * 4 + 1] - 1) < 1e-12);     // same two terms, same weights
  assert.equal(S[0 * 4 + 3], 0);
  assert.equal(S[0], 0);                             // diagonal
});
