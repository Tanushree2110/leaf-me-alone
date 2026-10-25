import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  Camera,
  CameraOff,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Crosshair,
  Keyboard,
  RefreshCw,
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
  isExpanded: boolean
  onToggleExpanded: () => void
}

export const WebcamGuard: React.FC<WebcamGuardProps> = ({
  enabled,
  onToggleEnabled,
  status,
  onStatusChange,
  onPhoneDetected,
  onAwayDetected,
  onBackFocused,
  isExpanded,
  onToggleExpanded,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const analysisCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const prevGrayFrameRef = useRef<Float32Array | null>(null)

  // Store callbacks in a ref so the CV interval never restarts when parent state changes!
  const callbacksRef = useRef({
    status,
    onStatusChange,
    onPhoneDetected,
    onAwayDetected,
    onBackFocused,
  })
  useEffect(() => {
    callbacksRef.current = {
      status,
      onStatusChange,
      onPhoneDetected,
      onAwayDetected,
      onBackFocused,
    }
  }, [status, onStatusChange, onPhoneDetected, onAwayDetected, onBackFocused])

  // Smoothed face Y/X position (0..1 from top of camera frame)
  const smoothedYRef = useRef<number>(0.42)
  const smoothedXRef = useRef<number>(0.5)
  const autoCalibratedRef = useRef<boolean>(false)

  // Direct threshold line Y position (0..1 from top of frame)
  const [thresholdY, setThresholdY] = useState<number>(0.52)
  const thresholdYRef = useRef<number>(0.52)
  useEffect(() => {
    thresholdYRef.current = thresholdY
  }, [thresholdY])

  const belowLineStartMsRef = useRef<number | null>(null)
  const awayStartMsRef = useRef<number | null>(null)
  const lastAlertTimeRef = useRef<number>(0)
  const lastKeydownMsRef = useRef<number>(0)

  const [belowDurationSec, setBelowDurationSec] = useState<number>(0)
  const [isTypingNow, setIsTypingNow] = useState<boolean>(false)

  // Listen ONLY to physical keyboard keystrokes for the typing shield
  useEffect(() => {
    const handleKeyDown = () => {
      lastKeydownMsRef.current = Date.now()
      belowLineStartMsRef.current = null
      setIsTypingNow(true)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    callbacksRef.current.onStatusChange('off')
  }, [])

  const startCamera = useCallback(async () => {
    callbacksRef.current.onStatusChange('initializing')
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240, facingMode: 'user' },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => {})
      }
      callbacksRef.current.onStatusChange('focused')
    } catch {
      callbacksRef.current.onStatusChange('permission_denied')
    }
  }, [])

  useEffect(() => {
    if (enabled) {
      startCamera()
    } else {
      stopCamera()
    }
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }
    }
  }, [enabled, startCamera, stopCamera])

  // Click anywhere on the camera preview to place the dashed threshold line right at that height
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const clickY = (e.clientY - rect.top) / rect.height
    const clamped = Math.max(0.18, Math.min(0.88, +clickY.toFixed(2)))
    setThresholdY(clamped)
    belowLineStartMsRef.current = null
    setBelowDurationSec(0)
  }

  // Snap line just below current face dot
  const handleCalibrateLine = () => {
    const nextLine = Math.max(0.22, Math.min(0.85, +(smoothedYRef.current + 0.05).toFixed(2)))
    setThresholdY(nextLine)
    belowLineStartMsRef.current = null
    setBelowDurationSec(0)
    callbacksRef.current.onStatusChange('focused')
    callbacksRef.current.onBackFocused()
  }

  // Persistent CV loop (never torn down by status updates)
  useEffect(() => {
    if (!enabled) return

    const TRIGGER_SECONDS = 1.2

    const interval = setInterval(() => {
      const video = videoRef.current
      const overlay = overlayCanvasRef.current
      if (!video) return

      // Auto-recover if Chrome paused the video or a track ended
      const activeStream = streamRef.current
      if (
        !activeStream ||
        activeStream.getVideoTracks().length === 0 ||
        activeStream.getVideoTracks()[0].readyState === 'ended'
      ) {
        startCamera()
        return
      }
      if (video.paused && video.readyState >= 2) {
        video.play().catch(() => {})
      }
      if (video.readyState < 2) return

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

      // Compute luminance & track facial features (eyes, brows, nose, mouth horizontal edges + skin + motion)
      // Unlike flat walls, a face has strong horizontal edge contrast + skin warmth in the center column
      const gray = new Float32Array(64 * 48)
      for (let i = 0; i < 64 * 48; i++) {
        const idx = i * 4
        gray[i] = 0.299 * frame[idx] + 0.587 * frame[idx + 1] + 0.114 * frame[idx + 2]
      }

      const prevGray = prevGrayFrameRef.current
      prevGrayFrameRef.current = gray

      let weightedY = 0
      let weightedX = 0
      let totalFeatureWeight = 0
      let skinCount = 0

      for (let y = 3; y < 45; y++) {
        for (let x = 12; x < 52; x++) {
          const i = y * 64 + x
          const idx = i * 4
          const r = frame[idx]
          const g = frame[idx + 1]
          const b = frame[idx + 2]

          // Horizontal edge strength (captures eyes, eyebrows, hairline, glasses, nose, mouth)
          const vGrad = Math.abs(gray[i] - gray[(y - 2) * 64 + x])
          // Motion strength
          const motion = prevGray ? Math.abs(gray[i] - prevGray[i]) : 0

          // Warm skin likelihood
          const isSkin =
            r > 60 && g > 30 && b > 15 && r >= g && r > b && r - b > 10

          if (isSkin) skinCount++

          if (vGrad > 14 || motion > 10) {
            const centerBias = 1.2 - Math.abs(x - 32) / 28
            const skinBoost = isSkin ? 2.2 : 0.8
            const motionBoost = motion > 10 ? 1.8 : 1.0
            const w = (vGrad + motion * 1.5) * centerBias * skinBoost * motionBoost

            weightedY += (y / 48) * w
            weightedX += (x / 64) * w
            totalFeatureWeight += w
          }
        }
      }

      const isAway = skinCount < 14 && totalFeatureWeight < 450

      if (!isAway && totalFeatureWeight > 0) {
        const rawY = weightedY / totalFeatureWeight
        const rawX = weightedX / totalFeatureWeight

        smoothedYRef.current = smoothedYRef.current * 0.45 + rawY * 0.55
        smoothedXRef.current = smoothedXRef.current * 0.5 + rawX * 0.5

        if (!autoCalibratedRef.current) {
          autoCalibratedRef.current = true
          const initialLine = Math.max(0.25, Math.min(0.78, +(rawY + 0.05).toFixed(2)))
          setThresholdY(initialLine)
        }
      }

      const now = Date.now()
      const typingActive = now - lastKeydownMsRef.current < 2000
      setIsTypingNow(typingActive)

      const currentFaceY = smoothedYRef.current
      const currentLineY = thresholdYRef.current
      const isBelowLine = !isAway && currentFaceY > currentLineY

      const {
        status: curStatus,
        onStatusChange: cbStatus,
        onPhoneDetected: cbPhone,
        onAwayDetected: cbAway,
        onBackFocused: cbFocused,
      } = callbacksRef.current

      if (isAway) {
        if (!awayStartMsRef.current) awayStartMsRef.current = now
        belowLineStartMsRef.current = null
        setBelowDurationSec(0)

        const awaySec = (now - awayStartMsRef.current) / 1000
        if (awaySec >= 2.2) {
          if (curStatus !== 'away_detected') cbStatus('away_detected')
          if (now - lastAlertTimeRef.current > 3800) {
            lastAlertTimeRef.current = now
            cbAway()
          }
        }
      } else if (isBelowLine) {
        awayStartMsRef.current = null

        if (typingActive) {
          belowLineStartMsRef.current = null
          setBelowDurationSec(0)
          if (curStatus !== 'keyboard_glance') cbStatus('keyboard_glance')
          cbFocused()
        } else {
          if (!belowLineStartMsRef.current) belowLineStartMsRef.current = now
          const elapsed = (now - belowLineStartMsRef.current) / 1000
          setBelowDurationSec(elapsed)

          if (elapsed >= TRIGGER_SECONDS) {
            if (curStatus !== 'phone_detected') cbStatus('phone_detected')
            if (now - lastAlertTimeRef.current > 3200) {
              lastAlertTimeRef.current = now
              cbPhone()
            }
          } else {
            if (curStatus !== 'keyboard_glance') cbStatus('keyboard_glance')
          }
        }
      } else {
        awayStartMsRef.current = null
        belowLineStartMsRef.current = null
        setBelowDurationSec(0)
        if (curStatus !== 'focused') {
          cbStatus('focused')
          cbFocused()
        }
      }

      // Draw live HUD on overlay canvas
      if (overlay) {
        const octx = overlay.getContext('2d')
        if (octx) {
          const W = overlay.width
          const H = overlay.height
          octx.clearRect(0, 0, W, H)

          const linePx = currentLineY * H

          octx.fillStyle = isBelowLine
            ? 'rgba(244, 63, 94, 0.28)'
            : 'rgba(15, 23, 42, 0.25)'
          octx.fillRect(0, linePx, W, H - linePx)

          // Dashed Threshold Line
          octx.strokeStyle = isBelowLine ? '#f43f5e' : '#38bdf8'
          octx.lineWidth = 2
          octx.setLineDash([5, 3])
          octx.beginPath()
          octx.moveTo(0, linePx)
          octx.lineTo(W, linePx)
          octx.stroke()
          octx.setLineDash([])

          if (!isAway) {
            const rx = (1 - smoothedXRef.current) * W
            const ry = currentFaceY * H
            const color = isBelowLine
              ? typingActive
                ? '#38bdf8'
                : '#f43f5e'
              : '#10b981'

            octx.strokeStyle = color
            octx.lineWidth = 2
            octx.strokeRect(rx - 16, ry - 16, 32, 32)

            // Center dot that triggers leaf drop as soon as it crosses below the dashed line
            octx.fillStyle = color
            octx.beginPath()
            octx.arc(rx, ry, 4.5, 0, Math.PI * 2)
            octx.fill()
          }
        }
      }
    }, 150)

    return () => clearInterval(interval)
  }, [enabled, startCamera])

  return (
    <div className="flex flex-col rounded-xl border border-stone-700/90 bg-stone-900/95 p-2 shadow-2xl backdrop-blur-md">
      {/* Compact Header Bar */}
      <div className="flex items-center justify-between gap-2 pb-1.5">
        <div className="flex items-center gap-1.5 font-mono text-[10.5px] font-bold">
          <Camera className="h-3.5 w-3.5 text-emerald-400" />
          {status === 'phone_detected' ? (
            <span className="flex items-center gap-1 text-rose-400 animate-pulse">
              <Smartphone className="h-3 w-3" /> BELOW LINE · LEAF DROPPED!
            </span>
          ) : status === 'away_detected' ? (
            <span className="flex items-center gap-1 text-amber-400 animate-pulse">
              <UserX className="h-3 w-3" /> AWAY!
            </span>
          ) : status === 'keyboard_glance' ? (
            <span className="flex items-center gap-1 text-sky-300">
              <Keyboard className="h-3 w-3" />{' '}
              {isTypingNow
                ? 'TYPING (SAFE)'
                : `BELOW LINE (${Math.max(0, 1.2 - belowDurationSec).toFixed(1)}s)`}
            </span>
          ) : (
            <span className="flex items-center gap-1 text-emerald-400">
              <CheckCircle2 className="h-3 w-3" /> ABOVE LINE
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={startCamera}
            className="rounded p-0.5 text-stone-400 hover:bg-stone-800 hover:text-white"
            title="Restart Camera"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
          <button
            onClick={onToggleExpanded}
            className="rounded p-0.5 text-stone-400 hover:bg-stone-800 hover:text-white"
            title={isExpanded ? 'Collapse controls' : 'Expand camera controls'}
          >
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronUp className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Always-mounted Live Video + Click-to-Set-Line Canvas */}
      <div className="flex items-center gap-2">
        <div
          className={`relative overflow-hidden rounded-lg border bg-stone-950 ${
            isExpanded ? 'h-24 w-32' : 'h-20 w-28'
          } shrink-0 transition-all ${
            status === 'phone_detected'
              ? 'border-rose-500 ring-2 ring-rose-500/50'
              : status === 'away_detected'
              ? 'border-amber-500 ring-2 ring-amber-500/50'
              : 'border-stone-700'
          }`}
        >
          <video
            ref={videoRef}
            autoPlay
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
            onClick={handleCanvasClick}
            title="Click anywhere on video to set the dashed line height"
            className={`cursor-ns-resize absolute inset-0 h-full w-full ${
              enabled && status !== 'off' ? 'block' : 'hidden'
            }`}
          />
          {(!enabled || status === 'off' || status === 'permission_denied') && (
            <div className="flex h-full w-full flex-col items-center justify-center p-1 text-center font-mono text-[8.5px] text-stone-500">
              <CameraOff className="mb-0.5 h-3.5 w-3.5 text-stone-600" />
              {status === 'permission_denied' ? 'Blocked' : 'Off'}
            </div>
          )}
        </div>

        {/* Expanded Calibration & Line Height Controls */}
        {isExpanded && (
          <div className="flex flex-col gap-1.5 font-mono text-[9.5px]">
            <button
              onClick={handleCalibrateLine}
              className="flex items-center gap-1 rounded border border-emerald-500/40 bg-emerald-950/60 px-2 py-1 font-bold text-emerald-200 hover:bg-emerald-900/60"
            >
              <Crosshair className="h-3 w-3 text-emerald-400" />
              Snap Line Below Dot
            </button>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setThresholdY((v) => Math.max(0.18, +(v - 0.04).toFixed(2)))}
                className="flex-1 rounded bg-stone-800 px-1.5 py-0.5 text-stone-200 hover:bg-stone-700"
              >
                ▲ Up
              </button>
              <button
                onClick={() => setThresholdY((v) => Math.min(0.88, +(v + 0.04).toFixed(2)))}
                className="flex-1 rounded bg-stone-800 px-1.5 py-0.5 text-stone-200 hover:bg-stone-700"
              >
                ▼ Down
              </button>
            </div>

            <div className="flex items-center justify-between text-[8.5px] text-stone-400">
              <span>Click video to place line</span>
              <button onClick={onToggleEnabled} className="underline hover:text-stone-200">
                {enabled ? 'Off' : 'On'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
