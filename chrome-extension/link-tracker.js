// Injected into existing tabs so clicking any <a href="..."> link is recognized as an allowed expansion

function notifyLinkInteraction(e) {
  try {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) return
    const anchor = e.target && e.target.closest ? e.target.closest('a[href]') : null
    if (!anchor) return
    const href = anchor.href
    if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
      chrome.runtime
        .sendMessage({
          type: 'LEAF_LINK_CLICKED_ON_TAB',
          url: href,
          timestamp: Date.now(),
        })
        .catch(() => {})
    }
  } catch {}
}

window.addEventListener('mousedown', notifyLinkInteraction, true)
window.addEventListener('click', notifyLinkInteraction, true)
window.addEventListener('auxclick', notifyLinkInteraction, true)
window.addEventListener('contextmenu', notifyLinkInteraction, true)
