// Safe, zero-listener content bridge for Leaf Me Alone
;(function () {
  try {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) return

    window.postMessage({ type: 'LEAF_EXTENSION_READY' }, '*')

    chrome.runtime.sendMessage({ type: 'LEAF_REQUEST_CHROME_TABS' }, function (response) {
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
      } catch (_e) {}
    })

    chrome.runtime.onMessage.addListener(function (msg) {
      try {
        if (!chrome.runtime || !chrome.runtime.id) return
        if (msg && msg.type) {
          window.postMessage(msg, '*')
        }
      } catch (_e) {}
    })
  } catch (_e) {}
})()
