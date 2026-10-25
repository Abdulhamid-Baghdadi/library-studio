// Library Studio in the browser: the start screen (open a vault folder, recent vaults), then the app shell
// with one page per tool. The page talks to window.backend (src/ui/backend.js) instead of a server.
import { Backend, SETTINGS } from "../src/ui/backend.js";
import { $, btn, h, modal, toast } from "./ui.js";
import { TOOLS } from "./pages/index.js";
import { SETTINGS_HELP } from "./help.js";

const remember = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private window */ } };
const recall = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };

const backend = new Backend({
  workerUrl: new URL("./cluster-worker.js", import.meta.url),
  coCitationWorkerUrl: new URL("./co-citation-worker.js", import.meta.url),
  templateUrl: new URL("./graph-template.html", import.meta.url),
});
window.backend = backend;

// ------------------------------------------------------------------ theme, tool lists

function toggleTheme() {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  remember("theme", next);
}
$("#startTheme").onclick = toggleTheme;
$("#btnTheme").onclick = toggleTheme;

const say = (text, kind = "") => $("#startBody .start-msg")?.replaceChildren(h("span", { class: kind }, text));

$("#startTools").replaceChildren(...TOOLS.map(t => h("div", { class: "tool", title: t.desc }, h("span", { class: "ic", "aria-hidden": "true" }, t.icon), t.title)));

// ------------------------------------------------------------------ the browser must be able to open folders
if (!("showDirectoryPicker" in window)) {
  $("#start").hidden = false;
  $("#startBody").replaceChildren(h("div", { class: "callout" }, "This browser cannot open folders on your PC. Use Google Chrome or Microsoft Edge on a computer."));
  throw new Error("File System Access API not available");
}

// ------------------------------------------------------------------ opening a vault

let current = recall("tool", "overview");
if (!TOOLS.some(t => t.id === current)) current = "overview";     // a tool that no longer exists (e.g. the old Citations page)

async function openVault(entry) {
  say(`Opening ${entry.name}…`);
  await backend.open(entry, { onProgress: (done, total) => say(`Reading publication notes: ${done} of ${total}…`) });
  remember("vault", entry.name);
  $("#start").hidden = true;
  $("#app").hidden = false;
  renderShell();
  render();
  toast(`${backend.library.papers.length} publication notes in ${backend.settings.libraryDir}`, "ok");
}
window.openVault = openVault;

function explain(e) {
  console.error(e);
  if (e?.name === "AbortError") return say("No folder was opened: the folder window was closed, or the browser refused the folder. Try again and choose the vault folder (the one that contains 00 - Library).", "err");
  if (e?.name === "SecurityError") return say("The browser blocked the folder window. Click the button again (it must be a direct click).", "err");
  say(`${e?.name ?? "Error"}: ${e?.message ?? e}`, "err");
}

async function openFolder() {
  say("Choose the vault folder in the window that opened…");
  const entry = await backend.pickFolder();
  if (!(await Backend.isVault(entry.handle, entry.settings?.libraryDir ?? SETTINGS.libraryDir))) {
    say(`"${entry.name}" has no folder "${entry.settings?.libraryDir ?? SETTINGS.libraryDir}". Choose the vault folder itself, or open it and change the library folder in Settings.`, "err");
    await backend.forget(entry.id);
    return;
  }
  await openVault(entry);
}

async function startScreen() {
  const recent = await backend.recent();
  const list = recent.map(v => h("div", { class: "recent" },
    h("span", { class: "name", title: v.name }, "📁 ", v.name),
    h("span", { class: "muted small" }, new Date(v.opened).toLocaleDateString()),
    btn("Forget", async () => { await backend.forget(v.id); startScreen(); }, "sm ghost"),
    btn("Open →", () => openVault(v).catch(explain), "sm primary")));
  $("#startBody").replaceChildren(...[
    h("div", { class: "start-actions" }, btn("📂 Open a vault folder…", () => openFolder().catch(explain), "primary")),
    list.length ? h("div", { class: "recents" }, h("h3", {}, "Open again"), ...list) : null,
    h("p", { class: "start-msg small muted" }, "Works in Chrome or Edge on a computer. The browser asks once per visit before the app may use a folder."),
  ].filter(Boolean));
  $("#start").hidden = false;
}

