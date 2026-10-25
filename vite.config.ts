import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

let globalAudioMuted = false

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'audio-sync-bridge',
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
                  // Broadcast via Vite WS to all connected clients (Chrome & Cursor webview) immediately!
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
      },
    },
  ],
})
