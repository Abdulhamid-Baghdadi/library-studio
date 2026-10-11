// "Install as an app": Chrome and Edge can install the site as a desktop app (own window, works offline through
// sw.js). The buttons open the browser's prompt and hide once the app is installed or opened as one.
let prompt = null;
const BUTTONS = ["btnInstall", "startInstall"];
const installed = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

function update() {
  for (const id of BUTTONS) { const b = document.getElementById(id); if (b) b.hidden = installed(); }
}
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); prompt = e; update(); });
window.addEventListener("appinstalled", () => { prompt = null; for (const id of BUTTONS) { const b = document.getElementById(id); if (b) b.hidden = true; } });

async function install() {
  if (prompt) { prompt.prompt(); await prompt.userChoice; prompt = null; return; }
  alert("To install Library Studio as an app, open it in Chrome or Edge and choose \"Install\" in the address bar or in the browser menu (⋮ → Cast, save and share → Install page as app). It then opens in its own window and works offline.");
}
for (const id of BUTTONS) document.getElementById(id)?.addEventListener("click", install);
update();
