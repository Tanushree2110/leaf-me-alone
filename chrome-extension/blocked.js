// Immediately notify the local game server AND extension background worker, then close this New Tab!
fetch('http://localhost:5173/api/new-tab-blocked', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    reason: 'Blocked opening a standalone New Tab (+ / Cmd+T)',
  }),
}).catch(() => {})

try {
  chrome.runtime.sendMessage({ type: 'LEAF_NEW_TAB_OVERRIDE_TRIGGERED' }, () => {
    window.close()
  })
} catch {
  window.close()
}

if (chrome && chrome.tabs && chrome.tabs.getCurrent) {
  chrome.tabs.getCurrent((tab) => {
    if (tab && tab.id) {
      chrome.tabs.remove(tab.id).catch(() => {
        window.close()
      })
    } else {
      window.close()
    }
  })
} else {
  window.close()
}
