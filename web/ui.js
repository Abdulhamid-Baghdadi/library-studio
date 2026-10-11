// Small DOM helpers shared by the pages: elements, buttons, pills, cards, toasts, dialogs, busy state.
export const $ = (s, r = document) => r.querySelector(s);

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style") el.style.cssText = v;
    else if (k === "html") el.innerHTML = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k in el && typeof v !== "string") el[k] = v;
    else if (k === "value") el.value = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat(9)) if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  // clickable non-buttons are reachable by keyboard
  if (props?.onclick && !["BUTTON", "A", "INPUT", "SELECT"].includes(el.tagName) && !el.hasAttribute("tabindex")) {
    el.tabIndex = 0;
    el.setAttribute("role", "button");
    el.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); el.click(); } });
  }
  return el;
}

export const btn = (label, onclick, cls = "", attrs = {}) => h("button", { class: `btn ${cls}`, type: "button", onclick, ...attrs }, label);
export const pill = (text, kind = "") => h("span", { class: `pill ${kind}` }, text);
export const card = (title, sub, ...kids) => h("div", { class: "card" }, title ? h("h3", {}, title) : null, sub ? h("p", { class: "sub" }, sub) : null, ...kids);
export const empty = (icon, title, text) => h("div", { class: "card empty" }, h("div", { class: "big", "aria-hidden": "true" }, icon), h("h3", {}, title), h("p", {}, text));

export function toast(text, kind = "") {
  const t = h("div", { class: `toast ${kind}`, role: "status" }, text);
  $("#toasts").append(t);
  setTimeout(() => t.remove(), kind === "err" ? 8000 : 3500);
  return t;
}

/** Segmented control: options [[value, label]], onChange(value). */
export function segmented(options, value, onChange, label = "") {
  return h("div", { class: "seg", role: "group", "aria-label": label },
    options.map(([v, t]) => h("button", { type: "button", class: v === value ? "on" : "", "aria-pressed": v === value ? "true" : "false", onclick: () => onChange(v) }, t)));
}

/** A modal dialog; buttons: [[label, onclick, cls]]. Returns the dialog element. */
export function modal(title, body, buttons, { wide = false } = {}) {
  const dialog = h("dialog", { class: `modal${wide ? " wide" : ""}`, "aria-label": title },
    h("div", { class: "mh" }, title),
    h("div", { class: "mb" }, body),
    h("div", { class: "mf" }, buttons.map(([label, fn, cls = ""]) => btn(label, () => { dialog.close(); fn && fn(); }, cls))));
  dialog.addEventListener("close", () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
  return dialog;
}

/** Asks before a destructive or bulk action. Resolves true when confirmed. */
export const confirmBox = (title, text, okLabel = "Continue") => new Promise(resolve =>
  modal(title, typeof text === "string" ? h("p", { class: "muted" }, text) : text, [["Cancel", () => resolve(false)], [okLabel, () => resolve(true), "primary"]]));

/** Runs `fn` with the button disabled and a spinner; shows errors as toasts. */
export async function busy(button, fn, label = "Working…") {
  const was = button.innerHTML;
  button.disabled = true;
  button.replaceChildren(h("span", { class: "spin", "aria-hidden": "true" }), label);
  try { return await fn(); }
  catch (e) { console.error(e); toast(e?.message ?? String(e), "err"); return null; }
  finally { button.disabled = false; button.innerHTML = was; }
}

/** The file chips under a tool: where its data is saved. */
export const savedIn = (items) => h("div", { class: "savedin" }, h("span", { class: "muted small" }, "Saved in:"),
  items.map(([path, hint]) => h("span", { class: "file", title: hint || path }, path, hint ? h("span", { class: "muted" }, ` · ${hint}`) : null)));

export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const PALETTE = ["#4f46e5", "#0891b2", "#16a34a", "#d97706", "#dc2626", "#9333ea", "#0d9488", "#db2777", "#65a30d", "#2563eb", "#ea580c", "#7c3aed"];
export const color = i => PALETTE[i % PALETTE.length];
