// Leaf Me Alone — Strict New-Tab & New-Window Blocker Background Service Worker
// ONLY enforces restrictions while Pomodoro is STARTED (active=true).
// When Pomodoro is STOPPED (active=false), nothing is prohibited!

let recentLinkClicks = [] // { tabId, url, timestamp }
let allowedTabIds = new Set()
let allowedWindowIds = new Set()
let isInitialized = false
let isGuardActive = false

async function syncGuardActiveFromServer() {
  try {
    const res = await fetch('http://localhost:5173/api/focus-guard-state')
    const data = await res.json()
    const nextActive = Boolean(data && data.active)
    if (nextActive && !isGuardActive) {
      // Pomodoro just started -> Snapshot all currently open tabs & windows as allowed!
      await snapshotExistingTabs()
    }
    isGuardActive = nextActive
    return isGuardActive
  } catch {
    isGuardActive = false
    return false
  }
}

setInterval(syncGuardActiveFromServer, 1000)

async function snapshotExistingTabs() {
  const tabs = await chrome.tabs.query({})
  allowedTabIds = new Set(tabs.map((t) => t.id).filter(Boolean))
  allowedWindowIds = new Set(tabs.map((t) => t.windowId).filter(Boolean))
  isInitialized = true
  await sendToGameTabs({
    type: 'LEAF_CHROME_GUARD_STATUS',
    allowedCount: allowedTabIds.size,
  })
}

snapshotExistingTabs()

async function notifyBlockedAction(reason) {
  const active = await syncGuardActiveFromServer()
  if (!active) return

  try {
    await fetch('http://localhost:5173/api/new-tab-blocked', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    })
  } catch {}
  try {
    const allTabs = await chrome.tabs.query({})
    const gameTabs = allTabs.filter(
      (t) => t.url && (t.url.includes('localhost:5173') || t.url.includes('127.0.0.1:5173'))
    )
    for (const gt of gameTabs) {
      if (gt.id) {
        if (gt.windowId) {
          chrome.windows.update(gt.windowId, { focused: true }).catch(() => {})
        }
        chrome.tabs.update(gt.id, { active: true }).catch(() => {})
        chrome.tabs
          .sendMessage(gt.id, {
            type: 'LEAF_CHROME_UNAUTHORIZED_NEW_TAB_BLOCKED',
            reason,
          })
          .catch(() => {})
      }
    }
  } catch {}
}

async function sendToGameTabs(payload) {
  const allTabs = await chrome.tabs.query({})
  const gameTabs = allTabs.filter(
    (t) => t.url && (t.url.includes('localhost:5173') || t.url.includes('127.0.0.1:5173'))
  )
  for (const gt of gameTabs) {
    if (gt.id) {
      chrome.tabs.sendMessage(gt.id, payload).catch(() => {})
    }
  }
}

async function injectScriptsIntoOpenTabs() {
  await snapshotExistingTabs()
  const allTabs = await chrome.tabs.query({})
  for (const t of allTabs) {
    if (t.id && t.url && (t.url.includes('localhost:5173') || t.url.includes('127.0.0.1:5173'))) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: t.id },
          files: ['content.js'],
        })
      } catch {}
    } else if (t.id && t.url && t.url.startsWith('http')) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: t.id },
          files: ['link-tracker.js'],
        })
      } catch {}
    }
  }
}

chrome.runtime.onInstalled.addListener(injectScriptsIntoOpenTabs)
chrome.runtime.onStartup.addListener(injectScriptsIntoOpenTabs)

// BLOCK OPENING ANY NEW BROWSER WINDOW OR MOVING OFF FROM CHROME (ONLY WHEN POMODORO IS RUNNING!)
if (chrome.windows && chrome.windows.onCreated) {
  chrome.windows.onCreated.addListener(async (win) => {
    const active = await syncGuardActiveFromServer()
    if (!active) {
      if (win && win.id) allowedWindowIds.add(win.id)
      return
    }
    if (win && win.id && !allowedWindowIds.has(win.id)) {
      try {
        await chrome.windows.remove(win.id)
      } catch {}
      await notifyBlockedAction('Blocked opening a New Browser Window (Cmd+N)!')
    }
  })
}