// ------------------------------------------------------------------ the app shell

function renderShell() {
  const s = backend.settings;
  $("#vault").replaceChildren(h("div", { class: "vault-name", title: backend.entry.name }, "📁 ", backend.entry.name),
    h("div", { class: "small muted" }, `${backend.library.papers.length} publication notes · ${s.libraryDir}`));
  $("#tools").replaceChildren(...TOOLS.map(t => h("button", {
    type: "button", class: "tool" + (t.id === current ? " active" : ""), "aria-current": t.id === current ? "page" : null, title: t.desc,
    onclick: () => { current = t.id; remember("tool", t.id); renderShell(); render(); },
  }, h("span", { class: "ic", "aria-hidden": "true" }, t.icon), t.title)));
}

const ctx = {
  backend,
  rerender: () => render(),
  /** Puts the page's own buttons in the title row. */
  actions: [],
};

function render() {
  const tool = TOOLS.find(t => t.id === current) ?? TOOLS[0];
  ctx.actions = [];
  const page = tool.render(ctx);
  $("#topbar").replaceChildren(
    h("div", { class: "crumbs" }, `Publication library · ${tool.title}`),
    h("div", { class: "titlerow" }, h("h1", {}, tool.title), ...(ctx.status ?? []), h("span", { class: "spacer" }), ...ctx.actions),
    h("p", { class: "desc" }, tool.desc));
  $("#metrics").replaceChildren(...(ctx.metrics ?? []));
  ctx.status = null; ctx.metrics = null;
  $("#page").replaceChildren(page);
  $("#main").scrollTop = 0;
}
window.renderPage = render;

$("#main").addEventListener("scroll", () => $("#topbar").classList.toggle("scrolled", $("#main").scrollTop > 4));
$("#btnClose").onclick = () => {
  if (backend.clusterRunning) return toast("A cluster analysis is running; stop it first.", "err");
  if (backend.coCitationRunning || backend.coCitationDownloading) return toast("A co-citation download or analysis is running; stop it first.", "err");
  $("#app").hidden = true;
  startScreen();
};

// ------------------------------------------------------------------ settings

function settingsDialog() {
  const s = backend.settings;
  const fields = {};
  const field = (key, label) => {
    fields[key] = h("input", { type: key === "apiKey" ? "password" : "text", autocomplete: "off", value: s[key] ?? "", "aria-describedby": `help-${key}` });
    return h("label", { class: "field" }, h("span", {}, label), fields[key], h("span", { class: "small muted", id: `help-${key}` }, SETTINGS_HELP[key]));
  };
  const body = h("div", { class: "stack" },
    field("libraryDir", "Library folder (publication notes)"),
    field("hubDir", "Cluster hub notes folder"),
    field("reportDir", "Cluster report folder"),
    field("presetsFile", "Graph Presets data file"),
    field("exportDir", "Export folder"),
    field("coCitationDir", "Co-citation data folder"),
    field("vaultName", "Obsidian vault name"),
    field("mailto", "Email for OpenAlex (optional)"),
    field("apiKey", "OpenAlex API key (optional)"));
  modal("Settings for this vault", body, [["Cancel"], ["Save", async () => {
    const next = Object.fromEntries(Object.entries(fields).map(([k, el]) => [k, el.value.trim().replace(/[\\/]+$/, "")]));
    for (const k of ["libraryDir", "hubDir", "reportDir", "presetsFile", "exportDir", "coCitationDir"]) if (!next[k]) return toast("Folder and file paths cannot be empty.", "err");
    const libraryChanged = next.libraryDir !== s.libraryDir;
    await backend.saveSettings(next);
    if (libraryChanged) {
      try { await backend.reload(); } catch (e) { toast(e.message, "err"); }
    }
    renderShell(); render();
    toast("Settings saved", "ok");
  }, "primary"]]);
}
$("#btnSettings").onclick = settingsDialog;
window.settingsDialog = settingsDialog;

// ------------------------------------------------------------------ start

const auto = (await backend.recent())[0];
if (auto && recall("vault") === auto.name && !location.search.includes("fixture")) {
  // the vault opened last time: the browser still asks for permission, so this needs a click
  await startScreen();
} else if (!location.search.includes("fixture")) {
  await startScreen();
}
