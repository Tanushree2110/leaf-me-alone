import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, CameraOff, Crosshair, RefreshCw } from 'lucide-react'
import { CameraStatus } from '../types'

interface WebcamGuardProps {
  enabled: boolean
  onToggleEnabled: () => void
  status: CameraStatus
  onStatusChange: (status: CameraStatus) => void
  onPhoneDetected: () => void
  onAwayDetected: () => void
  onBackFocused: () => void
}

export const WebcamGuard: React.FC<WebcamGuardProps> = ({
  enabled,
  status,
  onStatusChange,
  onPhoneDetected,
  onAwayDetected,
  onBackFocused,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const analysisCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

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

  // Smoothed Eye/Nose Y position (0..1 from top of camera frame)
  const smoothedYRef = useRef<number>(0.36)
  const smoothedXRef = useRef<number>(0.5)
  const autoCalibratedRef = useRef<boolean>(false)

  // Adjustable threshold line Y position (default 0.58 so normal sitting posture is comfortably above it)
  const [thresholdY, setThresholdY] = useState<number>(0.58)
  const thresholdYRef = useRef<number>(0.58)
  useEffect(() => {
    thresholdYRef.current = thresholdY
  }, [thresholdY])

  const belowLineStartMsRef = useRef<number | null>(null)
  const awayStartMsRef = useRef<number | null>(null)
  const lastAlertTimeRef = useRef<number>(0)
  const lastKeydownMsRef = useRef<number>(0)

  // Listen to physical keyboard keystrokes so typing is safe
  useEffect(() => {
    const handleKeyDown = () => {
      lastKeydownMsRef.current = Date.now()
      belowLineStartMsRef.current = null
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

  // Click anywhere on video to set the line height
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const clickY = (e.clientY - rect.top) / rect.height
    const clamped = Math.max(0.18, Math.min(0.88, +clickY.toFixed(2)))
    setThresholdY(clamped)
    belowLineStartMsRef.current = null
  }

  // Snap line comfortably below current eye/face dot
  const handleCalibrateLine = () => {
    const nextLine = Math.max(0.25, Math.min(0.85, +(smoothedYRef.current + 0.1).toFixed(2)))
    setThresholdY(nextLine)
    belowLineStartMsRef.current = null
    callbacksRef.current.onStatusChange('focused')
    callbacksRef.current.onBackFocused()
  }

  // Persistent CV loop that tracks the UPPER FACE (eyes/nose bridge) so neck/chest never pulls it down
  useEffect(() => {
    if (!enabled) return

    const TRIGGER_SECONDS = 1.1

    const interval = setInterval(() => {
      const video = videoRef.current
      const overlay = overlayCanvasRef.current
      if (!video) return

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

      // Collect all face/skin points in the central region, then take the UPPER 25th percentile (Eye/Forehead line!)
      // This completely ignores neck, chest, collar, and hands so looking above the line is ALWAYS green!
      const skinRowsY: number[] = []
      let sumX = 0
      let skinPixels = 0

      for (let y = 2; y < 44; y++) {
        let rowSkinCount = 0
        for (let x = 12; x < 52; x++) {
          const idx = (y * 64 + x) * 4
          const r = frame[idx]
          const g = frame[idx + 1]
          const b = frame[idx + 2]

          const isSkin =
            r > 65 &&
            g > 35 &&
            b > 18 &&
            r > g &&
            r > b &&
            r - g > 7 &&
            r - b > 12

          if (isSkin) {
            rowSkinCount++
            sumX += x / 64
            skinPixels++
          }
        }
        // If this horizontal scanline has a solid cluster of face skin pixels, record its Y
        if (rowSkinCount >= 4) {
          skinRowsY.push(y / 48)
        }
      }

      const isAway = skinPixels < 22 || skinRowsY.length < 3

      if (!isAway && skinRowsY.length > 0) {
        // Upper 25% of the detected face rows = Eyes / Upper Nose Bridge!
        // When your face is above the line, this point stays firmly above the line.
        // When you bow your head down to look at your phone, the top of your face drops below the line.
        const eyeRowIndex = Math.floor(skinRowsY.length * 0.25)
        const rawEyeY = skinRowsY[eyeRowIndex]
        const rawX = sumX / skinPixels

        smoothedYRef.current = smoothedYRef.current * 0.5 + rawEyeY * 0.5
        smoothedXRef.current = smoothedXRef.current * 0.55 + rawX * 0.45

        if (!autoCalibratedRef.current) {
          autoCalibratedRef.current = true
          const initialLine = Math.max(0.32, Math.min(0.8, +(rawEyeY + 0.11).toFixed(2)))
          setThresholdY(initialLine)
        }
      }

      const now = Date.now()
      const typingActive = now - lastKeydownMsRef.current < 1800

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
          if (curStatus !== 'keyboard_glance') cbStatus('keyboard_glance')
          cbFocused()
        } else {
          if (!belowLineStartMsRef.current) belowLineStartMsRef.current = now
          const elapsed = (now - belowLineStartMsRef.current) / 1000

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
        // Above the line -> Green!
        awayStartMsRef.current = null
        belowLineStartMsRef.current = null
        if (curStatus !== 'focused') {
          cbStatus('focused')
          cbFocused()
        }
      }

      // Draw clean Green / Red visual overlay (no verbose text!)
      if (overlay) {
        const octx = overlay.getContext('2d')
        if (octx) {
          const W = overlay.width
          const H = overlay.height
          octx.clearRect(0, 0, W, H)

          const linePx = currentLineY * H
          const isRed = isBelowLine && !typingActive

          // Subtle tint below line
          octx.fillStyle = isRed
            ? 'rgba(244, 63, 94, 0.28)'
            : 'rgba(16, 185, 129, 0.08)'
          octx.fillRect(0, linePx, W, H - linePx)

          // Threshold Line (Green when above line, Red when below line)
          octx.strokeStyle = isRed ? '#f43f5e' : '#10b981'
          octx.lineWidth = 2.2
          octx.setLineDash([5, 3])
          octx.beginPath()
          octx.moveTo(0, linePx)
          octx.lineTo(W, linePx)
          octx.stroke()
          octx.setLineDash([])

          if (!isAway) {
            const rx = (1 - smoothedXRef.current) * W
            const ry = currentFaceY * H
            const color = isRed ? '#f43f5e' : '#10b981'

            octx.strokeStyle = color
            octx.lineWidth = 2
            octx.strokeRect(rx - 14, ry - 14, 28, 28)

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

  const isRedState = status === 'phone_detected' || status === 'away_detected'

  return (
    <div
      className={`flex items-center gap-2 rounded-2xl border p-2 shadow-2xl backdrop-blur-md transition-colors ${
        isRedState
          ? 'border-rose-500 bg-rose-950/80 ring-2 ring-rose-500/40'
          : 'border-emerald-500/60 bg-stone-900/95'
      }`}
    >
      {/* Live Camera Viewport with Green/Red Status Dot */}
      <div
        className={`relative h-20 w-28 overflow-hidden rounded-xl border-2 bg-stone-950 shrink-0 transition-colors ${
          isRedState ? 'border-rose-500' : 'border-emerald-500'
        }`}
      >
        {/* Clean Green / Red corner indicator dot */}
        <span
          className={`absolute top-1.5 left-1.5 z-10 h-2.5 w-2.5 rounded-full shadow ${
            isRedState ? 'bg-rose-500 animate-ping' : 'bg-emerald-400'
          }`}
        />
        <span
          className={`absolute top-1.5 left-1.5 z-10 h-2.5 w-2.5 rounded-full ${
            isRedState ? 'bg-rose-500' : 'bg-emerald-400'
          }`}
        />

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
          title="Click anywhere on video to move line"
          className={`cursor-ns-resize absolute inset-0 h-full w-full ${
            enabled && status !== 'off' ? 'block' : 'hidden'
          }`}
        />
        {(!enabled || status === 'off' || status === 'permission_denied') && (
          <div className="flex h-full w-full items-center justify-center text-stone-500">
            <CameraOff className="h-4 w-4" />
          </div>
        )}
      </div>

      {/* Always-Visible Line Adjustment Buttons */}
      <div className="flex flex-col gap-1 font-mono text-[10px]">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setThresholdY((v) => Math.max(0.15, +(v - 0.05).toFixed(2)))}
            className="flex items-center justify-center rounded-lg border border-stone-700 bg-stone-800 p-1.5 text-stone-200 hover:bg-stone-700"
            title="Move Line Up"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setThresholdY((v) => Math.min(0.88, +(v + 0.05).toFixed(2)))}
            className="flex items-center justify-center rounded-lg border border-stone-700 bg-stone-800 p-1.5 text-stone-200 hover:bg-stone-700"
            title="Move Line Down"
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleCalibrateLine}
            className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-950/60 px-2 py-1 font-bold text-emerald-300 hover:bg-emerald-900/60"
            title="Auto-snap line below your face"
          >
            <Crosshair className="h-3 w-3" />
            <span>Set Line</span>
          </button>
          <button
            onClick={startCamera}
            className="rounded-lg border border-stone-700 bg-stone-800 p-1 text-stone-400 hover:text-white"
            title="Restart Camera"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  )
}
