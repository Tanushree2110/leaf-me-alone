// Immediately notify the game & close this New Tab!
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
