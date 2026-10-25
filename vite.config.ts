import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execFile } from 'node:child_process'

const JXA_LIST_CHROME_TABS = `
(function() {
  try {
    var chrome = Application('Google Chrome');
    if (!chrome.running()) return JSON.stringify({ ok: false, tabs: [] });
    var result = [];
    var wins = chrome.windows();
    for (var w = 0; w < wins.length; w++) {
      var win = wins[w];
      var activeIdx = win.activeTabIndex();
      var tabs = win.tabs();
      for (var t = 0; t < tabs.length; t++) {
        var tab = tabs[t];
        result.push({
          chromeTabId: String(tab.id()),
          windowIndex: w + 1,
          tabIndex: t + 1,
          title: tab.title() || tab.url() || 'Chrome Tab',
          url: tab.url() || '',
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
                  execFile('osascript', ['-l', 'JavaScript', '-e', activateScript], () => {
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
            { timeout: 3000 },
            (err, stdout) => {
              if (err || !stdout) {
                res.end(JSON.stringify({ ok: false, tabs: [] }))
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
