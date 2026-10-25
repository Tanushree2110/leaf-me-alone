import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  Camera,
  CameraOff,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Crosshair,
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

  // Smoothed face Y position (0..1 from top of camera frame)
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

  // Listen ONLY to physical keyboard keystrokes (not mouse clicks) for the typing shield
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

  // Click anywhere on the camera preview to place the dashed threshold line right at that height!
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const clickY = (e.clientY - rect.top) / rect.height
    const clamped = Math.max(0.2, Math.min(0.85, +clickY.toFixed(2)))
    setThresholdY(clamped)
    belowLineStartMsRef.current = null
    setBelowDurationSec(0)
  }

  // Calibrate line just below current face position
  const handleCalibrateLine = () => {
    const nextLine = Math.max(0.25, Math.min(0.82, +(smoothedYRef.current + 0.05).toFixed(2)))
    setThresholdY(nextLine)
    belowLineStartMsRef.current = null
    setBelowDurationSec(0)
    onStatusChange('focused')
    onBackFocused()
  }

  useEffect(() => {
    if (!enabled || status === 'off' || status === 'permission_denied') return

    // Delay needed below line before dropping a leaf (1.4s so looking below line triggers quickly!)
    const TRIGGER_SECONDS = 1.4

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

      // Track the upper-face / skin cluster with cubic weight so head pitch moves the tracking dot strongly
      const skinPointsY: number[] = []
      let weightedX = 0
      let totalWeight = 0

      for (let y = 2; y < 46; y++) {
        for (let x = 8; x < 56; x++) {
          const idx = (y * 64 + x) * 4
          const r = frame[idx]
          const g = frame[idx + 1]
          const b = frame[idx + 2]

          const isSkin =
            r > 65 &&
            g > 35 &&
            b > 15 &&
            r > g &&
            r > b &&
            r - g > 7 &&
            r - b > 12

          if (isSkin) {
            const centerBias = 1 - Math.abs(x - 32) / 32
            const w = 1 + centerBias * 1.5
            skinPointsY.push(y / 48)
            weightedX += (x / 64) * w
            totalWeight += w
          }
        }
      }

      const presenceRatio = totalWeight / (48 * 48)
      const isAway = skinPointsY.length < 18 || presenceRatio < 0.018

      if (!isAway && skinPointsY.length > 0) {
        skinPointsY.sort((a, b) => a - b)
        // Use the 30th percentile (forehead / eyes / nose bridge) + 70th percentile (chin)
        // When you tilt your head down, both forehead and chin shift down significantly
        const p30 = skinPointsY[Math.floor(skinPointsY.length * 0.3)]
        const p75 = skinPointsY[Math.floor(skinPointsY.length * 0.75)]
        const rawFaceY = p30 * 0.55 + p75 * 0.45
        const rawFaceX = weightedX / totalWeight

        smoothedYRef.current = smoothedYRef.current * 0.55 + rawFaceY * 0.45
        smoothedXRef.current = smoothedXRef.current * 0.6 + rawFaceX * 0.4

        if (!autoCalibratedRef.current) {
          autoCalibratedRef.current = true
          const initialLine = Math.max(0.28, Math.min(0.78, +(rawFaceY + 0.055).toFixed(2)))
          setThresholdY(initialLine)
        }
      }

      const now = Date.now()
      const typingActive = now - lastKeydownMsRef.current < 2200
      setIsTypingNow(typingActive)

      const currentFaceY = smoothedYRef.current
      const currentLineY = thresholdYRef.current
      const isBelowLine = !isAway && currentFaceY > currentLineY

      if (isAway) {
        if (!awayStartMsRef.current) awayStartMsRef.current = now
        belowLineStartMsRef.current = null
        setBelowDurationSec(0)

        const awaySec = (now - awayStartMsRef.current) / 1000
        if (awaySec >= 2.2) {
          onStatusChange('away_detected')
          if (now - lastAlertTimeRef.current > 4000) {
            lastAlertTimeRef.current = now
            onAwayDetected()
          }
        }
      } else if (isBelowLine) {
        awayStartMsRef.current = null

        if (typingActive) {
          // Typing on physical keyboard: safe!
          belowLineStartMsRef.current = null
          setBelowDurationSec(0)
          onStatusChange('keyboard_glance')
          onBackFocused()
        } else {
          if (!belowLineStartMsRef.current) belowLineStartMsRef.current = now
          const elapsed = (now - belowLineStartMsRef.current) / 1000
          setBelowDurationSec(elapsed)

          if (elapsed >= TRIGGER_SECONDS) {
            onStatusChange('phone_detected')
            // Drop a leaf immediately on crossing, and drop another leaf every 3.8s while staying below line!
            if (now - lastAlertTimeRef.current > 3800) {
              lastAlertTimeRef.current = now
              onPhoneDetected()
            }
          } else {
            onStatusChange('keyboard_glance')
          }
        }
      } else {
        // Above the line -> Focused!
        awayStartMsRef.current = null
        belowLineStartMsRef.current = null
        setBelowDurationSec(0)
        if (status !== 'focused') {
          onStatusChange('focused')
          onBackFocused()
        }
      }

      // Draw live HUD on overlay canvas: Threshold Line + Face Tracking Dot & Box
      if (overlay) {
        const octx = overlay.getContext('2d')
        if (octx) {
          const W = overlay.width
          const H = overlay.height
          octx.clearRect(0, 0, W, H)

          const linePx = currentLineY * H

          // Shade danger zone below the line
          octx.fillStyle = isBelowLine
            ? 'rgba(244, 63, 94, 0.24)'
            : 'rgba(15, 23, 42, 0.28)'
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

            // Outer reticle box
            octx.strokeStyle = color
            octx.lineWidth = 2
            octx.strokeRect(rx - 18, ry - 18, 36, 36)

            // Center tracking dot (when this dot crosses below the dashed line, leaf drops!)
            octx.fillStyle = color
            octx.beginPath()
            octx.arc(rx, ry, 4.5, 0, Math.PI * 2)
            octx.fill()
          }
        }
      }
    }, 180)

    return () => clearInterval(interval)
  }, [
    enabled,
    status,
    onStatusChange,
    onPhoneDetected,
    onAwayDetected,
    onBackFocused,
  ])

  return (
    <div className="flex flex-col rounded-xl border border-stone-700/90 bg-stone-900/95 p-2 shadow-2xl backdrop-blur-md">
      {/* Compact Header Bar */}
      <div className="flex items-center justify-between gap-2 pb-1.5">
        <div className="flex items-center gap-1.5 font-mono text-[10.5px] font-bold">
          <Camera className="h-3.5 w-3.5 text-emerald-400" />
          {status === 'phone_detected' ? (
            <span className="flex items-center gap-1 text-rose-400 animate-pulse">
              <Smartphone className="h-3 w-3" /> BELOW LINE · DROPPING LEAF!
            </span>
          ) : status === 'away_detected' ? (
            <span className="flex items-center gap-1 text-amber-400 animate-pulse">
              <UserX className="h-3 w-3" /> AWAY FROM DESK!
            </span>
          ) : status === 'keyboard_glance' ? (
            <span className="flex items-center gap-1 text-sky-300">
              <Keyboard className="h-3 w-3" />{' '}
              {isTypingNow
                ? 'TYPING (SAFE)'
                : `BELOW LINE (${Math.max(0, 1.4 - belowDurationSec).toFixed(1)}s)`}
            </span>
          ) : (
            <span className="flex items-center gap-1 text-emerald-400">
              <CheckCircle2 className="h-3 w-3" /> ABOVE LINE
            </span>
          )}
        </div>

        <button
          onClick={onToggleExpanded}
          className="rounded p-0.5 text-stone-400 hover:bg-stone-800 hover:text-white"
          title={isExpanded ? 'Collapse controls' : 'Expand camera controls'}
        >
          {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Always-mounted Live Video + Click-to-Set-Line Canvas */}
      <div className="flex items-center gap-2">
        <div
          className={`relative overflow-hidden rounded-lg border bg-stone-950 ${
            isExpanded ? 'h-24 w-32' : 'h-16 w-24'
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
              title="Snap dashed line just below your current face position"
            >
              <Crosshair className="h-3 w-3 text-emerald-400" />
              Snap Line Below Face
            </button>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setThresholdY((v) => Math.max(0.2, +(v - 0.04).toFixed(2)))}
                className="flex-1 rounded bg-stone-800 px-1.5 py-0.5 text-stone-200 hover:bg-stone-700"
              >
                ▲ Line Up
              </button>
              <button
                onClick={() => setThresholdY((v) => Math.min(0.85, +(v + 0.04).toFixed(2)))}
                className="flex-1 rounded bg-stone-800 px-1.5 py-0.5 text-stone-200 hover:bg-stone-700"
              >
                ▼ Line Down
              </button>
            </div>

            <div className="flex items-center justify-between text-[8.5px] text-stone-400">
              <span>Or click video to move line</span>
              <button
                onClick={onToggleEnabled}
                className="underline hover:text-stone-200"
              >
                {enabled ? 'Disable' : 'Enable'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
