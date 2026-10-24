import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  Camera,
  CameraOff,
  CheckCircle2,
  Crosshair,
  EyeOff,
  Keyboard,
  Smartphone,
  UserX,
} from 'lucide-react'
import { CameraStatus } from '../types'

interface WebcamGuardProps {
  enabled: boolean
  onToggleEnabled: () => void
  status: CameraStatus
  onStatusChange: (status: CameraStatus) => void
  onPhoneDetected: () => void
  onAwayDetected: () => void
  onBackFocused: () => void
  compact?: boolean
}

export const WebcamGuard: React.FC<WebcamGuardProps> = ({
  enabled,
  onToggleEnabled,
  status,
  onStatusChange,
  onPhoneDetected,
  onAwayDetected,
  onBackFocused,
  compact = false,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const analysisCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // Baseline screen gaze Y (0..1 from top) and keyboard glance allowance
  const baselineYRef = useRef<number>(0.48)
  const baselinePresenceRef = useRef<number>(0.15)
  const autoCalibratedRef = useRef<boolean>(false)
  const downGlanceStartMsRef = useRef<number | null>(null)
  const awayStartMsRef = useRef<number | null>(null)
  const lastAlertTimeRef = useRef<number>(0)
  const lastKeystrokeMsRef = useRef<number>(0)

  // Configurable horizon offset so looking at the keyboard doesn't trip the phone line
  const [lineOffset, setLineOffset] = useState<number>(0.17)
  const [graceSeconds] = useState<number>(6.5) // 6.5s continuous downward stare required before counting as phone
  const [downDurationSec, setDownDurationSec] = useState<number>(0)
  const [isTypingRecently, setIsTypingRecently] = useState<boolean>(false)
  const [liveMetrics, setLiveMetrics] = useState<{ headY: number; presence: number }>({
    headY: 0.48,
    presence: 0.25,
  })

  // Listen for keyboard / mouse activity so looking down while typing is ALWAYS safe
  useEffect(() => {
    const handleActivity = () => {
      lastKeystrokeMsRef.current = Date.now()
      downGlanceStartMsRef.current = null
      setIsTypingRecently(true)
    }
    window.addEventListener('keydown', handleActivity)
    window.addEventListener('mousedown', handleActivity)
    return () => {
      window.removeEventListener('keydown', handleActivity)
      window.removeEventListener('mousedown', handleActivity)
    }
  }, [])

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    onStatusChange('off')
  }, [onStatusChange])

  const startCamera = useCallback(async () => {
    onStatusChange('initializing')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240, facingMode: 'user' },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      onStatusChange('focused')
    } catch {
      onStatusChange('permission_denied')
    }
  }, [onStatusChange])

  useEffect(() => {
    if (enabled) {
      startCamera()
    } else {
      stopCamera()
    }
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
      }
    }
  }, [enabled, startCamera, stopCamera])

  // Calibrate current posture as normal screen gaze
  const handleCalibrateScreen = () => {
    baselineYRef.current = liveMetrics.headY
    baselinePresenceRef.current = Math.max(0.06, liveMetrics.presence)
    downGlanceStartMsRef.current = null
    awayStartMsRef.current = null
    setDownDurationSec(0)
    onStatusChange('focused')
    onBackFocused()
  }

  // Calibrate while looking down at the keyboard so keyboard angle is guaranteed safe
  const handleCalibrateKeyboard = () => {
    // Set the phone threshold slightly BELOW the user's current keyboard-looking head position
    const neededOffset = Math.max(0.12, liveMetrics.headY - baselineYRef.current + 0.06)
    setLineOffset(Math.min(0.32, neededOffset))
    downGlanceStartMsRef.current = null
    setDownDurationSec(0)
    onStatusChange('focused')
    onBackFocused()
  }

  useEffect(() => {
    if (!enabled || status === 'off' || status === 'permission_denied') return

    const interval = setInterval(() => {
      const video = videoRef.current
      const overlay = overlayCanvasRef.current
      if (!video || video.readyState < 2) return

      if (!analysisCanvasRef.current) {
        const c = document.createElement('canvas')
        c.width = 64
        c.height = 48
        analysisCanvasRef.current = c
      }
      const ac = analysisCanvasRef.current
      const actx = ac.getContext('2d', { willReadFrequently: true })
      if (!actx) return

      actx.drawImage(video, 0, 0, 64, 48)
      const frame = actx.getImageData(0, 0, 64, 48).data

      let weightedY = 0
      let weightedX = 0
      let totalWeight = 0

      for (let y = 0; y < 48; y++) {
        for (let x = 6; x < 58; x++) {
          const idx = (y * 64 + x) * 4
          const r = frame[idx]
          const g = frame[idx + 1]
          const b = frame[idx + 2]

          const isSkinTone =
            r > 70 &&
            g > 38 &&
            b > 18 &&
            r > g &&
            r > b &&
            Math.abs(r - g) > 8 &&
            r - b > 12

          if (isSkinTone) {
            const centerBias = 1 - Math.abs(x - 32) / 32
            const w = 1 + centerBias
            weightedY += (y / 48) * w
            weightedX += (x / 64) * w
            totalWeight += w
          }
        }
      }

      const totalPixels = 52 * 48
      const presenceRatio = totalWeight / totalPixels
      const centroidY = totalWeight > 5 ? weightedY / totalWeight : 0.5
      const centroidX = totalWeight > 5 ? weightedX / totalWeight : 0.5

      // Auto-calibrate on the first valid camera frame so it adapts to your natural seating height
      if (!autoCalibratedRef.current && totalWeight > 12) {
        baselineYRef.current = centroidY
        baselinePresenceRef.current = Math.max(0.06, presenceRatio)
        autoCalibratedRef.current = true
      }

      setLiveMetrics({ headY: centroidY, presence: presenceRatio })

      const now = Date.now()
      const typingActive = now - lastKeystrokeMsRef.current < 4500
      setIsTypingRecently(typingActive)

      const minPresence = Math.max(0.025, baselinePresenceRef.current * 0.22)
      const phoneThresholdY = Math.min(0.86, baselineYRef.current + lineOffset)

      const isAway = presenceRatio < minPresence
      const isBelowLine = !isAway && centroidY > phoneThresholdY

      if (isAway) {
        if (!awayStartMsRef.current) awayStartMsRef.current = now
        downGlanceStartMsRef.current = null
        setDownDurationSec(0)
        const awaySec = (now - awayStartMsRef.current) / 1000
        if (awaySec >= 3.5) {
          onStatusChange('away_detected')
          if (now - lastAlertTimeRef.current > 8000) {
            lastAlertTimeRef.current = now
            onAwayDetected()
          }
        }
      } else if (isBelowLine) {
        awayStartMsRef.current = null

        // If actively typing on keyboard, reset phone timer and mark as safe keyboard glance!
        if (typingActive) {
          downGlanceStartMsRef.current = null
          setDownDurationSec(0)
          onStatusChange('keyboard_glance')
          onBackFocused()
        } else {
          if (!downGlanceStartMsRef.current) downGlanceStartMsRef.current = now
          const elapsedSec = (now - downGlanceStartMsRef.current) / 1000
          setDownDurationSec(elapsedSec)

          if (elapsedSec < graceSeconds) {
            // Within the 6.5s Keyboard Glance Grace period: safe!
            if (status !== 'keyboard_glance') {
              onStatusChange('keyboard_glance')
            }
          } else {
            // Stared down below the line for > 6.5s continuously without looking back up: Phone detected!
            onStatusChange('phone_detected')
            if (now - lastAlertTimeRef.current > 7500) {
              lastAlertTimeRef.current = now
              onPhoneDetected()
            }
          }
        }
      } else {
        // Looking above the line! Immediately clear timers & restore focus
        awayStartMsRef.current = null
        downGlanceStartMsRef.current = null
        setDownDurationSec(0)
        if (status !== 'focused') {
          onStatusChange('focused')
        }
        onBackFocused()
      }

      // Draw live HUD reticle & threshold line on overlay canvas
      if (overlay) {
        const octx = overlay.getContext('2d')
        if (octx) {
          const W = overlay.width
          const H = overlay.height
          octx.clearRect(0, 0, W, H)

          const threshPx = phoneThresholdY * H

          // Draw threshold line (Cyan when safe/typing, Red when phone timer exceeded)
          octx.strokeStyle =
            status === 'phone_detected'
              ? 'rgba(244, 63, 94, 0.9)'
              : 'rgba(56, 189, 248, 0.75)'
          octx.lineWidth = 1.5
          octx.setLineDash([4, 3])
          octx.beginPath()
          octx.moveTo(0, threshPx)
          octx.lineTo(W, threshPx)
          octx.stroke()
          octx.setLineDash([])

          // Label the zone below the line as KEYBOARD / PHONE ZONE
          octx.fillStyle = 'rgba(15, 23, 42, 0.65)'
          octx.fillRect(2, threshPx + 2, W - 4, 11)
          octx.fillStyle = '#bae6fd'
          octx.font = 'bold 7.5px "JetBrains Mono", monospace'
          octx.fillText('↓ KEYBOARD (6.5s GRACE) / PHONE', 4, threshPx + 10)

          // Draw head tracking box
          if (!isAway) {
            const rx = (1 - centroidX) * W
            const ry = centroidY * H
            octx.strokeStyle =
              status === 'phone_detected'
                ? '#f43f5e'
                : isBelowLine
                ? '#38bdf8'
                : '#10b981'
            octx.lineWidth = 2
            octx.strokeRect(rx - 18, ry - 18, 36, 36)
          }
        }
      }
    }, 300)

    return () => clearInterval(interval)
  }, [
    enabled,
    status,
    lineOffset,
    graceSeconds,
    onStatusChange,
    onPhoneDetected,
    onAwayDetected,
    onBackFocused,
  ])

  const statusBadge = () => {
    switch (status) {
      case 'focused':
        return (
          <span className="flex items-center gap-1 text-emerald-400">
            <CheckCircle2 className="h-3 w-3" /> ABOVE LINE (GROWING)
          </span>
        )
      case 'keyboard_glance':
        return (
          <span className="flex items-center gap-1 text-sky-300 font-bold">
            <Keyboard className="h-3 w-3" />{' '}
            {isTypingRecently
              ? 'TYPING ON KEYBOARD (SAFE)'
              : `KEYBOARD GLANCE (${Math.max(0, graceSeconds - downDurationSec).toFixed(1)}s GRACE)`}
          </span>
        )
      case 'phone_detected':
        return (
          <span className="flex items-center gap-1 animate-pulse text-rose-400 font-extrabold">
            <Smartphone className="h-3 w-3" /> PHONE DOOMSCROLL!
          </span>
        )
      case 'away_detected':
        return (
          <span className="flex items-center gap-1 animate-pulse text-amber-400 font-extrabold">
            <UserX className="h-3 w-3" /> DRIFTED AWAY!
          </span>
        )
      case 'permission_denied':
        return <span className="text-rose-400">CAMERA BLOCKED</span>
      case 'initializing':
        return <span className="text-stone-400">STARTING CAM...</span>
      default:
        return <span className="text-stone-500">CAM OFF</span>
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-stone-800 bg-stone-900/95 p-2.5 backdrop-blur-md">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 font-mono text-[10.5px] font-bold">
          <Camera className="h-3.5 w-3.5 text-emerald-400" />
          <span>Webcam Guard</span>
        </div>
        <div className="font-mono text-[9.5px] font-bold">{statusBadge()}</div>
      </div>

      {/* Grace Bar when glancing down at keyboard */}
      {status === 'keyboard_glance' && !isTypingRecently && (
        <div className="w-full overflow-hidden rounded-full bg-stone-800 h-1.5">
          <div
            className="h-full bg-sky-400 transition-all duration-200"
            style={{ width: `${Math.min(100, (downDurationSec / graceSeconds) * 100)}%` }}
          />
        </div>
      )}

      {/* Live Camera Viewport + Tracking Reticle */}
      <div className="relative flex gap-2.5 items-center">
        <div
          className={`relative overflow-hidden rounded-lg border bg-stone-950 ${
            compact ? 'h-20 w-28' : 'h-24 w-32'
          } shrink-0 ${
            status === 'phone_detected'
              ? 'border-rose-500 ring-2 ring-rose-500/40'
              : status === 'keyboard_glance'
              ? 'border-sky-400/70'
              : status === 'away_detected'
              ? 'border-amber-500 ring-2 ring-amber-500/40'
              : 'border-emerald-500/50'
          }`}
        >
          <video
            ref={videoRef}
            muted
            playsInline
            className={`h-full w-full object-cover -scale-x-100 ${
              enabled && status !== 'off' ? 'block' : 'hidden'
            }`}
          />
          <canvas
            ref={overlayCanvasRef}
            width={128}
            height={96}
            className={`pointer-events-none absolute inset-0 h-full w-full ${
              enabled && status !== 'off' ? 'block' : 'hidden'
            }`}
          />
          {(!enabled || status === 'off' || status === 'permission_denied') && (
            <div className="flex h-full w-full flex-col items-center justify-center p-2 text-center font-mono text-[9px] text-stone-500">
              <CameraOff className="mb-1 h-4 w-4 text-stone-600" />
              {status === 'permission_denied' ? 'Allow camera' : 'Camera Off'}
            </div>
          )}
        </div>

        {/* Camera Controls & Keyboard-Safe Calibration */}
        <div className="flex flex-1 flex-col justify-between gap-1 font-mono text-[9.5px]">
          <div className="flex flex-wrap gap-1">
            <button
              onClick={handleCalibrateScreen}
              disabled={!enabled}
              className="flex items-center gap-1 rounded border border-emerald-500/40 bg-emerald-950/50 px-1.5 py-0.5 text-emerald-200 hover:bg-emerald-900/60 disabled:opacity-40"
              title="Click while looking at your screen"
            >
              <Crosshair className="h-2.5 w-2.5 text-emerald-400" />
              Set Screen Gaze
            </button>
            <button
              onClick={handleCalibrateKeyboard}
              disabled={!enabled}
              className="flex items-center gap-1 rounded border border-sky-500/40 bg-sky-950/50 px-1.5 py-0.5 text-sky-200 hover:bg-sky-900/60 disabled:opacity-40"
              title="Look down at your keyboard and click this so keyboard glances never trigger phone alerts"
            >
              <Keyboard className="h-2.5 w-2.5 text-sky-400" />
              Set Keyboard Safe
            </button>
          </div>

          {/* Adjust line height nudger */}
          <div className="flex items-center justify-between gap-1 text-[9px] text-stone-400">
            <span>Line Depth:</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setLineOffset((v) => Math.max(0.08, +(v - 0.03).toFixed(2)))}
                className="rounded bg-stone-800 px-1.5 py-0.5 text-stone-200 hover:bg-stone-700"
                title="Move threshold line higher"
              >
                ▲ Higher
              </button>
              <button
                onClick={() => setLineOffset((v) => Math.min(0.35, +(v + 0.03).toFixed(2)))}
                className="rounded bg-stone-800 px-1.5 py-0.5 text-stone-200 hover:bg-stone-700"
                title="Move threshold line lower (more room for keyboard glances)"
              >
                ▼ Lower
              </button>
              <button
                onClick={onToggleEnabled}
                className="rounded bg-stone-800 px-1.5 py-0.5 text-stone-400 hover:text-white"
              >
                {enabled ? 'Off' : 'On'}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-1 pt-0.5">
            <button
              onClick={() => {
                onStatusChange('phone_detected')
                onPhoneDetected()
              }}
              className="flex items-center gap-1 rounded border border-rose-500/30 bg-rose-950/40 px-1.5 py-0.5 text-[9px] text-rose-300 hover:bg-rose-900/50"
            >
              <Smartphone className="h-2.5 w-2.5" /> Test Phone
            </button>
            <button
              onClick={() => {
                onStatusChange('away_detected')
                onAwayDetected()
              }}
              className="flex items-center gap-1 rounded border border-amber-500/30 bg-amber-950/40 px-1.5 py-0.5 text-[9px] text-amber-300 hover:bg-amber-900/50"
            >
              <EyeOff className="h-2.5 w-2.5" /> Test Away
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
