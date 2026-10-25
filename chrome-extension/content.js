// Marks the game page so it knows the focus guard extension is installed. No listeners.
;(function () {
  try {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) return
    document.documentElement.setAttribute('data-leaf-guard', chrome.runtime.getManifest().version)
  } catch (_e) {}
})()
