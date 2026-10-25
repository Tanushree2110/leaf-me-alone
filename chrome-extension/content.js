// Content script injected into http://localhost:5173/ to bridge Chrome Tabs API with Leaf Me Alone

window.postMessage({ type: 'LEAF_EXTENSION_READY' }, '*')

// Request initial open Chrome tabs immediately on load
chrome.runtime.sendMessage({ type: 'LEAF_REQUEST_CHROME_TABS' }, (response) => {
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
    chrome.runtime.sendMessage({ type: 'LEAF_REQUEST_CHROME_TABS' }, (response) => {
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
  }

  if (event.data.type === 'LEAF_APP_ACTIVATE_TAB' && event.data.chromeTabId) {
    chrome.runtime.sendMessage({
      type: 'LEAF_ACTIVATE_CHROME_TAB',
      chromeTabId: event.data.chromeTabId,
    })
  }
})
