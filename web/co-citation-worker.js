// Co-citation phases in a worker, so the page stays responsive: opens the library from the vault folder handle, looks
// up the cited works it still needs at OpenAlex, analyses, and writes the VOSviewer files, the figure and the note.
// Messages out: { step, text, detail } while it runs, then { done: result } or { error }.
import { browserFolder } from "../src/adapters/browser-folder.js";
import { fetchHttp, openLibrary, runCoCitation, withApiKey } from "../src/index.js";

const clock = {
  today: () => new Date().toLocaleDateString("sv"),
  now: () => new Date().toLocaleString("sv").slice(0, 16),
  iso: () => new Date().toISOString(),
};

self.onmessage = async ({ data }) => {
  try {
    const folder = browserFolder(data.handle);
    const library = await openLibrary(folder, { libraryDir: data.libraryDir });
    const result = await runCoCitation(folder, library, data.dir, data.settings, {
      name: data.name, http: withApiKey(fetchHttp(), data.apiKey), mailto: data.mailto, clock,
      onStep: (step, text, detail) => self.postMessage({ step, text, detail }),
    });
    self.postMessage({ done: result });
  } catch (e) {
    self.postMessage({ error: e?.message ?? String(e) });
  }
};
