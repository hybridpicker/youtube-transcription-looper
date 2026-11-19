const $ = (id) => document.getElementById(id);
const format = (seconds) => { if (!Number.isFinite(seconds)) return "--:--.--"; const m = Math.floor(seconds / 60), s = Math.floor(seconds % 60), cs = Math.floor((seconds % 1) * 100); return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`; };
const parse = (value) => { const parts = String(value).trim().replace(",", ".").split(":"); if (!parts.length || parts.some((part) => part === "" || !Number.isFinite(Number(part)))) return null; const seconds = parts.reduce((total, part) => total * 60 + Number(part), 0); return seconds >= 0 ? seconds : null; };

let tabId;
async function send(type, extra = {}) {
  if (!tabId) throw new Error("Kein aktiver Tab gefunden.");
  try {
    return await chrome.tabs.sendMessage(tabId, { type, ...extra });
  } catch {
    // Nach einem Extension-Reload ist der Content-Script-Context in bereits
    // geöffneten YouTube-Tabs weg. Bei Bedarf wird er deshalb direkt ergänzt.
    await chrome.scripting.insertCSS({ target: { tabId }, files: ["content.css"] }).catch(() => {});
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    return chrome.tabs.sendMessage(tabId, { type, ...extra });
  }
}
function render(data) {
  if (document.activeElement !== $("start")) $("start").value = format(data.start);
  if (document.activeElement !== $("end")) $("end").value = format(data.end);
  const toggle = $("toggle"); toggle.textContent = data.enabled ? "Loop ausschalten" : "Loop einschalten"; toggle.classList.toggle("active", data.enabled);
  const hint = $("hint"); hint.textContent = !data.hasVideo ? "Öffne eine Wiedergabeseite mit einem YouTube-Video." : data.enabled && !data.valid ? "Bitte erst A und B setzen (B nach A)." : data.enabled ? "Loop läuft." : "Bereit."; hint.classList.toggle("ok", Boolean(data.hasVideo) && data.enabled && data.valid);
  $("show").textContent = data.panelVisible ? "Steuerung im Video ausblenden" : "Steuerung im Video einblenden";
}
async function action(type) { try { render(await send(type)); } catch (error) { $("hint").textContent = error.message; $("hint").classList.remove("ok"); } }
document.addEventListener("DOMContentLoaded", async () => {
  $("open-app").onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL("app/index.html") });
  const [tab] = await chrome.tabs.query({ active:true, currentWindow:true }); tabId = tab?.id;
  if (tab?.url && !/^https:\/\/(www\.)?youtube\.com\//.test(tab.url)) { $("hint").textContent = "Bitte öffne eine YouTube-Wiedergabeseite."; return; }
  try { render(await send("get-status")); } catch { $("hint").textContent = "Bitte öffne eine YouTube-Wiedergabeseite und versuche es erneut."; }
  $("set-start").onclick = () => action("set-start"); $("set-end").onclick = () => action("set-end"); $("toggle").onclick = () => action("toggle"); $("clear").onclick = () => action("clear");
  $("show").onclick = async () => { try { render(await send("set-panel-visibility", { visible: !$("show").textContent.includes("ausblenden") })); } catch (error) { $("hint").textContent = error.message; } };
  [["start", "set-start"], ["end", "set-end"]].forEach(([id, type]) => $(id).addEventListener("change", async (event) => { const value = parse(event.target.value); if (value === null) { $("hint").textContent = "Ungültige Zeit. Nutze z. B. 01:23.45."; return; } try { render(await send(type, { value })); } catch (error) { $("hint").textContent = error.message; } }));
});
