// Draws the README's pictures from the program itself, on the synthetic library of tests/unit/fixtures/library.js
// (example data, never a real vault): the Library page in light and dark, and the main task, a cluster discovery run
// ending on its map, as a GIF per theme that plays once and stops within 5 s (WCAG 2.2.2). Starts the development
// server on a test vault in a temporary folder and a headless Edge (or Chrome) over its DevTools port; ffmpeg assembles
// the GIFs. Needs nothing but Node, a Chromium browser and ffmpeg. After the funelectronics kit's record-readme.mjs.
//
//   node scripts/record-readme.mjs
//
// Writes docs/readme/library-light.png, library-dark.png, cluster-light.gif and cluster-dark.gif.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { files } from "../tests/unit/fixtures/library.js";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const OUT = join(ROOT, "docs", "readme");
const PORT = 8790;
const URL_ = `http://127.0.0.1:${PORT}/web/?fixture`;
const BROWSERS = ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Google/Chrome/Application/chrome.exe",
                  "/usr/bin/chromium", "/usr/bin/google-chrome"];
const SIZE = { width: 1200, height: 900 };
const FPS = 10, HOLD = 14;          // frames the map stays at the end, so it can be read; the whole GIF under 5 s

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail; });
  let id = 0;
  const waiting = new Map();
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
  };
  const send = (method, params = {}) => new Promise((ok, fail) => {
    const n = ++id;
    waiting.set(n, m => (m.error ? fail(new Error(`${method}: ${m.error.message}`)) : ok(m.result)));
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  const value = async expression => (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result.value;
  return { send, value, close: () => ws.close() };
}

async function until(page, expression, what) {
  for (let k = 0; k < 100; k++) { if (await page.value(expression)) return; await sleep(150); }
  throw new Error(`Timed out waiting for ${what}.`);
}

const shot = async (page, file) =>
  writeFileSync(file, Buffer.from((await page.send("Page.captureScreenshot", { format: "png" })).data, "base64"));

async function record(theme, browser, debugPort) {
  const profile = mkdtempSync(join(tmpdir(), "library-studio-rec-"));
  const proc = spawn(browser, ["--headless=new", `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, "--hide-scrollbars",
    `--window-size=${SIZE.width},${SIZE.height}`, "--no-first-run", "--no-default-browser-check", "about:blank"], { stdio: "ignore" });
  try {
    let target;
    for (let k = 0; k < 50 && !target; k++) {
      await sleep(200);
      try { target = (await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json()).find(t => t.type === "page"); } catch { /* not up yet */ }
    }
    if (!target) throw new Error(`The browser did not open its DevTools port ${debugPort}: is another instance using it?`);
    const page = await cdp(target.webSocketDebuggerUrl);
    await page.send("Emulation.setDeviceMetricsOverride", { ...SIZE, deviceScaleFactor: 1, mobile: false });
    await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }] });
    await page.send("Page.navigate", { url: URL_ });
    await until(page, "[...document.querySelectorAll('h1')].some(h => h.offsetParent && h.textContent.trim() === 'Library')", "the Library page on the test vault");
    await page.value(`document.documentElement.dataset.theme = ${JSON.stringify(theme)}`);
    await until(page, "!document.querySelector('.toast')", "the opening message to fade");
    await sleep(300);
    await shot(page, join(OUT, `library-${theme}.png`));

    // The main task: open Cluster discovery, run it (a dry run, the default), and look at the map.
    const frames = mkdtempSync(join(tmpdir(), "library-studio-frames-"));
    let n = 0;
    const frame = async () => shot(page, join(frames, `f${String(n++).padStart(3, "0")}.png`));
    const click = text => page.value(`[...document.querySelectorAll('aside button, aside a, button')].find(b => b.offsetParent && b.textContent.includes(${JSON.stringify(text)}))?.click() ?? 'missing'`);
    await click("Cluster discovery"); await sleep(400);
    for (let k = 0; k < 6; k++) await frame();
    await click("Run analysis");
    for (let k = 0; k < 40 && n < 30; k++) { await frame(); await sleep(60); if (await page.value("!document.body.innerText.includes('running ·')")) break; }
    await click("Map"); await sleep(700);
    for (let k = 0; k < HOLD; k++) await frame();
    page.close();
    return { frames, count: n };
  } finally {
    // Edge leaves helper processes that keep the port and the profile: end the whole tree.
    if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(proc.pid), "/t", "/f"], { stdio: "ignore" });
    else proc.kill();
    try { rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); }
    catch { console.warn(`Could not remove the browser's temporary profile ${profile}; delete it by hand.`); }
  }
}

const browser = BROWSERS.find(existsSync);
if (!browser) { console.error("No Chromium browser found: install Edge or Chrome, or add its path to BROWSERS."); process.exit(1); }
mkdirSync(OUT, { recursive: true });
// The folder's name is the vault's name the app shows: say it is example data.
const vault = join(mkdtempSync(join(tmpdir(), "library-studio-vault-")), "example-library");
for (const [path, text] of Object.entries(files())) { mkdirSync(dirname(join(vault, path)), { recursive: true }); writeFileSync(join(vault, path), text); }
const server = spawn(process.execPath, [join(ROOT, "scripts", "serve.js"), String(PORT), "--fixture", vault], { stdio: ["ignore", "pipe", "inherit"] });
await new Promise(ok => server.stdout.once("data", ok));
try {
  for (const [k, theme] of ["light", "dark"].entries()) {
    const { frames, count } = await record(theme, browser, 9340 + k);
    if (count / FPS > 5) throw new Error(`The animation would run ${(count / FPS).toFixed(1)} s: keep it under 5 s (WCAG 2.2.2).`);
    const out = join(OUT, `cluster-${theme}.gif`);
    // Half size keeps the GIF small; a palette made from the frames keeps it sharp; -loop -1 plays it once.
    const run = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", join(frames, "f%03d.png"),
      "-filter_complex", "[0]scale=iw/2:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=200:stats_mode=full[p];[b][p]paletteuse=dither=none",
      "-loop", "-1", out], { stdio: "inherit" });
    rmSync(frames, { recursive: true, force: true });
    if (run.status !== 0) throw new Error("ffmpeg failed: is it installed and on the PATH?");
    console.log(`Wrote docs/readme/library-${theme}.png and cluster-${theme}.gif (${count} frames, ${(count / FPS).toFixed(1)} s, plays once).`);
  }
} finally {
  server.kill();
  rmSync(dirname(vault), { recursive: true, force: true });
}
