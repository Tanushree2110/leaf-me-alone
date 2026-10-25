import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

let globalAudioMuted = false
let isFocusGuardActive = false
let blockedNewTabEventCounter = 0
let lastBlockedReason = 'Blocked opening a standalone New Tab (+ / Cmd+T)'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'leaf-local-bridge',
      configureServer(server) {
        server.middlewares.use('/api/audio-state', (req, res) => {
          res.setHeader('Content-Type', 'application/json')
          if (req.method === 'POST') {
            let body = ''
            req.on('data', (chunk) => {
              body += chunk
            })
            req.on('end', () => {
              try {
                const parsed = JSON.parse(body || '{}')
                if (typeof parsed.muted === 'boolean') {
                  globalAudioMuted = parsed.muted
                  server.ws.send({
                    type: 'custom',
                    event: 'leaf-audio-mute',
                    data: { muted: globalAudioMuted },
                  })
                }
              } catch {}
              res.end(JSON.stringify({ muted: globalAudioMuted }))
            })
            return
          }
          res.end(JSON.stringify({ muted: globalAudioMuted }))
        })

        // Tracks whether Pomodoro Focus is currently running (active=true) or Stopped/Break (active=false)
        server.middlewares.use('/api/focus-guard-state', (req, res) => {
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
          res.setHeader('Content-Type', 'application/json')

          if (req.method === 'OPTIONS') {
            res.statusCode = 200
            res.end()
            return
          }

          if (req.method === 'POST') {
            let body = ''
            req.on('data', (chunk) => {
              body += chunk
            })
            req.on('end', () => {
              try {
                const parsed = JSON.parse(body || '{}')
                if (typeof parsed.active === 'boolean') {
                  isFocusGuardActive = parsed.active
                }
              } catch {}
              res.end(JSON.stringify({ ok: true, active: isFocusGuardActive }))
            })
            return
          }

          res.end(JSON.stringify({ ok: true, active: isFocusGuardActive }))
        })

        // Direct bridge so the Chrome Extension background worker or blocked.html can notify the game ONLY when guard is active!
        server.middlewares.use('/api/new-tab-blocked', (req, res) => {
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
          res.setHeader('Content-Type', 'application/json')

          if (req.method === 'OPTIONS') {
            res.statusCode = 200
            res.end()
            return
          }

          if (req.method === 'POST') {
            let body = ''
            req.on('data', (chunk) => {
              body += chunk
            })
            req.on('end', () => {
              if (!isFocusGuardActive) {
                res.end(
                  JSON.stringify({
                    ok: true,
                    active: false,
                    count: blockedNewTabEventCounter,
                  })
                )
                return
              }
              try {
                const parsed = JSON.parse(body || '{}')
                if (parsed.reason) lastBlockedReason = parsed.reason
              } catch {}
              blockedNewTabEventCounter += 1
              server.ws.send({
                type: 'custom',
                event: 'leaf-new-tab-blocked',
                data: {
                  count: blockedNewTabEventCounter,
                  reason: lastBlockedReason,
                },
              })
              res.end(
                JSON.stringify({
                  ok: true,
                  active: true,
                  count: blockedNewTabEventCounter,
                })
              )
            })
            return
          }

          res.end(
            JSON.stringify({
              active: isFocusGuardActive,
              count: blockedNewTabEventCounter,
              reason: lastBlockedReason,
            })
          )
        })
      },
    },
  ],
})
