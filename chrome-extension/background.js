// Leaf Me Alone — Safe Focus Tab Guard (v1.5.0)
// SAFETY GUARANTEES:
// 1. NEVER closes any tab or window unless http://localhost:5173 is currently open in Chrome!
// 2. NEVER closes the last remaining tab in a window (impossible to lock you out of Chrome!).
// 3. NEVER blocks anything when Pomodoro is Stopped or Off!
// 4. When localhost:5173 IS open AND Pomodoro is Started:
//    - Blocks standalone New Tabs (+ / Cmd+T) and New Windows (Cmd+N)
//    - Allows switching/closing existing tabs and opening links clicked inside existing tabs.

let recentLinkClicks = [] // { tabId, url, timestamp }
let allowedTabIds = new Set()
let wasGuardActive = false

async function getGameAndGuardState() {
  try {
    const allTabs = await chrome.tabs.query({})
    const gameTab = allTabs.find((t) => {
      const u = t.url || t.pendingUrl || ''
      return u.includes('localhost:5173') || u.includes('127.0.0.1:5173')
    })

    // SAFETY GUARANTEE #1: If localhost:5173 is NOT open in Chrome, NEVER block anything!
    if (!gameTab) {
      wasGuardActive = false
      return { active: false, gameTab: null, allTabs }
    }

    // Check if Pomodoro Focus is currently running on localhost:5173
    const res = await fetch('http://localhost:5173/api/focus-guard-state')
    const data = await res.json()
    const isRunning = Boolean(data && data.active)

    if (isRunning && !wasGuardActive) {
      // Pomodoro just started -> Snapshot all currently open tabs as allowed!
      allowedTabIds = new Set(allTabs.map((t) => t.id).filter(Boolean))
    }
    wasGuardActive = isRunning

    return { active: isRunning, gameTab, allTabs }
  } catch {
    wasGuardActive = false
    return { active: false, gameTab: null, allTabs: [] }
  }
}

async function notifyViolationToGame(gameTab, reason) {
  try {
    await fetch('http://localhost:5173/api/new-tab-blocked', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    })
  } catch {}

  if (gameTab && gameTab.id) {
    try {
      if (gameTab.windowId) {
        await chrome.windows.update(gameTab.windowId, { focused: true })
      }
      await chrome.tabs.update(gameTab.id, { active: true })
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
      })
      sendResponse({ ok: true, allowedCount: allowedTabIds.size })
    })
    return true
  }
})

chrome.tabs.onCreated.addListener(async (tab) => {
  const { active, gameTab, allTabs } = await getGameAndGuardState()

  // If game is closed OR Pomodoro is stopped -> Allow everything freely!
  if (!active || !gameTab) {
    if (tab.id) allowedTabIds.add(tab.id)
    return
  }

  // SAFETY GUARANTEE #2: Never close if there is only 1 tab open!
  if (allTabs.length <= 1) {
    if (tab.id) allowedTabIds.add(tab.id)
    return
  }

  const now = Date.now()
  const targetUrl = tab.pendingUrl || tab.url || ''

  // Did the user open a brand-new second Chrome window while the game window was already open?
  if (tab.windowId && gameTab.windowId && tab.windowId !== gameTab.windowId) {
    if (tab.id) {
      try {
        await chrome.tabs.remove(tab.id)
      } catch {}
    }
    await notifyViolationToGame(gameTab, 'Blocked opening a New Browser Window (Cmd+N)!')
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
    // BLOCKED: Standalone New Tab (+ / Cmd+T)! Close ONLY this new tab and switch back to the game tab!
    if (tab.id && tab.id !== gameTab.id) {
      try {
        await chrome.tabs.remove(tab.id)
      } catch {}
    }
    await notifyViolationToGame(
      gameTab,
      'Blocked opening a standalone New Tab (only links from existing tabs allowed)!'
    )
  }
})

chrome.tabs.onRemoved.addListener((tabId) => {
  allowedTabIds.delete(tabId)
})
