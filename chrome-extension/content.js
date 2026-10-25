// Content script injected into http://localhost:5173/ to bridge Chrome Tab Blocker with Leaf Me Alone

function isExtensionContextValid() {
  try {
    return Boolean(typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id)
  } catch {
    return false
  }
}

function requestGuardStatus() {
  if (!isExtensionContextValid()) return
  try {
    chrome.runtime.sendMessage({ type: 'LEAF_REQUEST_CHROME_TABS' }, (response) => {
      try {
        if (chrome.runtime.lastError) return
        if (response && response.ok) {
          window.postMessage(
            {
              type: 'LEAF_CHROME_GUARD_STATUS',
              allowedCount: response.allowedCount || 1,
            },
            '*'
          )
        }
      } catch {}
    })
  } catch {}
}

if (isExtensionContextValid()) {
  window.postMessage({ type: 'LEAF_EXTENSION_READY' }, '*')
  requestGuardStatus()
  setTimeout(requestGuardStatus, 500)

  try {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.type) {
        window.postMessage(msg, '*')
      }
    })
  } catch {}
}

window.addEventListener('message', (event) => {
  if (event.source !== window || !event.data) return
  if (event.data.type === 'LEAF_APP_REQUEST_SYNC') {
    requestGuardStatus()
  }
})
