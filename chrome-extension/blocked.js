// Check if Pomodoro Focus Session is active:
// - If stopped / not started -> DO NOT prohibit opening a new tab! Redirect to Google so user can browse freely.
// - If Pomodoro is running -> Block & close the new tab and notify the game!

async function checkAndHandleNewTab() {
  try {
    const res = await fetch('http://localhost:5173/api/focus-guard-state')
    const data = await res.json()
    if (!data || !data.active) {
      // Pomodoro is STOPPED -> Do not prohibit opening new tabs!
      window.location.replace('https://www.google.com')
      return
    }
  } catch {
    // Game server not running -> Do not prohibit!
    window.location.replace('https://www.google.com')
    return
  }

  // Pomodoro IS running -> Block this New Tab & notify game!
  try {
    await fetch('http://localhost:5173/api/new-tab-blocked', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reason: 'Blocked opening a standalone New Tab (+ / Cmd+T)',
      }),
    })
  } catch {}

  try {
    chrome.runtime.sendMessage({ type: 'LEAF_NEW_TAB_OVERRIDE_TRIGGERED' }, () => {
      window.close()
    })
  } catch {
    window.close()
  }

  if (chrome && chrome.tabs && chrome.tabs.getCurrent) {
    chrome.tabs.getCurrent((tab) => {
      if (tab && tab.id) {
        chrome.tabs.remove(tab.id).catch(() => {
          window.close()
        })
      } else {
        window.close()
      }
    })
  } else {
    window.close()
  }
}

checkAndHandleNewTab()
