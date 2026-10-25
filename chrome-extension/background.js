// Leaf Me Alone — Chrome Extension Background Service Worker
// Syncs real open Chrome tabs and tracks child tabs expanded from allowed tabs (openerTabId)

async function broadcastOpenTabsToGame() {
  const tabs = await chrome.tabs.query({ currentWindow: true })
  const formatted = tabs.map((t) => ({
    chromeTabId: t.id,
    title: t.title || t.url || 'Chrome Tab',
    url: t.url || '',
    openerTabId: t.openerTabId || null,
    active: Boolean(t.active),
  }))

  const gameTabs = tabs.filter(
    (t) => t.url && (t.url.includes('localhost:5173') || t.url.includes('127.0.0.1:5173'))
  )

  for (const gt of gameTabs) {
    if (gt.id) {
      chrome.tabs.sendMessage(gt.id, {
        type: 'LEAF_CHROME_TABS_SYNC',
        tabs: formatted,
      }).catch(() => {})
    }
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'LEAF_REQUEST_CHROME_TABS') {
    chrome.tabs.query({ currentWindow: true }).then((tabs) => {
      const formatted = tabs.map((t) => ({
        chromeTabId: t.id,
        title: t.title || t.url || 'Chrome Tab',
        url: t.url || '',
        openerTabId: t.openerTabId || null,
        active: Boolean(t.active),
      }))
      sendResponse({ ok: true, tabs: formatted })
    })
    return true
  }

  if (msg?.type === 'LEAF_ACTIVATE_CHROME_TAB' && msg.chromeTabId) {
    chrome.tabs.update(msg.chromeTabId, { active: true }).catch(() => {})
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
        chrome.tabs.sendMessage(gt.id, {
          type: 'LEAF_CHROME_TAB_CREATED',
          tab: {
            chromeTabId: tab.id,
            title: tab.title || tab.pendingUrl || tab.url || 'New Tab',
            url: tab.pendingUrl || tab.url || '',
            openerTabId: tab.openerTabId || null,
          },
        }).catch(() => {})
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

chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId).then((tab) => {
    chrome.tabs.query({}).then((allTabs) => {
      const gameTabs = allTabs.filter(
        (t) => t.url && (t.url.includes('localhost:5173') || t.url.includes('127.0.0.1:5173'))
      )
      for (const gt of gameTabs) {
        if (gt.id) {
          chrome.tabs.sendMessage(gt.id, {
            type: 'LEAF_CHROME_TAB_ACTIVATED',
            tab: {
              chromeTabId: tab.id,
              title: tab.title || tab.url || 'Chrome Tab',
              url: tab.url || '',
              openerTabId: tab.openerTabId || null,
            },
          }).catch(() => {})
        }
      }
    })
  }).catch(() => {})
})
