// Leaf Me Alone — Focus Guard (v1.7.0)
// Acts ONLY while the game tab (localhost:5173) is open AND a Pomodoro focus session is running.
// Stopped, on break, or game closed -> every tab, window and app is allowed.
//
// While focus is running:
//  - New tabs (+ / Cmd+T) and new windows (Cmd+N) are closed and reported.
//  - Tabs opened by clicking a link inside an existing tab are allowed.
//  - Leaving the game window (another app or another Chrome window) is reported and Chrome
//    pulls the game window back to the front until you return.

const SERVER = 'http://localhost:5173'
const GUARD_CACHE_MS = 1000
const DRIFT_CONFIRM_MS = 350
const DRIFT_RECHECK_MS = 1500
const LINK_CLICK_WINDOW_MS = 8000

let guardCache = { at: 0, active: false }
let recentLinkClicks = [] // { tabId, at }
let drifting = false
let driftTimer = null

function isGameUrl(u) {
  return (
    typeof u === 'string' &&
    (u.startsWith('http://localhost:5173') || u.startsWith('http://127.0.0.1:5173'))
  )
}

function isBlankNewTabUrl(u) {
  return (
    !u ||
    u.startsWith('chrome://newtab') ||
    u.startsWith('chrome://new-tab-page') ||
    u.startsWith('chrome-search://') ||
    u.startsWith('edge://newtab')
  )
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function maybeSelfUpdate(diskVersion) {
  if (!diskVersion || diskVersion === chrome.runtime.getManifest().version) return
  try {
    const { leafReloadAttemptFor } = await chrome.storage.local.get('leafReloadAttemptFor')
    if (leafReloadAttemptFor === diskVersion) return
    await chrome.storage.local.set({ leafReloadAttemptFor: diskVersion })
    chrome.runtime.reload()
  } catch {}
}

async function fetchGuard(force) {
  const now = Date.now()
  if (!force && now - guardCache.at < GUARD_CACHE_MS) return guardCache
  try {
    const res = await fetch(SERVER + '/api/focus-guard-state', { cache: 'no-store' })
    const data = await res.json()
    guardCache = { at: now, active: Boolean(data && data.active) }
    maybeSelfUpdate(data && data.extensionVersion)
  } catch {
    guardCache = { at: now, active: false }
  }
  return guardCache
}

async function getState(forceGuard) {
  let tabs = []
  try {
    tabs = await chrome.tabs.query({})
  } catch {}
  const gameTabs = tabs.filter((t) => isGameUrl(t.url || t.pendingUrl))
  const gameTab = gameTabs.find((t) => t.active) || gameTabs[0] || null
  if (!gameTab) return { active: false, gameTab: null, tabs }
  const guard = await fetchGuard(forceGuard)
  return { active: guard.active, gameTab, tabs }
}

async function notify(path, body) {
  try {
    await fetch(SERVER + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    })
  } catch {}
}

async function pullBackToGameWindow(gameTab) {
  try {
    await chrome.windows.update(gameTab.windowId, { focused: true })
  } catch {}
}

async function closeTab(tabId) {
  try {
    await chrome.tabs.remove(tabId)
  } catch {}
}

// ---------- Drift: leaving the game window ----------
function scheduleDriftCheck(ms) {
  if (driftTimer) clearTimeout(driftTimer)
  driftTimer = setTimeout(checkDrift, ms)
}

async function checkDrift() {
  driftTimer = null
  const { active, gameTab } = await getState(false)
  if (!active || !gameTab) {
    if (drifting) {
      drifting = false
      await notify('/api/drift-state', { drifting: false, source: 'extension' })
    }
    return
  }

  let focusedWindowId = chrome.windows.WINDOW_ID_NONE
  try {
    const win = await chrome.windows.getLastFocused({})
    if (win && win.focused) focusedWindowId = win.id
  } catch {}

  if (focusedWindowId !== gameTab.windowId) {
    const reason =
      focusedWindowId === chrome.windows.WINDOW_ID_NONE
        ? 'You left Chrome for another app'
        : 'You switched to another Chrome window'
    drifting = true
    await pullBackToGameWindow(gameTab)
    await notify('/api/drift-state', { drifting: true, reason, source: 'extension' })
    scheduleDriftCheck(DRIFT_RECHECK_MS)
  } else if (drifting) {
    drifting = false
    await notify('/api/drift-state', { drifting: false, source: 'extension' })
  }
}

chrome.windows.onFocusChanged.addListener(() => scheduleDriftCheck(DRIFT_CONFIRM_MS))

// ---------- New tabs / windows ----------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'LEAF_LINK_CLICKED_ON_TAB' && sender && sender.tab && sender.tab.id) {
    const now = Date.now()
    recentLinkClicks = recentLinkClicks.filter((c) => now - c.at < LINK_CLICK_WINDOW_MS)
    recentLinkClicks.push({ tabId: sender.tab.id, at: now })
  }
  sendResponse({ ok: true })
})

chrome.tabs.onCreated.addListener(async (tab) => {
  const { active, gameTab, tabs } = await getState(true)
  if (!active || !gameTab || !tab.id || tab.id === gameTab.id) return
  // Never close the last remaining tab in Chrome.
  if (tabs.length <= 1) return

  if (tab.windowId !== gameTab.windowId) {
    await closeTab(tab.id)
    await pullBackToGameWindow(gameTab)
    await notify('/api/new-tab-blocked', { reason: 'Opened a new window' })
    return
  }

  const now = Date.now()
  recentLinkClicks = recentLinkClicks.filter((c) => now - c.at < LINK_CLICK_WINDOW_MS)
  const fromLink = tab.openerTabId !== undefined || recentLinkClicks.length > 0

  let url = tab.pendingUrl || tab.url || ''
  if (!url && fromLink) {
    // Link-opened tabs can be created before their URL is known.
    await delay(300)
    try {
      const fresh = await chrome.tabs.get(tab.id)
      url = fresh.pendingUrl || fresh.url || ''
    } catch {
      return
    }
    if (!url || url === 'about:blank') return
  }

  if (fromLink && !isBlankNewTabUrl(url)) return
  if (fromLink && url === 'about:blank') return

  await closeTab(tab.id)
  try {
    await chrome.tabs.update(gameTab.id, { active: true })
  } catch {}
  await notify('/api/new-tab-blocked', { reason: 'Opened a new tab' })
})

// ---------- Keep scripts alive in tabs that were open before install/reload ----------
async function injectIntoExistingTabs() {
  let tabs = []
  try {
    tabs = await chrome.tabs.query({})
  } catch {}
  for (const t of tabs) {
    const u = t.url || ''
    if (!t.id || !/^https?:/.test(u)) continue
    try {
      await chrome.scripting.executeScript({ target: { tabId: t.id }, files: ['link-tracker.js'] })
    } catch {}
    if (isGameUrl(u)) {
      try {
        await chrome.scripting.executeScript({ target: { tabId: t.id }, files: ['content.js'] })
      } catch {}
    }
  }
}

chrome.runtime.onInstalled.addListener(() => {
  injectIntoExistingTabs()
})

chrome.runtime.onStartup.addListener(() => {
  fetchGuard(true)
})
