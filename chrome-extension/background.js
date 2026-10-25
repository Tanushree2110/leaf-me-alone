// Leaf Me Alone — Safe Focus Tab Guard (v1.6.0)
// STRICTLY GATED BY POMODORO START/STOP:
// 1. If localhost:5173 is NOT open in Chrome -> DO NOTHING (allow all tabs, windows, and apps).
// 2. If Pomodoro is STOPPED, OFF, or on BREAK (/api/focus-guard-state active === false) -> DO NOTHING!
// 3. ONLY when localhost:5173 IS open AND Pomodoro Focus is STARTED (active === true):
//    - Blocks standalone New Tabs (+ / Cmd+T) and New Windows (Cmd+N)
//    - Logs a violation if you drift away from Chrome to another app
//    - Allows switching/closing existing tabs and opening links clicked inside existing tabs.

let recentLinkClicks = [] // { tabId, url, timestamp }
let allowedTabIds = new Set()
let allowedWindowIds = new Set()
let wasGuardActive = false

async function getGameAndGuardState() {
  try {
    const allTabs = await chrome.tabs.query({})
    const gameTab = allTabs.find((t) => {
      const u = t.url || t.pendingUrl || ''
      return u.includes('localhost:5173') || u.includes('127.0.0.1:5173')
    })

    // 1. If localhost:5173 is NOT open in Chrome, NEVER block anything!
    if (!gameTab) {
      wasGuardActive = false
      return { active: false, gameTab: null, allTabs }
    }

    // 2. Check live Pomodoro state on localhost:5173 (with cache: 'no-store' so it is never stale!)
    const res = await fetch('http://localhost:5173/api/focus-guard-state', {
      cache: 'no-store',
    })
    const data = await res.json()
    const isRunning = Boolean(data && data.active)

    if (isRunning && !wasGuardActive) {
      // Pomodoro just started -> Snapshot all currently open tabs & windows as allowed!
      allowedTabIds = new Set(allTabs.map((t) => t.id).filter(Boolean))
      allowedWindowIds = new Set(allTabs.map((t) => t.windowId).filter(Boolean))
    }
    wasGuardActive = isRunning

    return { active: isRunning, gameTab, allTabs }
  } catch {
    wasGuardActive = false
    return { active: false, gameTab: null, allTabs: [] }
  }
}

async function notifyViolationToGame(gameTab, reason, refocusGameTab) {
  try {
    await fetch('http://localhost:5173/api/new-tab-blocked', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
      cache: 'no-store',
    })
  } catch {}

  if (gameTab && gameTab.id) {
    try {
      if (refocusGameTab) {
        await chrome.tabs.update(gameTab.id, { active: true })
      }
      await chrome.tabs.sendMessage(gameTab.id, {
        type: 'LEAF_CHROME_UNAUTHORIZED_NEW_TAB_BLOCKED',
        reason,
      })
    } catch {}
  }
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
    chrome.tabs.query({}).then((allTabs) => {
      allTabs.forEach((t) => {
        if (t.id) allowedTabIds.add(t.id)
        if (t.windowId) allowedWindowIds.add(t.windowId)
      })
      sendResponse({ ok: true, allowedCount: allowedTabIds.size })
    })
    return true
  }
})

// Detect drifting away from Chrome to another desktop app ONLY when Pomodoro is started!
let lastChromeBlurAlertMs = 0
if (chrome.windows && chrome.windows.onFocusChanged) {
  chrome.windows.onFocusChanged.addListener(async (windowId) => {
    if (windowId === chrome.windows.WINDOW_ID_NONE) {
      const { active, gameTab } = await getGameAndGuardState()
      // When Pomodoro is Stopped or game is closed -> Do nothing! Allow switching apps freely!
      if (!active || !gameTab) return

      const now = Date.now()
      if (now - lastChromeBlurAlertMs < 2000) return
      lastChromeBlurAlertMs = now
      await notifyViolationToGame(
        gameTab,
        'Moved off from Google Chrome to another app!',
        false
      )
    }
  })
}

chrome.tabs.onCreated.addListener(async (tab) => {
  const { active, gameTab, allTabs } = await getGameAndGuardState()

  // When Pomodoro is Stopped or game is closed -> Allow opening any tab or window freely!
  if (!active || !gameTab) {
    if (tab.id) allowedTabIds.add(tab.id)
    if (tab.windowId) allowedWindowIds.add(tab.windowId)
    return
  }

  // Never close if there is only 1 tab open in Chrome
  if (allTabs.length <= 1) {
    if (tab.id) allowedTabIds.add(tab.id)
    return
  }

  const now = Date.now()
  const targetUrl = tab.pendingUrl || tab.url || ''

  // Did the user open a brand-new second Chrome window while Pomodoro is running?
  if (tab.windowId && gameTab.windowId && tab.windowId !== gameTab.windowId) {
    if (tab.id) {
      try {
        await chrome.tabs.remove(tab.id)
      } catch {}
    }
    await notifyViolationToGame(
      gameTab,
      'Blocked opening a New Browser Window (Cmd+N)!',
      true
    )
    return
  }

  const isManualBlankNewTab =
    !targetUrl ||
    targetUrl.startsWith('chrome://newtab') ||
    targetUrl.startsWith('edge://newtab') ||
    targetUrl === 'about:blank'

  const matchedLinkClick = recentLinkClicks.some((c) => now - c.timestamp < 8000)

  if (!isManualBlankNewTab && matchedLinkClick) {
    // ALLOWED: Opened by clicking a link on an existing tab!
    if (tab.id) allowedTabIds.add(tab.id)
  } else {
    // BLOCKED: Standalone New Tab (+ / Cmd+T) while Pomodoro is running!
    if (tab.id && tab.id !== gameTab.id) {
      try {
        await chrome.tabs.remove(tab.id)
      } catch {}
    }
    await notifyViolationToGame(
      gameTab,
      'Blocked opening a standalone New Tab (only links from existing tabs allowed)!',
      true
    )
  }
})

chrome.tabs.onRemoved.addListener((tabId) => {
  allowedTabIds.delete(tabId)
})
