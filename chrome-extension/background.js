// Leaf Me Alone — Chrome Extension Background Service Worker
// Automatically reads all open Chrome tabs and allows child tabs opened from any initial allowed tab

async function getAllOpenChromeTabs() {
  const tabs = await chrome.tabs.query({})
  return tabs.map((t) => ({
    chromeTabId: t.id,
    title: t.title || t.pendingUrl || t.url || 'Chrome Tab',
    url: t.url || t.pendingUrl || '',
    openerTabId: t.openerTabId || null,
    active: Boolean(t.active),
  }))
}

async function broadcastOpenTabsToGame() {
  const formatted = await getAllOpenChromeTabs()
  const allTabs = await chrome.tabs.query({})
  const gameTabs = allTabs.filter(
    (t) => t.url && (t.url.includes('localhost:5173') || t.url.includes('127.0.0.1:5173'))
  )

  for (const gt of gameTabs) {
    if (gt.id) {
      chrome.tabs
        .sendMessage(gt.id, {
          type: 'LEAF_CHROME_TABS_SYNC',
          tabs: formatted,
        })
        .catch(() => {})
    }
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  const allTabs = await chrome.tabs.query({})
  const gameTabs = allTabs.filter(
    (t) => t.url && (t.url.includes('localhost:5173') || t.url.includes('127.0.0.1:5173'))
  )
  for (const gt of gameTabs) {
    if (gt.id) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: gt.id },
          files: ['content.js'],
        })
      } catch {}
    }
  }
  broadcastOpenTabsToGame()
})

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'LEAF_REQUEST_CHROME_TABS') {
    getAllOpenChromeTabs().then((formatted) => {
      sendResponse({ ok: true, tabs: formatted })
    })
    return true
  }

  if (msg?.type === 'LEAF_ACTIVATE_CHROME_TAB' && msg.chromeTabId) {
    chrome.tabs.update(Number(msg.chromeTabId), { active: true }).catch(() => {})
    sendResponse({ ok: true })
    return true
  }
})

chrome.tabs.onCreated.addListener((tab) => {
  broadcastOpenTabsToGame()
  chrome.tabs.query({}).then((allTabs) => {
    const gameTabs = allTabs.filter(
      (t) => t.url && (t.url.includes('localhost:5173') || t.url.includes('127.0.0.1:5173'))
    )
    for (const gt of gameTabs) {
      if (gt.id) {
        chrome.tabs
          .sendMessage(gt.id, {
            type: 'LEAF_CHROME_TAB_CREATED',
            tab: {
              chromeTabId: tab.id,
              title: tab.title || tab.pendingUrl || tab.url || 'New Tab',
              url: tab.pendingUrl || tab.url || '',
              openerTabId: tab.openerTabId || null,
            },
          })
          .catch(() => {})
      }
    }
  })
})

chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
  if (changeInfo.title || changeInfo.url || changeInfo.status === 'complete') {
    broadcastOpenTabsToGame()
  }
})

chrome.tabs.onRemoved.addListener(() => {
  broadcastOpenTabsToGame()
})

chrome.tabs.onActivated.addListener(() => {
  broadcastOpenTabsToGame()
})
