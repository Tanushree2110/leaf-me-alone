// Leaf Me Alone — Strict Tab Guard Background Service Worker
// - Records existing open tabs at start
// - BLOCKS & CLOSES any manually opened New Tab (Cmd+T / + button / chrome://newtab)
// - ONLY allows new tabs opened by clicking an actual <a href> link on an existing allowed tab!

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

async function injectIntoExistingTabs() {
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
}

chrome.runtime.onInstalled.addListener(injectIntoExistingTabs)
chrome.runtime.onStartup.addListener(injectIntoExistingTabs)

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'LEAF_LINK_CLICKED_ON_TAB') {
    const senderTabId = sender?.tab?.id
    if (senderTabId && allowedTabIds.has(senderTabId)) {
      const now = Date.now()
      recentLinkClicks = recentLinkClicks.filter((c) => now - c.timestamp < 5000)
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
    sendToGameTabs({
      type: 'LEAF_CHROME_UNAUTHORIZED_NEW_TAB_BLOCKED',
      attemptedUrl: 'New Tab (+ / Cmd+T)',
    })
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

  // Always block chrome://newtab, about:blank, or empty new tabs
  const isManualBlankNewTab =
    !targetUrl ||
    targetUrl.startsWith('chrome://newtab') ||
    targetUrl.startsWith('chrome-extension://') ||
    targetUrl.startsWith('edge://newtab') ||
    targetUrl === 'about:blank'

  // STRICT CHECK: Must have been triggered by an actual <a href> link click on an existing allowed tab!
  const matchedLinkClick = recentLinkClicks.some(
    (c) => now - c.timestamp < 5000 && allowedTabIds.has(c.tabId)
  )

  if (!isManualBlankNewTab && matchedLinkClick) {
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
    // IMMEDIATELY CLOSE THE NEW TAB!
    if (tab.id) {
      try {
        await chrome.tabs.remove(tab.id)
      } catch {}
    }
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
