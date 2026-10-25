// Leaf Me Alone — Strict Tab Guard Background Service Worker
// - Records existing open tabs
// - BLOCKS & CLOSES any manually opened New Tab (Cmd+T / + button / chrome://newtab)
// - ONLY allows new tabs opened by clicking a link (<a href>) on an existing allowed tab!

let recentLinkClicks = [] // { tabId, url, timestamp }
let allowedTabIds = new Set()
let isInitialized = false

async function initAllowedExistingTabs() {
  const tabs = await chrome.tabs.query({})
  allowedTabIds = new Set(tabs.map((t) => t.id).filter(Boolean))
  isInitialized = true
}

initAllowedExistingTabs()

async function getAllOpenChromeTabs() {
  const tabs = await chrome.tabs.query({})
  if (!isInitialized) {
    tabs.forEach((t) => {
      if (t.id) allowedTabIds.add(t.id)
    })
    isInitialized = true
  }
  return tabs.map((t) => ({
    chromeTabId: t.id,
    title: t.title || t.pendingUrl || t.url || 'Chrome Tab',
    url: t.url || t.pendingUrl || '',
    openerTabId: t.openerTabId || null,
    active: Boolean(t.active),
  }))
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

async function broadcastOpenTabsToGame() {
  const formatted = await getAllOpenChromeTabs()
  await sendToGameTabs({
    type: 'LEAF_CHROME_TABS_SYNC',
    tabs: formatted,
  })
}

chrome.runtime.onInstalled.addListener(async () => {
  await initAllowedExistingTabs()
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
  broadcastOpenTabsToGame()
})

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'LEAF_LINK_CLICKED_ON_TAB') {
    const senderTabId = sender?.tab?.id
    if (senderTabId && allowedTabIds.has(senderTabId)) {
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
    getAllOpenChromeTabs().then((formatted) => {
      sendResponse({ ok: true, tabs: formatted })
    })
    return true
  }

  if (msg?.type === 'LEAF_RESET_INITIAL_TABS') {
    initAllowedExistingTabs().then(() => {
      broadcastOpenTabsToGame()
      sendResponse({ ok: true })
    })
    return true
  }

  if (msg?.type === 'LEAF_ACTIVATE_CHROME_TAB' && msg.chromeTabId) {
    chrome.tabs.update(Number(msg.chromeTabId), { active: true }).catch(() => {})
    sendResponse({ ok: true })
    return true
  }
})

chrome.tabs.onCreated.addListener(async (tab) => {
  const now = Date.now()
  const targetUrl = tab.pendingUrl || tab.url || ''

  // Check if this new tab is a blank manual New Tab (Cmd+T or clicking '+' in Chrome)
  const isManualBlankNewTab =
    !targetUrl ||
    targetUrl.startsWith('chrome://newtab') ||
    targetUrl.startsWith('edge://newtab') ||
    targetUrl === 'about:blank'

  // Check if opened by clicking a link on an existing allowed tab!
  const hasAllowedOpener = Boolean(tab.openerTabId && allowedTabIds.has(tab.openerTabId))
  const matchedLinkClick = recentLinkClicks.some(
    (c) =>
      now - c.timestamp < 8000 &&
      allowedTabIds.has(c.tabId) &&
      (!targetUrl || c.url === targetUrl || targetUrl.startsWith('http'))
  )

  if (!isManualBlankNewTab && (hasAllowedOpener || matchedLinkClick)) {
    // ALLOWED: Opened by clicking a link on an existing allowed tab!
    if (tab.id) {
      allowedTabIds.add(tab.id)
    }
    await sendToGameTabs({
      type: 'LEAF_CHROME_LINK_TAB_ALLOWED',
      tab: {
        chromeTabId: tab.id,
        title: tab.title || targetUrl || 'Linked Sub-Tab',
        url: targetUrl,
        openerTabId: tab.openerTabId || null,
      },
    })
    broadcastOpenTabsToGame()
  } else {
    // BLOCKED! User tried to open a brand new tab (Cmd+T / + button)!
    // 1. Immediately close the unauthorized new tab so they CANNOT open new tabs no matter what!
    if (tab.id) {
      try {
        await chrome.tabs.remove(tab.id)
      } catch {}
    }

    // 2. Focus back on the game tab or previous allowed tab & trigger RED violation!
    await sendToGameTabs({
      type: 'LEAF_CHROME_UNAUTHORIZED_NEW_TAB_BLOCKED',
      attemptedUrl: targetUrl || 'New Tab (Cmd+T)',
    })
  }
})

chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
  if (changeInfo.title || changeInfo.url || changeInfo.status === 'complete') {
    broadcastOpenTabsToGame()
  }
})

chrome.tabs.onRemoved.addListener((tabId) => {
  allowedTabIds.delete(tabId)
  broadcastOpenTabsToGame()
})
