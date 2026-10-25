import { defineConfig, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// A game tab counts as "focus running" only while it keeps sending heartbeats. Hidden tabs can be
// throttled to ~1 timer per minute, so the TTL has to be comfortably longer than that.
const GUARD_CLIENT_TTL_MS = 150_000
const PULL_BACK_MIN_INTERVAL_MS = 1500
const PULL_BACK_ENABLED = process.env.LEAF_NO_PULLBACK !== '1'
const EXTENSION_MANIFEST_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'chrome-extension/manifest.json'
)

let globalAudioMuted = false
const guardClients = new Map<string, { seq: number; active: boolean; at: number }>()
let lastPullBackAt = 0

function updateGuardClient(clientId: string, active: boolean, seq: number | null) {
  const existing = guardClients.get(clientId)
  if (existing && seq !== null && seq <= existing.seq) return
  guardClients.set(clientId, {
    seq: seq ?? (existing ? existing.seq + 1 : 0),
    active,
    at: Date.now(),
  })
}

function isGuardActive(): boolean {
  const now = Date.now()
  let active = false
  for (const [id, client] of guardClients) {
    if (now - client.at > GUARD_CLIENT_TTL_MS) guardClients.delete(id)
    else if (client.active) active = true
  }
  return active
}

function readExtensionVersion(): string | null {
  try {
    return JSON.parse(readFileSync(EXTENSION_MANIFEST_PATH, 'utf8')).version ?? null
  } catch {
    return null
  }
}

function bringChromeToFront() {
  if (!PULL_BACK_ENABLED || process.platform !== 'darwin') return
  const now = Date.now()
  if (now - lastPullBackAt < PULL_BACK_MIN_INTERVAL_MS) return
  lastPullBackAt = now
  execFile('open', ['-b', 'com.google.Chrome'], () => {})
}

function readJsonBody(req: any): Promise<any> {
  return new Promise((resolve) => {
    let body = ''
    req.on('data', (chunk: unknown) => {
      body += chunk
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'))
      } catch {
        resolve({})
      }
    })
    req.on('error', () => resolve({}))
  })
}

function sendJson(res: any, data: unknown) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(data))
}

function leafBridge(server: ViteDevServer) {
  const handleOptions = (req: any, res: any) => {
    if (req.method !== 'OPTIONS') return false
    res.statusCode = 200
    sendJson(res, {})
    return true
  }

  server.middlewares.use('/api/audio-state', async (req, res) => {
    if (req.method === 'POST') {
      const parsed = await readJsonBody(req)
      if (typeof parsed.muted === 'boolean') {
        globalAudioMuted = parsed.muted
        server.ws.send({ type: 'custom', event: 'leaf-audio-mute', data: { muted: globalAudioMuted } })
      }
    }
    sendJson(res, { muted: globalAudioMuted })
  })

  // Heartbeats from the game tab: { active, clientId }.
  server.middlewares.use('/api/focus-guard-state', async (req, res) => {
    if (handleOptions(req, res)) return
    if (req.method === 'POST') {
      const parsed = await readJsonBody(req)
      const clientId = typeof parsed.clientId === 'string' ? parsed.clientId : 'legacy'
      const seq = typeof parsed.seq === 'number' ? parsed.seq : null
      if (typeof parsed.active === 'boolean') updateGuardClient(clientId, parsed.active, seq)
    }
    sendJson(res, { ok: true, active: isGuardActive(), extensionVersion: readExtensionVersion() })
  })

  // Extension closed a new tab/window during focus.
  server.middlewares.use('/api/new-tab-blocked', async (req, res) => {
    if (handleOptions(req, res)) return
    if (req.method === 'POST') {
      const parsed = await readJsonBody(req)
      if (isGuardActive()) {
        server.ws.send({
          type: 'custom',
          event: 'leaf-new-tab-blocked',
          data: { reason: typeof parsed.reason === 'string' ? parsed.reason : 'Opened a new tab' },
        })
      }
    }
    sendJson(res, { ok: true, active: isGuardActive() })
  })

  // Extension (or the page itself) reports leaving the game window; pull Chrome back to the front.
  server.middlewares.use('/api/drift-state', async (req, res) => {
    if (handleOptions(req, res)) return
    if (req.method === 'POST') {
      const parsed = await readJsonBody(req)
      if (isGuardActive()) {
        const drifting = parsed.drifting === true
        if (drifting) bringChromeToFront()
        server.ws.send({
          type: 'custom',
          event: 'leaf-drift-state',
          data: {
            drifting,
            reason: typeof parsed.reason === 'string' ? parsed.reason : '',
            source: typeof parsed.source === 'string' ? parsed.source : 'extension',
          },
        })
      }
    }
    sendJson(res, { ok: true, active: isGuardActive() })
  })
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'leaf-local-bridge',
      configureServer(server) {
        leafBridge(server)
      },
    },
  ],
})