let lastChromeBlurAlertMs = 0
if (chrome.windows && chrome.windows.onFocusChanged) {
  chrome.windows.onFocusChanged.addListener(async (windowId) => {
    if (windowId === chrome.windows.WINDOW_ID_NONE) {
      const active = await syncGuardActiveFromServer()
      if (!active) return
      const now = Date.now()
      if (now - lastChromeBlurAlertMs < 1500) return
      lastChromeBlurAlertMs = now
      await notifyBlockedAction('Moved off from Google Chrome to another app!')
    }
  })
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'LEAF_LINK_CLICKED_ON_TAB') {
    const senderTabId = sender?.tab?.id
    if (senderTabId) {
      allowedTabIds.add(senderTabId)
      const now = Date.now()
      recentLinkClicks = recentLinkClicks.filter((c) => now - c.timestamp < 8000)
      recentLinkClicks.push({
        tabId: senderTabId,
        url: msg.url,
        timestamp: now,
      })
    }
    sendResponse({ ok: true })
    return true
  }

  if (msg?.type === 'LEAF_NEW_TAB_OVERRIDE_TRIGGERED') {
    syncGuardActiveFromServer().then((active) => {
      if (!active) {
        sendResponse({ ok: true })
        return
      }
      if (sender?.tab?.id) {
        chrome.tabs.remove(sender.tab.id).catch(() => {})
      }
      notifyBlockedAction('Blocked opening a standalone New Tab (+ / Cmd+T)!')
      sendResponse({ ok: true })
    })
    return true
  }

  if (msg?.type === 'LEAF_REQUEST_CHROME_TABS') {
    snapshotExistingTabs().then(() => {
      sendResponse({ ok: true, allowedCount: allowedTabIds.size })
    })
    return true
  }
})

chrome.tabs.onCreated.addListener(async (tab) => {
  const active = await syncGuardActiveFromServer()
  if (!active) {
    // Pomodoro is STOPPED -> Allow opening any tab or window freely!
    if (tab.id) allowedTabIds.add(tab.id)
    if (tab.windowId) allowedWindowIds.add(tab.windowId)
    await sendToGameTabs({
      type: 'LEAF_CHROME_GUARD_STATUS',
      allowedCount: allowedTabIds.size,
    })
    return
  }

  const now = Date.now()
  const targetUrl = tab.pendingUrl || tab.url || ''

  if (tab.windowId && isInitialized && !allowedWindowIds.has(tab.windowId)) {
    try {
      await chrome.windows.remove(tab.windowId)
    } catch {}
    await notifyBlockedAction('Blocked opening a New Browser Window (Cmd+N)!')
    return
  }

  const isManualBlankNewTab =
    !targetUrl ||
    targetUrl.startsWith('chrome://newtab') ||
    targetUrl.startsWith('chrome-extension://') ||
    targetUrl.startsWith('edge://newtab') ||
    targetUrl === 'about:blank'

  const hasAllowedOpener = Boolean(tab.openerTabId && allowedTabIds.has(tab.openerTabId))
  const matchedLinkClick = recentLinkClicks.some((c) => now - c.timestamp < 8000)

  if (!isManualBlankNewTab && (hasAllowedOpener || matchedLinkClick)) {
    if (tab.id) {
      allowedTabIds.add(tab.id)
    }
    await sendToGameTabs({
      type: 'LEAF_CHROME_GUARD_STATUS',
      allowedCount: allowedTabIds.size,
    })
  } else {
    if (tab.id) {
      try {
        await chrome.tabs.remove(tab.id)
      } catch {}
    }
    await notifyBlockedAction(
      'Blocked opening a standalone New Tab (only links from existing tabs allowed)!'
    )
  }
})

chrome.tabs.onRemoved.addListener((tabId) => {
  allowedTabIds.delete(tabId)
  sendToGameTabs({
    type: 'LEAF_CHROME_GUARD_STATUS',
    allowedCount: allowedTabIds.size,
  })
})
