// Cluster discovery in a worker, so the page stays responsive: opens the library from the vault folder handle,
// runs the analysis and writes the report (and, unless it is a dry run, the hub notes and the graph presets).
// Messages out: { step, text, detail } while it runs, then { done: result } or { error }.
import { browserFolder } from "../src/adapters/browser-folder.js";
import { openLibrary, runClusterDiscovery } from "../src/index.js";

const clock = {
  today: () => new Date().toLocaleDateString("sv"),
  now: () => new Date().toLocaleString("sv").slice(0, 16),
  iso: () => new Date().toISOString(),
};

self.onmessage = async ({ data }) => {
  try {
    const folder = browserFolder(data.handle);
    const library = await openLibrary(folder, { libraryDir: data.libraryDir });
    const result = await runClusterDiscovery(folder, library, data.settings, {
      clock, paths: data.paths, onStep: (step, text, detail) => self.postMessage({ step, text, detail }),
    });
    self.postMessage({ done: result });
  } catch (e) {
    self.postMessage({ error: e?.message ?? String(e) });
  }
};
