// Auto-upgrade extension from disk if an older service worker (v1.0 - v1.5) is still cached in Chrome memory!
try {
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getManifest) {
    var manifest = chrome.runtime.getManifest()
    if (manifest && manifest.version !== '1.6.0' && chrome.runtime.reload) {
      chrome.runtime.reload()
    }
  }
} catch (_e) {}
