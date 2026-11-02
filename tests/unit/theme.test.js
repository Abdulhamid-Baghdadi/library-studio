// The page's colours come from the theme tokens of web/style.css and web/app.css, so light and dark each set them
// (the design rules' UI rules: light and dark through CSS tokens, never hard-coded colours), and text on a solid status
// colour reaches 4.5:1 in both themes. Right results: WCAG 2.2's contrast ratio and relative luminance, by definition
// (W3C 2023, success criterion 1.4.3).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = name => readFileSync(new URL(`../../web/${name}`, import.meta.url), "utf8");
const STYLE = css("style.css"), APP = css("app.css");

/** The custom properties of the first block whose selector is `selector`. */
function tokens(text, selector) {
  const at = text.indexOf(`${selector} {`);
  assert.ok(at >= 0, `${selector} not found`);
  const body = text.slice(text.indexOf("{", at) + 1, text.indexOf("}", at));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]));
}

const luminance = hex => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test("the contrast ratio is WCAG's: black on white 21:1, a colour on itself 1:1", () => {
  assert.equal(ratio("#000000", "#ffffff").toFixed(2), "21.00");
  assert.equal(ratio("#4f46e5", "#4f46e5"), 1);
});

test("no colour is written in place outside the theme tokens", () => {
  for (const [name, text] of [["style.css", STYLE], ["app.css", APP]]) {
    const rules = text.replace(/:root(\[data-theme="dark"\])?\s*\{[^}]*\}/g, "");
    const found = [...rules.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map(m => m[0]);
    assert.deepEqual(found, [], `${name} writes ${found.join(", ")} outside its :root blocks: make each a token`);
  }
});

test("text on a solid status colour reaches 4.5:1 in light and dark", () => {
  for (const selector of [":root", ':root[data-theme="dark"]']) {
    const t = tokens(STYLE, selector);
    for (const [ink, on] of [["ok-ink", "ok"], ["bad-ink", "bad"], ["accent-ink", "accent"]]) {
      const r = ratio(t[ink], t[on]);
      assert.ok(r >= 4.5, `${selector}: --${ink} on --${on} is ${r.toFixed(2)}:1`);
    }
  }
});
