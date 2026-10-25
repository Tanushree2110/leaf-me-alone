// Safe link-click tracker for Leaf Me Alone
;(function () {
  function notifyLinkInteraction(e) {
    try {
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) {
        window.removeEventListener('mousedown', notifyLinkInteraction, true)
        window.removeEventListener('click', notifyLinkInteraction, true)
        window.removeEventListener('auxclick', notifyLinkInteraction, true)
        window.removeEventListener('contextmenu', notifyLinkInteraction, true)
        return
      }
      var anchor = e.target && e.target.closest ? e.target.closest('a[href]') : null
      if (!anchor) return
      var href = anchor.href
      if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
        chrome.runtime.sendMessage(
          {
            type: 'LEAF_LINK_CLICKED_ON_TAB',
            url: href,
            timestamp: Date.now(),
          },
          function () {
            if (chrome.runtime.lastError) {
              // Ignore silently
            }
          }
        )
      }
    } catch (_e) {}
  }

  window.addEventListener('mousedown', notifyLinkInteraction, true)
  window.addEventListener('click', notifyLinkInteraction, true)
  window.addEventListener('auxclick', notifyLinkInteraction, true)
  window.addEventListener('contextmenu', notifyLinkInteraction, true)
})()
