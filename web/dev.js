// Development helper: with `?fixture` in the address and `node scripts/serve.js --fixture <vault>`, the vault
// served at /fixture/ is copied into the browser's own storage and opened without the folder picker (which
// browser automation cannot use). Not loaded by users: it does nothing without the query parameter.
if (location.search.includes("fixture")) {
  const DIR = "fixture-vault";
  const root = await (await navigator.storage.getDirectory()).getDirectoryHandle(DIR, { create: true });
  for await (const key of root.keys()) await root.removeEntry(key, { recursive: true });
  const manifest = await (await fetch("/fixture/manifest.json")).json();
  let n = 0;
  for (const path of manifest.files) {
    const parts = path.split("/"), name = parts.pop();
    let dir = root;
    for (const p of parts) dir = await dir.getDirectoryHandle(p, { create: true });
    const bytes = await (await fetch("/fixture/files/" + parts.concat(name).map(encodeURIComponent).join("/"))).arrayBuffer();
    const w = await (await dir.getFileHandle(name, { create: true })).createWritable();
    await w.write(bytes);
    await w.close();
    n++;
  }
  console.info(`fixture: ${n} files copied into the browser's storage as "${DIR}"`);
  window.fixtureEntry = { id: "fixture", handle: root, name: manifest.name, opened: Date.now(), transient: true, settings: {} };
  await window.openVault(window.fixtureEntry);
}
