/**
 * Front matter of a vault note: the YAML subset used by the publication notes.
 *
 *   splitNote(text)            → { props, body, raw, eol } — props parsed, raw = the block between the --- lines
 *   parseFrontMatter(block)    → { key: value | [items] }  ('key: value', 'key: []', 'key:' + '  - item' lines)
 *   formatList(key, items)     → YAML lines for a list property of links ('key: []' when empty)
 *   replaceProps(text, {key: lines}) → note text with those properties replaced or added (before `category:` when present)
 *   insertProp(text, key, value, place) → note text with a scalar property added (unchanged when present); place:
 *                                 "key" (after it), ["key1", "key2"] (after the first present), { before: [keys] }
 *   setScalar(text, key, value, place)  → the property's value replaced (also an empty one), or the property added
 *   appendListItem(text, key, item, place) → an item added to a list property (created when missing; no duplicates)
 *   yamlScalar(value)          → the value as Obsidian would write it (JSON-quoted when YAML needs it)
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
 * The line index where a new property goes. `place` is a key (after it), a list of keys (after the first of them
 * the note has) or { before: [keys] } (before the first of those properties in the note). At the end of the front
 * matter when the note has none of them.
 */
function placeIndex(lines, place) {
  const keyAt = k => lines.findIndex(l => l.startsWith(`${k}:`));
  if (place && Array.isArray(place.before)) {
    const found = place.before.map(keyAt).filter(i => i >= 0);
    return found.length ? Math.min(...found) : lines.length;
  }
  const at = [place ?? []].flat().map(keyAt).find(i => i >= 0) ?? -1;
  if (at < 0) return lines.length;
  let i = at + 1;
  while (i < lines.length && /^\s+-/.test(lines[i])) i++;      // after a list property: skip its items
  return i;
}

/**
 * Adds a scalar property at `place` (see placeIndex: after a key, after the first of several keys, or before
 * some keys; at the end of the front matter otherwise). Does nothing when the property is already there.
 * Line endings are kept.
 */
export function insertProp(text, key, value, place) {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lf = text.replace(/\r\n/g, "\n");
  const m = /^---\n([\s\S]*?)\n---/.exec(lf);
  if (!m || new RegExp(`^${key}:`, "m").test(m[1])) return text;
  const lines = m[1].split("\n");
  lines.splice(placeIndex(lines, place), 0, `${key}: ${value}`);
  const out = lf.slice(0, m.index + 4) + lines.join("\n") + lf.slice(m.index + 4 + m[1].length);
  return out.replace(/\n/g, eol);
}

/** A YAML scalar as Obsidian writes it: quoted (JSON) when it has characters YAML would misread. */
export const yamlScalar = v => {
  const s = String(v ?? "");
  const plain = s !== "" && !/^[\s\-?:,[\]{}#&*!|>'"%@`]/.test(s) && !/: |\s#|\s$|\n/.test(s) && !/^(true|false|null|yes|no|~)$/i.test(s);
  return plain ? s : JSON.stringify(s);
};

/**
 * Sets a scalar property: replaces its value when the property exists (also when empty), else adds it
 * at `after` (insertProp). Line endings are kept.
 */
export function setScalar(text, key, value, after) {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lf = text.replace(/\r\n/g, "\n");
  const m = /^---\n([\s\S]*?)\n---/.exec(lf);
  if (!m) return text;
  const re = new RegExp(`^${key}:[^\\n]*(?:\\n[ \\t]+-[^\\n]*)*`, "m");
  if (!re.test(m[1])) return insertProp(text, key, yamlScalar(value), after);
  const block = m[1].replace(re, `${key}: ${yamlScalar(value)}`);
  return (lf.slice(0, m.index + 4) + block + lf.slice(m.index + 4 + m[1].length)).replace(/\n/g, eol);
}

/** Adds an item to a list property (created at `after` when missing, see insertProp); a duplicate item is not added. */
export function appendListItem(text, key, item, after) {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lf = text.replace(/\r\n/g, "\n");
  const m = /^---\n([\s\S]*?)\n---/.exec(lf);
  if (!m) return text;
  const re = new RegExp(`^${key}:[^\\n]*((?:\\n[ \\t]+-[^\\n]*)*)`, "m");
  const found = re.exec(m[1]);
  const line = `  - ${yamlScalar(item)}`;
  let block;
  if (!found) {
    const lines = m[1].split("\n");
    lines.splice(placeIndex(lines, after), 0, `${key}:`, line);
    block = lines.join("\n");
  } else {
    const items = found[1].split("\n").filter(Boolean).map(l => unquote(l.replace(/^\s+-\s*/, "")));
    if (items.includes(String(item))) return text;
    block = m[1].replace(re, `${key}:${found[1]}\n${line}`);
  }
  return (lf.slice(0, m.index + 4) + block + lf.slice(m.index + 4 + m[1].length)).replace(/\n/g, eol);
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
