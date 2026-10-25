import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execFile } from 'node:child_process'

const JXA_LIST_CHROME_TABS = `
(function() {
  try {
    var chrome = Application('Google Chrome');
    if (!chrome.running()) return JSON.stringify({ ok: false, tabs: [] });
    var wins = chrome.windows;
    var winCount = wins.length;
    var result = [];
    for (var w = 0; w < winCount; w++) {
      var win = wins[w];
      var activeIdx = win.activeTabIndex();
      var ids = win.tabs.id();
      var titles = win.tabs.title();
      var urls = win.tabs.url();
      for (var t = 0; t < ids.length; t++) {
        result.push({
          chromeTabId: String(ids[t]),
          windowIndex: w + 1,
          tabIndex: t + 1,
          title: titles[t] || urls[t] || 'Chrome Tab',
          url: urls[t] || '',
          active: (w === 0 && (t + 1) === activeIdx)
        });
      }
    }
    return JSON.stringify({ ok: true, tabs: result });
  } catch (e) {
    return JSON.stringify({ ok: false, error: String(e), tabs: [] });
  }
})();
`

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'chrome-tabs-bridge',
      configureServer(server) {
        server.middlewares.use('/api/chrome-tabs', (req, res) => {
          res.setHeader('Content-Type', 'application/json')

          if (req.method === 'POST') {
            let body = ''
            req.on('data', (chunk) => {
              body += chunk
            })
            req.on('end', () => {
              try {
                const { windowIndex, tabIndex } = JSON.parse(body || '{}')
                if (windowIndex && tabIndex) {
                  const activateScript = `
                    var chrome = Application('Google Chrome');
                    chrome.windows[${Number(windowIndex) - 1}].activeTabIndex = ${Number(tabIndex)};
                    chrome.activate();
                  `
                  execFile('osascript', ['-l', 'JavaScript', '-e', activateScript], { timeout: 6000 }, () => {
                    res.end(JSON.stringify({ ok: true }))
                  })
                  return
                }
              } catch {}
              res.end(JSON.stringify({ ok: false }))
            })
            return
          }

          execFile(
            'osascript',
            ['-l', 'JavaScript', '-e', JXA_LIST_CHROME_TABS],
            { timeout: 10000 },
            (err, stdout, stderr) => {
              if (err || !stdout) {
                res.end(
                  JSON.stringify({
                    ok: false,
                    error: err ? err.message : stderr || 'no output',
                    tabs: [],
                  })
                )
                return
              }
              res.end(stdout.trim())
            }
          )
        })
      },
    },
  ],
})
