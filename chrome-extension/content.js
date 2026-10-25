// Content script injected into http://localhost:5173/ to bridge Chrome Tabs API with Leaf Me Alone

function syncTabsNow() {
  try {
    chrome.runtime.sendMessage({ type: 'LEAF_REQUEST_CHROME_TABS' }, (response) => {
      if (chrome.runtime.lastError) return
      if (response && response.ok && Array.isArray(response.tabs)) {
        window.postMessage(
          {
            type: 'LEAF_CHROME_TABS_SYNC',
            tabs: response.tabs,
          },
          '*'
        )
      }
    })
  } catch {}
}

window.postMessage({ type: 'LEAF_EXTENSION_READY' }, '*')
syncTabsNow()

// Re-sync shortly after React finishes mounting so it always catches the initial render
setTimeout(syncTabsNow, 400)
setTimeout(syncTabsNow, 1200)

// Listen for messages from background worker and forward to page
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type) {
    window.postMessage(msg, '*')
  }
})

// Listen for requests from the React app
window.addEventListener('message', (event) => {
  if (event.source !== window || !event.data) return

  if (event.data.type === 'LEAF_APP_REQUEST_SYNC') {
    syncTabsNow()
  }

  if (event.data.type === 'LEAF_APP_ACTIVATE_TAB' && event.data.chromeTabId) {
    chrome.runtime.sendMessage({
      type: 'LEAF_ACTIVATE_CHROME_TAB',
      chromeTabId: event.data.chromeTabId,
    })
  }
})
