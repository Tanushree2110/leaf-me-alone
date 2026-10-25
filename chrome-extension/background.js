// Leaf Me Alone — Strict New-Tab & New-Window Blocker Background Service Worker
// CRITICAL RULE:
// 1. If NO game tab (localhost:5173) is open in Chrome -> DO NOT BLOCK ANYTHING!
// 2. If Pomodoro is Stopped / Off -> DO NOT BLOCK ANYTHING!
// 3. ONLY block new tabs / windows when BOTH a game tab is open AND Pomodoro is actively running!

let recentLinkClicks = [] // { tabId, url, timestamp }
let allowedTabIds = new Set()
let allowedWindowIds = new Set()
let isInitialized = false
let isGuardActive = false

async function getOpenGameTabs() {
  try {
    const allTabs = await chrome.tabs.query({})
    return allTabs.filter(
      (t) => t.url && (t.url.includes('localhost:5173') || t.url.includes('127.0.0.1:5173'))
    )
  } catch {
    return []
  }
}

async function isGameOpenAndPomodoroRunning() {
  try {
    // 1. First check if the game URL (localhost:5173) is even open in Chrome!
    // If the user closed the game URL, NEVER block anything!
    const gameTabs = await getOpenGameTabs()
    if (gameTabs.length === 0) {
      isGuardActive = false
      return false
    }

    // 2. Check if Pomodoro Focus is actively running on the server
    const res = await fetch('http://localhost:5173/api/focus-guard-state')
    const data = await res.json()
    const nextActive = Boolean(data && data.active)
    if (nextActive && !isGuardActive) {
      await snapshotExistingTabs()
    }
    isGuardActive = nextActive
    return isGuardActive
  } catch {
    isGuardActive = false
    return false
  }
}

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
  const active = await isGameOpenAndPomodoroRunning()
  if (!active) return

  try {
    await fetch('http://localhost:5173/api/new-tab-blocked', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    })
  } catch {}
  try {
    const gameTabs = await getOpenGameTabs()
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
  const gameTabs = await getOpenGameTabs()
  for (const gt of gameTabs) {
    if (gt.id) {
      chrome.tabs.sendMessage(gt.id, payload).catch(() => {})
    }
  }
}

// Automatically reload extension on startup/install so latest rules are always active
chrome.runtime.onInstalled.addListener(() => {
  snapshotExistingTabs()
})

if (chrome.windows && chrome.windows.onCreated) {
  chrome.windows.onCreated.addListener(async (win) => {
    const active = await isGameOpenAndPomodoroRunning()
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
      const active = await isGameOpenAndPomodoroRunning()
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

  if (msg?.type === 'LEAF_REQUEST_CHROME_TABS') {
    snapshotExistingTabs().then(() => {
      sendResponse({ ok: true, allowedCount: allowedTabIds.size })
    })
    return true
  }
})

chrome.tabs.onCreated.addListener(async (tab) => {
  const active = await isGameOpenAndPomodoroRunning()
  if (!active) {
    // Game URL is closed OR Pomodoro is stopped -> Allow opening any tab or window freely!
    if (tab.id) allowedTabIds.add(tab.id)
    if (tab.windowId) allowedWindowIds.add(tab.windowId)
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

chrome.tabs.onRemoved.addListener(async (tabId) => {
  allowedTabIds.delete(tabId)
  // If the closed tab was the game tab itself, immediately disable the guard!
  const remainingGameTabs = await getOpenGameTabs()
  if (remainingGameTabs.length === 0) {
    isGuardActive = false
    fetch('http://localhost:5173/api/focus-guard-state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: false }),
    }).catch(() => {})
  }
})
