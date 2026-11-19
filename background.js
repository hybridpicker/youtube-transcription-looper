// Toolbar button: on a YouTube tab it toggles the looper panel under the
// player, anywhere else it opens the workstation for audio files.
const APP_URL = chrome.runtime.getURL("app/index.html");
const CONTENT_FILES = ["shared/common.js", "youtube/panel-css.js", "youtube/content.js"];
const isYouTube = (url) => /^https:\/\/www\.youtube\.com\//.test(url || "");

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !isYouTube(tab.url)) {
    chrome.tabs.create({ url: APP_URL });
    return;
  }
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "toggle-panel" });
  } catch {
    // Tab was open before the extension was (re)loaded: inject, then toggle.
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: CONTENT_FILES });
    await chrome.tabs.sendMessage(tab.id, { type: "toggle-panel" });
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "open-app") chrome.tabs.create({ url: APP_URL });
});
