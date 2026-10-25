// Injected into existing tabs so when the user clicks a real <a href="..."> link,
// the extension knows this navigation came from clicking a link on an existing tab!

function notifyLinkInteraction(e) {
  try {
    const anchor = e.target && e.target.closest ? e.target.closest('a[href]') : null
    if (!anchor) return
    const href = anchor.href
    if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
      chrome.runtime.sendMessage({
        type: 'LEAF_LINK_CLICKED_ON_TAB',
        url: href,
        timestamp: Date.now(),
      }).catch(() => {})
    }
  } catch {}
}

window.addEventListener('mousedown', notifyLinkInteraction, true)
window.addEventListener('click', notifyLinkInteraction, true)
window.addEventListener('auxclick', notifyLinkInteraction, true)
window.addEventListener('contextmenu', notifyLinkInteraction, true)
