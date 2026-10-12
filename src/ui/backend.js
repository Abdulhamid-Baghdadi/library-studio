/**
 * The page's backend in the browser: the open vault (a folder the user picked), its library and settings,
 * and one method per tool. The cluster analysis runs in a worker so the page stays responsive.
 * @module ui/backend
 */
import { browserFolder, requestAccess } from "../adapters/browser-folder.js";
import { forgetVault, recentVaults, rememberVault } from "../adapters/browser-store.js";
import { fetchHttp } from "../adapters/fetch-http.js";
import { checkLinks, citekeysMissing, CLUSTER_DEFAULTS, CLUSTER_PATHS, enrichLibrary, EXPORT_DIR, exportLibrary, isVault, LIBRARY_DIR, openLibrary, updateCitations, withApiKey } from "../index.js";

/** Settings of a vault and their defaults. */
export const SETTINGS = {
  libraryDir: LIBRARY_DIR, hubDir: CLUSTER_PATHS.hubDir, reportDir: CLUSTER_PATHS.reportDir, presetsFile: CLUSTER_PATHS.presetsFile,
  exportDir: EXPORT_DIR, vaultName: "", mailto: "", apiKey: "", cluster: {},
};

const clock = () => ({
  today: () => new Date().toLocaleDateString("sv"),
  now: () => new Date().toLocaleString("sv").slice(0, 16),
  iso: () => new Date().toISOString(),
});

export class Backend {
  /** @type {import("../adapters/browser-store.js").SavedVault|null} */ entry = null;
  /** @type {import("../ports/folder.js").Folder|null} */ folder = null;
  /** @type {import("../services/library.js").Library|null} */ library = null;
  #worker = null;
  #template = null;

  /** @param {{workerUrl: URL, templateUrl: URL}} p the cluster worker script and the graph page template */
  constructor({ workerUrl, templateUrl }) {
    this.workerUrl = workerUrl;
    this.templateUrl = templateUrl;
  }

  /** HTTP for OpenAlex, with the user's API key when one is set. */
  #http() { return withApiKey(fetchHttp(), this.settings.apiKey); }

  /** The vault's settings; the library folder is the one actually opened (e.g. "98 - Publications" in an older vault). */
  get settings() {
    const s = { ...SETTINGS, ...(this.entry?.settings ?? {}) };
    if (this.library) s.libraryDir = this.library.dir;
    return s;
  }

  /** Is this folder a vault with a library folder? */
  static async isVault(handle, libraryDir = LIBRARY_DIR) {
    return isVault(browserFolder(handle), libraryDir);
  }

  /** Lets the user pick the vault folder (needs a click). */
  async pickFolder() {
    const handle = await window.showDirectoryPicker({ id: "vault", mode: "readwrite" });
    return rememberVault(handle);
  }

  /** Opens a remembered vault (asks for access; needs a click) and reads its library. */
  async open(entry, { onProgress } = {}) {
    if (!(await requestAccess(entry.handle))) {
      throw new Error("The browser did not allow the app to edit files in this folder. Click the folder icon in the address bar (or Site settings → File editing) and allow it, then try again.");
    }
    this.entry = entry;
    this.folder = browserFolder(entry.handle);
    await this.reload({ onProgress });
    this.entry = entry.transient ? entry : await rememberVault(entry.handle, { settings: entry.settings ?? {} });
    return this.library;
  }

  /** Re-reads the library (after a tool wrote into it, or when notes changed in Obsidian). */
  async reload({ onProgress } = {}) {
    this.library = await openLibrary(this.folder, { libraryDir: this.settings.libraryDir, onProgress });
    return this.library;
  }

  async saveSettings(settings) {
    if (this.entry.transient) { this.entry.settings = { ...this.entry.settings, ...settings }; return; }
    this.entry = await rememberVault(this.entry.handle, { settings });
  }

  async forget(id) { await forgetVault(id); }
  recent() { return recentVaults(); }

  // ------------------------------------------------------------ tools

  /**
   * Cluster discovery in a worker. Resolves with the result; `onStep(n, text, detail)` reports progress.
   * Only one run at a time; `stopCluster()` ends it.
   */
  cluster(settings, { onStep = () => {} } = {}) {
    if (this.#worker) throw new Error("A run is already in progress.");
    const s = this.settings;
    return new Promise((resolve, reject) => {
      const worker = new Worker(this.workerUrl, { type: "module" });
      this.#worker = worker;
      const finish = (fn, value) => { worker.terminate(); this.#worker = null; fn(value); };
      worker.onmessage = async ({ data }) => {
        if (data.step) onStep(data.step, data.text, data.detail);
        else if (data.error) finish(reject, new Error(data.error));
        else if (data.done) {
          const result = { ...data.done, settingsUsed: settings };
          await this.saveSettings({ cluster: settings });
          if (!this.entry.transient) this.entry = await rememberVault(this.entry.handle, { lastCluster: result });
          else this.entry.lastCluster = result;
          await this.reload();
          finish(resolve, result);
        }
      };
      worker.onerror = e => finish(reject, new Error(e.message || "The analysis failed."));
      worker.postMessage({ handle: this.entry.handle, libraryDir: s.libraryDir, settings: { ...CLUSTER_DEFAULTS, ...settings },
        paths: { hubDir: s.hubDir, reportDir: s.reportDir, presetsFile: s.presetsFile } });
    });
  }

  get clusterRunning() { return Boolean(this.#worker); }

  stopCluster() {
    if (!this.#worker) return false;
    this.#worker.terminate();
    this.#worker = null;
    return true;
  }

  get lastCluster() { return this.entry?.lastCluster ?? null; }

  async citations({ apply = false, onProgress } = {}) {
    const r = await updateCitations(this.folder, this.library, this.#http(), { apply, mailto: this.settings.mailto, onProgress });
    if (apply) await this.reload();
    return r;
  }

  async enrich({ apply = false, onProgress } = {}) {
    const r = await enrichLibrary(this.folder, this.library, this.#http(), { apply, mailto: this.settings.mailto, clock: clock(), onProgress });
    if (apply) await this.reload();
    return r;
  }

  async checkLinks({ fix = false } = {}) {
    const r = await checkLinks(this.folder, this.library, { fix });
    if (fix) await this.reload();
    return r;
  }

  /** Notes that would get a `citekey` property at the next export. */
  get citekeysMissing() { return citekeysMissing(this.library); }

  async export() {
    this.#template ??= await (await fetch(this.templateUrl)).text();
    const r = await exportLibrary(this.folder, this.library, { template: this.#template, exportDir: this.settings.exportDir, clock: clock() });
    if (r.bibtex.citekeysWritten) await this.reload();
    return r;
  }

  /** Reads a file of the vault for the browser to download or show. */
  async fileUrl(path, type = "application/octet-stream") {
    return URL.createObjectURL(new Blob([await this.folder.readBytes(path)], { type }));
  }

  /** The obsidian:// link of a note (path inside the vault). */
  noteLink(path) {
    const vault = this.settings.vaultName || this.entry.name;
    return `obsidian://open?vault=${encodeURIComponent(vault)}&file=${encodeURIComponent(path.replace(/\.md$/, ""))}`;
  }

  paperLink(stem) { return this.noteLink(`${this.settings.libraryDir}/${stem}.md`); }

  /** A clock for the tools that run on the page (the worker has its own). */
  static clock = clock;
}
