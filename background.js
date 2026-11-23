// ChatVault MV3 Background Service Worker
// Opens or focuses the dedicated full-page exporter workstation tab to avoid MV3 Service Worker 5-minute timeouts and OOM limits.

const EXPORTER_PAGE = 'exporter.html';

chrome.action.onClicked.addListener(async () => {
  const exporterUrl = chrome.runtime.getURL(EXPORTER_PAGE);
  const existingTabs = await chrome.tabs.query({ url: exporterUrl });

  if (existingTabs && existingTabs.length > 0) {
    const tab = existingTabs[0];
    await chrome.tabs.update(tab.id, { active: true });
    if (tab.windowId) {
      await chrome.windows.update(tab.windowId, { focused: true });
    }
  } else {
    await chrome.tabs.create({ url: exporterUrl, active: true });
  }
});
