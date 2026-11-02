// Every picture the README shows is there, has alt text (WCAG 1.1.1), and no animation runs past 5 s by itself
// (WCAG 2.2.2, W3C 2023). Right results by definition.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const README = readFileSync(`${ROOT}README.md`, "utf8");

const markdown = [...README.matchAll(/!\[([^\]]*)\]\(([^)\s]+)\)/g)].map(m => ({ alt: m[1], src: m[2] }));
const html = [...README.matchAll(/<img\b[^>]*>/g)].map(m => ({ alt: m[0].match(/\balt="([^"]*)"/)?.[1] ?? "", src: m[0].match(/\bsrc="([^"]+)"/)?.[1] }));
const sources = [...README.matchAll(/<source\b[^>]*srcset="([^"]+)"/g)].map(m => m[1]);
const local = src => src && !/^https?:/.test(src);

/** A GIF's running time in seconds and whether it loops for ever: the delays of its frames, its NETSCAPE loop count. */
function gif(path) {
  const b = readFileSync(path);
  let seconds = 0, forever = false;
  for (let i = 0; i < b.length - 8; i++) {
    if (b[i] === 0x21 && b[i + 1] === 0xf9 && b[i + 2] === 4) seconds += b.readUInt16LE(i + 4) / 100;
    if (b.toString("latin1", i, i + 11) === "NETSCAPE2.0") forever = b.readUInt16LE(i + 14) === 0;
  }
  return { seconds, forever };
}

test("the README shows pictures, each there with alt text", () => {
  const pictures = [...markdown, ...html];
  assert.ok(pictures.length >= 4);
  for (const { alt, src } of pictures) {
    assert.ok(alt.trim().length > 10, `${src} has no alt text that says what it shows`);
    if (local(src)) assert.ok(existsSync(`${ROOT}${src}`), `${src} is not there: run node scripts/record-readme.mjs`);
  }
  for (const src of sources) assert.ok(existsSync(`${ROOT}${src}`), `${src} is not there: run node scripts/record-readme.mjs`);
});

test("each animation plays once and stops within 5 s", () => {
  const gifs = [...markdown, ...html].map(p => p.src).concat(sources).filter(s => local(s) && s.endsWith(".gif"));
  assert.ok(gifs.length >= 2);
  for (const src of new Set(gifs)) {
    const { seconds, forever } = gif(`${ROOT}${src}`);
    assert.equal(forever, false, `${src} loops for ever`);
    assert.ok(seconds > 0 && seconds <= 5, `${src} runs ${seconds} s`);
  }
});
