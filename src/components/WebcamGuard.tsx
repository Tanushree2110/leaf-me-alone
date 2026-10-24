import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  Camera,
  CameraOff,
  CheckCircle2,
  Crosshair,
  EyeOff,
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

  // Baseline head vertical position (0..1 from top of frame)
  const baselineYRef = useRef<number>(0.44)
  const baselinePresenceRef = useRef<number>(0.18)
  const consecutivePhoneFramesRef = useRef<number>(0)
  const consecutiveAwayFramesRef = useRef<number>(0)
  const lastAlertTimeRef = useRef<number>(0)

  const [sensitivity, setSensitivity] = useState<'normal' | 'strict'>('normal')
  const [liveMetrics, setLiveMetrics] = useState<{ headY: number; presence: number }>({
    headY: 0.44,
    presence: 0.25,
  })

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

  // Calibrate current posture as "Focused baseline"
  const handleCalibrate = () => {
    baselineYRef.current = liveMetrics.headY
    baselinePresenceRef.current = Math.max(0.08, liveMetrics.presence)
    consecutivePhoneFramesRef.current = 0
    consecutiveAwayFramesRef.current = 0
    onStatusChange('focused')
    onBackFocused()
  }

  // Real-time computer vision loop for head pitch (looking down at phone) & desk presence
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

      // Detect skin-tone / face / upper-body pixels & compute vertical centroid
      let weightedY = 0
      let weightedX = 0
      let totalWeight = 0
      let lowerHandsActivity = 0

      for (let y = 0; y < 48; y++) {
        for (let x = 8; x < 56; x++) {
          const idx = (y * 64 + x) * 4
          const r = frame[idx]
          const g = frame[idx + 1]
          const b = frame[idx + 2]

          // RGB skin-cluster & warm foreground heuristic
          const isSkinTone =
            r > 75 &&
            g > 40 &&
            b > 20 &&
            r > g &&
            r > b &&
            Math.abs(r - g) > 10 &&
            r - b > 15

          if (isSkinTone) {
            const centerBias = 1 - Math.abs(x - 32) / 32
            const w = 1 + centerBias
            weightedY += (y / 48) * w
            weightedX += (x / 64) * w
            totalWeight += w

            if (y > 35) {
              lowerHandsActivity += 1
            }
          }
        }
      }

      const totalPixels = 48 * 48
      const presenceRatio = totalWeight / totalPixels
      const centroidY = totalWeight > 6 ? weightedY / totalWeight : 0.85
      const centroidX = totalWeight > 6 ? weightedX / totalWeight : 0.5

      setLiveMetrics({ headY: centroidY, presence: presenceRatio })

      // Thresholds based on sensitivity
      const pitchDropThreshold = sensitivity === 'strict' ? 0.075 : 0.11
      const minPresence = Math.max(0.035, baselinePresenceRef.current * 0.28)

      const isAway = presenceRatio < minPresence
      const isLookingDownAtPhone =
        !isAway &&
        (centroidY - baselineYRef.current > pitchDropThreshold ||
          (centroidY > 0.56 && lowerHandsActivity > 38))

      const now = Date.now()

      if (isAway) {
        consecutiveAwayFramesRef.current += 1
        consecutivePhoneFramesRef.current = 0
        if (consecutiveAwayFramesRef.current >= 4) {
          onStatusChange('away_detected')
          if (now - lastAlertTimeRef.current > 6500) {
            lastAlertTimeRef.current = now
            onAwayDetected()
          }
        }
      } else if (isLookingDownAtPhone) {
        consecutivePhoneFramesRef.current += 1
        consecutiveAwayFramesRef.current = 0
        if (consecutivePhoneFramesRef.current >= 3) {
          onStatusChange('phone_detected')
          if (now - lastAlertTimeRef.current > 5500) {
            lastAlertTimeRef.current = now
            onPhoneDetected()
          }
        }
      } else {
        consecutivePhoneFramesRef.current = Math.max(0, consecutivePhoneFramesRef.current - 1)
        consecutiveAwayFramesRef.current = Math.max(0, consecutiveAwayFramesRef.current - 1)
        if (
          consecutivePhoneFramesRef.current === 0 &&
          consecutiveAwayFramesRef.current === 0 &&
          status !== 'focused'
        ) {
          onStatusChange('focused')
          onBackFocused()
        }
      }

      // Draw live HUD reticle on the overlay canvas
      if (overlay) {
        const octx = overlay.getContext('2d')
        if (octx) {
          const W = overlay.width
          const H = overlay.height
          octx.clearRect(0, 0, W, H)

          // Phone-glance horizon threshold line
          const threshY = Math.min(0.85, baselineYRef.current + pitchDropThreshold) * H
          octx.strokeStyle = 'rgba(251, 191, 36, 0.45)'
          octx.lineWidth = 1
          octx.setLineDash([4, 4])
          octx.beginPath()
          octx.moveTo(0, threshY)
          octx.lineTo(W, threshY)
          octx.stroke()
          octx.setLineDash([])

          // Draw head centroid tracking reticle
          if (!isAway) {
            const rx = (1 - centroidX) * W // mirrored video
            const ry = centroidY * H
            octx.strokeStyle = isLookingDownAtPhone ? '#f43f5e' : '#10b981'
            octx.lineWidth = 2
            octx.strokeRect(rx - 22, ry - 22, 44, 44)
          }
        }
      }
    }, 380)

    return () => clearInterval(interval)
  }, [
    enabled,
    status,
    sensitivity,
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
            <CheckCircle2 className="h-3 w-3" /> EYES ON SCREEN
          </span>
        )
      case 'phone_detected':
        return (
          <span className="flex items-center gap-1 animate-pulse text-rose-400 font-extrabold">
            <Smartphone className="h-3 w-3" /> PHONE GLANCE DETECTED!
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
    <div className="flex flex-col gap-2 rounded-xl border border-stone-800 bg-stone-900/90 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold">
          <Camera className="h-3.5 w-3.5 text-emerald-400" />
          <span>Webcam Phone &amp; Drift Guard</span>
        </div>
        <div className="font-mono text-[10px] font-bold">{statusBadge()}</div>
      </div>

      {/* Live Camera Viewport + Tracking Reticle */}
      <div className="relative flex gap-2.5 items-center">
        <div
          className={`relative overflow-hidden rounded-lg border bg-stone-950 ${
            compact ? 'h-20 w-28' : 'h-24 w-32'
          } shrink-0 ${
            status === 'phone_detected'
              ? 'border-rose-500 ring-2 ring-rose-500/40'
              : status === 'away_detected'
              ? 'border-amber-500 ring-2 ring-amber-500/40'
              : 'border-stone-700'
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
              {status === 'permission_denied' ? 'Allow camera in browser' : 'Camera Paused'}
            </div>
          )}
        </div>

        {/* Camera Controls & Posture Calibration */}
        <div className="flex flex-1 flex-col justify-between gap-1.5 font-mono text-[10px]">
          <div className="flex flex-wrap gap-1">
            <button
              onClick={onToggleEnabled}
              className={`rounded-md px-2 py-1 font-bold transition ${
                enabled
                  ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-stone-800 text-stone-300 hover:bg-stone-700'
              }`}
            >
              {enabled ? 'Cam: ON' : 'Turn Cam ON'}
            </button>
            <button
              onClick={handleCalibrate}
              disabled={!enabled}
              className="flex items-center gap-1 rounded-md border border-stone-700 bg-stone-800 px-2 py-1 text-stone-200 hover:bg-stone-700 disabled:opacity-40"
              title="Set your current sitting posture as the focused baseline"
            >
              <Crosshair className="h-3 w-3 text-emerald-400" />
              Calibrate Posture
            </button>
            <button
              onClick={() => setSensitivity((s) => (s === 'normal' ? 'strict' : 'normal'))}
              className="rounded-md border border-stone-700 bg-stone-800 px-2 py-1 text-stone-300 hover:bg-stone-700"
            >
              Sens: {sensitivity.toUpperCase()}
            </button>
          </div>

          <div className="text-[9.5px] text-stone-400 leading-tight">
            Yellow dashed line = phone-glance horizon. Look down below it or leave frame to trigger roommate review.
          </div>

          {/* Instant Simulation Triggers in case user wants to test without tilting head */}
          <div className="flex flex-wrap gap-1 pt-0.5">
            <button
              onClick={() => {
                onStatusChange('phone_detected')
                onPhoneDetected()
              }}
              className="flex items-center gap-1 rounded border border-rose-500/30 bg-rose-950/40 px-1.5 py-0.5 text-[9.5px] text-rose-300 hover:bg-rose-900/50"
            >
              <Smartphone className="h-2.5 w-2.5" /> Sim Phone Glance
            </button>
            <button
              onClick={() => {
                onStatusChange('away_detected')
                onAwayDetected()
              }}
              className="flex items-center gap-1 rounded border border-amber-500/30 bg-amber-950/40 px-1.5 py-0.5 text-[9.5px] text-amber-300 hover:bg-amber-900/50"
            >
              <EyeOff className="h-2.5 w-2.5" /> Sim Drift Away
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
