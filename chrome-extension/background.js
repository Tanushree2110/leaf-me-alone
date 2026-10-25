// Leaf Me Alone — Strict New-Tab Blocker Background Service Worker
// Rule:
// 1. All existing open tabs when the game opens are automatically allowed.
// 2. Switching between existing tabs or closing existing tabs is 100% allowed.
// 3. Opening a new tab by clicking a link from an existing tab is automatically allowed.
// 4. Opening a standalone new tab (Cmd+T / '+' button) is BLOCKED & CLOSED and logged as a violation.

let recentLinkClicks = [] // { tabId, url, timestamp }
let allowedTabIds = new Set()
let isInitialized = false

async function snapshotExistingTabs() {
  const tabs = await chrome.tabs.query({})
  allowedTabIds = new Set(tabs.map((t) => t.id).filter(Boolean))
  isInitialized = true
  await sendToGameTabs({
    type: 'LEAF_CHROME_GUARD_STATUS',
    allowedCount: allowedTabIds.size,
  })
}

snapshotExistingTabs()

async function notifyBlockedNewTab(reason) {
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
        chrome.tabs.update(gt.id, { active: true }).catch(() => {})
        chrome.tabs.sendMessage(gt.id, {
          type: 'LEAF_CHROME_UNAUTHORIZED_NEW_TAB_BLOCKED',
          reason,
        }).catch(() => {})
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
    if (sender?.tab?.id) {
      chrome.tabs.remove(sender.tab.id).catch(() => {})
    }
    notifyBlockedNewTab('Tried opening a standalone New Tab (+ / Cmd+T)')
    sendResponse({ ok: true })
    return true
  }

  if (msg?.type === 'LEAF_REQUEST_CHROME_TABS') {
    if (!isInitialized) {
      snapshotExistingTabs().then(() => {
        sendResponse({ ok: true, allowedCount: allowedTabIds.size })
      })
    } else {
      sendToGameTabs({
        type: 'LEAF_CHROME_GUARD_STATUS',
        allowedCount: allowedTabIds.size,
      })
      sendResponse({ ok: true, allowedCount: allowedTabIds.size })
    }
    return true
  }
})

chrome.tabs.onCreated.addListener(async (tab) => {
  const now = Date.now()
  const targetUrl = tab.pendingUrl || tab.url || ''

  const isManualBlankNewTab =
    !targetUrl ||
    targetUrl.startsWith('chrome://newtab') ||
    targetUrl.startsWith('chrome-extension://') ||
    targetUrl.startsWith('edge://newtab') ||
    targetUrl === 'about:blank'

  // Allowed if opened from an existing tab (openerTabId) OR via a link click on an existing tab
  const hasAllowedOpener = Boolean(tab.openerTabId && allowedTabIds.has(tab.openerTabId))
  const matchedLinkClick = recentLinkClicks.some((c) => now - c.timestamp < 8000)

  if (!isManualBlankNewTab && (hasAllowedOpener || matchedLinkClick)) {
    // ALLOWED: Opened from an existing tab!
    if (tab.id) {
      allowedTabIds.add(tab.id)
    }
    await sendToGameTabs({
      type: 'LEAF_CHROME_GUARD_STATUS',
      allowedCount: allowedTabIds.size,
    })
  } else {
    // BLOCKED: Standalone New Tab! Close it immediately and notify the game!
    if (tab.id) {
      try {
        await chrome.tabs.remove(tab.id)
      } catch {}
    }
    await notifyBlockedNewTab(
      'Blocked opening a standalone New Tab (only links from existing tabs allowed)'
    )
  }
})

// Closing existing tabs is 100% allowed — just remove from set quietly
chrome.tabs.onRemoved.addListener((tabId) => {
  allowedTabIds.delete(tabId)
  sendToGameTabs({
    type: 'LEAF_CHROME_GUARD_STATUS',
    allowedCount: allowedTabIds.size,
  })
})
