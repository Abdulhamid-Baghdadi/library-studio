/**
 * Front matter of a vault note: the YAML subset used by the publication notes.
 *
 *   splitNote(text)            → { props, body, raw, eol } — props parsed, raw = the block between the --- lines
 *   parseFrontMatter(block)    → { key: value | [items] }  ('key: value', 'key: []', 'key:' + '  - item' lines)
 *   formatList(key, items)     → YAML lines for a list property of links ('key: []' when empty)
 *   replaceProps(text, {key: lines}) → note text with those properties replaced or added (before `category:` when present)
 *   insertProp(text, key, value, after) → note text with a scalar property added after another one (unchanged when present)
 *   linkTarget(value)          → 'Note name' from '[[Note name|alias]]' (the value itself when it is not a link)
 *   WIKILINK                   → regex source for [[target#heading|alias]] with groups (target, alias); matches embeds too
 *
 * Quoted values ("...") are JSON-decoded, as Obsidian writes them. Line endings are kept (eol).
 */
export const WIKILINK = /!?\[\[([^\]|#]+?)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g;
const FM = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

export function unquote(v) {
  v = v.trim();
  if (v.length >= 2 && v[0] === '"' && v[v.length - 1] === '"') {
    try { return JSON.parse(v); } catch { return v.slice(1, -1); }
  }
  return v;
}

export function parseFrontMatter(block) {
  const props = {};
  let key = null;
  for (const line of block.split(/\r?\n/)) {
    const m = /^([A-Za-z_][\w-]*):[ \t]*(.*)$/.exec(line);
    if (m) {
      key = m[1];
      const v = m[2].trim();
      props[key] = v === "" || v === "[]" ? [] : unquote(v);
    } else if (key) {
      const item = /^\s+-\s*(.*)$/.exec(line);
      if (item) {
        if (!Array.isArray(props[key])) props[key] = [];
        const val = unquote(item[1]);
        if (val !== "") props[key].push(val);
      }
    }
  }
  return props;
}

export function splitNote(text) {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const m = FM.exec(text);
  if (!m) return { props: {}, body: text, raw: null, eol };
  return { props: parseFrontMatter(m[1]), body: text.slice(m[0].length), raw: m[1], eol };
}

export function linkTarget(value) {
  const s = String(value ?? "");
  const m = new RegExp(WIKILINK.source).exec(s);
  return m ? m[1].trim() : s.trim();
}

export function formatList(key, items) {
  if (!items || !items.length) return `${key}: []\n`;
  return `${key}:\n` + items.map(s => `  - "[[${s}]]"\n`).join("");
}

/**
 * Adds a scalar property after another one (or at the end of the front matter when `after` is missing).
 * Does nothing when the property is already there. Line endings are kept.
 */
export function insertProp(text, key, value, after) {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lf = text.replace(/\r\n/g, "\n");
  const m = /^---\n([\s\S]*?)\n---/.exec(lf);
  if (!m || new RegExp(`^${key}:`, "m").test(m[1])) return text;
  const lines = m[1].split("\n");
  const at = after ? lines.findIndex(l => l.startsWith(`${after}:`)) : -1;
  let i = at < 0 ? lines.length : at + 1;
  while (at >= 0 && i < lines.length && /^\s+-/.test(lines[i])) i++;      // after a list property: skip its items
  lines.splice(i, 0, `${key}: ${value}`);
  const out = lf.slice(0, m.index + 4) + lines.join("\n") + lf.slice(m.index + 4 + m[1].length);
  return out.replace(/\n/g, eol);
}

/** Replace (or add) whole properties. `lines` maps a key to the YAML text of that property, ending in \n. */
export function replaceProps(text, lines) {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lf = text.replace(/\r\n/g, "\n");
  const m = /^---\n([\s\S]*?)\n---/.exec(lf);
  if (!m) return text;
  let block = m[1] + "\n";
  for (const key of Object.keys(lines)) {
    block = block.replace(new RegExp(`^${key}:[^\n]*\n(?:[ \t]+-[^\n]*\n)*`, "m"), "");
  }
  block = block.replace(/\n$/, "");
  const add = Object.values(lines).join("");
  if (/^category:/m.test(block)) block = block.replace(/^category:/m, add + "category:");
  else block += "\n" + add.replace(/\n$/, "");
  const out = lf.slice(0, m.index + 4) + block + lf.slice(m.index + 4 + m[1].length);
  return out.replace(/\n/g, eol);
}
