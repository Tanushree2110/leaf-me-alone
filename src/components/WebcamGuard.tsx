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

interface DetectedFace {
  boundingBox: DOMRectReadOnly
  landmarks?: Array<{ type: string; locations: Array<{ x: number; y: number }> }>
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
  const faceDetectorRef = useRef<{ detect: (v: HTMLVideoElement) => Promise<DetectedFace[]> } | null>(null)

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

  // Smoothed Eye Line Y/X position (0..1 from top of camera frame)
  const smoothedEyeYRef = useRef<number>(0.42)
  const smoothedEyeXRef = useRef<number>(0.5)
  const autoCalibratedRef = useRef<boolean>(false)

  // Adjustable threshold line Y position
  const [thresholdY, setThresholdY] = useState<number>(0.52)
  const thresholdYRef = useRef<number>(0.52)
  useEffect(() => {
    thresholdYRef.current = thresholdY
  }, [thresholdY])

  const belowLineStartMsRef = useRef<number | null>(null)
  const awayStartMsRef = useRef<number | null>(null)
  const lastAlertTimeRef = useRef<number>(0)
  const lastKeydownMsRef = useRef<number>(0)

  // Try initializing native Chrome FaceDetector if available
  useEffect(() => {
    try {
      const Win = window as unknown as {
        FaceDetector?: new (opts?: { fastMode?: boolean; maxDetectedFaces?: number }) => {
          detect: (v: HTMLVideoElement) => Promise<DetectedFace[]>
        }
      }
      if (Win.FaceDetector) {
        faceDetectorRef.current = new Win.FaceDetector({ fastMode: true, maxDetectedFaces: 1 })
      }
    } catch {}
  }, [])

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

  // Click anywhere on video to move the line
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const clickY = (e.clientY - rect.top) / rect.height
    const clamped = Math.max(0.12, Math.min(0.9, +clickY.toFixed(2)))
    setThresholdY(clamped)
    belowLineStartMsRef.current = null
  }

  // Snap line just below your current eye position
  const handleCalibrateLine = () => {
    const nextLine = Math.max(0.18, Math.min(0.86, +(smoothedEyeYRef.current + 0.045).toFixed(2)))
    setThresholdY(nextLine)
    belowLineStartMsRef.current = null
    callbacksRef.current.onStatusChange('focused')
    callbacksRef.current.onBackFocused()
  }

  // Persistent CV loop that tracks your EYE LINE directly
  useEffect(() => {
    if (!enabled) return

    let isDetecting = false

    const interval = setInterval(async () => {
      if (isDetecting) return
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

      isDetecting = true
      try {
        let detectedEyeY: number | null = null
        let detectedEyeX: number | null = null
        let isAway = false

        // 1. Try native Chrome FaceDetector first if available
        if (faceDetectorRef.current) {
          try {
            const faces = await faceDetectorRef.current.detect(video)
            if (faces && faces.length > 0) {
              const f = faces[0]
              const vw = video.videoWidth || 320
              const vh = video.videoHeight || 240
              const eyeLandmark = f.landmarks?.find((l) => l.type === 'eye')
              if (eyeLandmark && eyeLandmark.locations.length > 0) {
                detectedEyeY = eyeLandmark.locations[0].y / vh
                detectedEyeX = eyeLandmark.locations[0].x / vw
              } else {
                // Eyes are at ~38% down from top of face bounding box
                detectedEyeY = (f.boundingBox.y + f.boundingBox.height * 0.38) / vh
                detectedEyeX = (f.boundingBox.x + f.boundingBox.width * 0.5) / vw
              }
            }
          } catch {
            faceDetectorRef.current = null
          }
        }

        // 2. Fallback: Direct Eye-Band & Face-Center Tracker on 64x48 canvas
        if (detectedEyeY === null) {
          if (!analysisCanvasRef.current) {
            const c = document.createElement('canvas')
            c.width = 64
            c.height = 48
            analysisCanvasRef.current = c
          }
          const ac = analysisCanvasRef.current
          const actx = ac.getContext('2d', { willReadFrequently: true })
          if (actx) {
            actx.drawImage(video, 0, 0, 64, 48)
            const frame = actx.getImageData(0, 0, 64, 48).data

            // Find the densest cluster of face skin + dark eye/eyebrow contrast in the middle of the frame
            const rowScores = new Float32Array(48)
            let sumX = 0
            let weightX = 0
            let totalSkinPixels = 0

            for (let y = 3; y < 45; y++) {
              let rowSkin = 0
              let rowEyeContrast = 0
              for (let x = 14; x < 50; x++) {
                const i = (y * 64 + x) * 4
                const r = frame[i]
                const g = frame[i + 1]
                const b = frame[i + 2]

                // Strict human skin chroma check (rejects white/yellow walls & grey backgrounds)
                const maxC = Math.max(r, g, b)
                const minC = Math.min(r, g, b)
                const isSkin =
                  r > 75 &&
                  g > 40 &&
                  b > 20 &&
                  r < 245 &&
                  r > g &&
                  g > b * 0.85 &&
                  r - g >= 10 &&
                  r - b >= 18 &&
                  maxC - minC >= 18

                if (isSkin) {
                  rowSkin++
                  totalSkinPixels++
                  const centerBias = 1.2 - Math.abs(x - 32) / 24
                  sumX += (x / 64) * centerBias
                  weightX += centerBias
                }

                // Vertical dark-to-skin contrast (eyes & eyebrows sit directly above/below skin cheeks/forehead!)
                const prevI = ((y - 2) * 64 + x) * 4
                const lumCurr = 0.299 * r + 0.587 * g + 0.114 * b
                const lumAbove =
                  0.299 * frame[prevI] + 0.587 * frame[prevI + 1] + 0.114 * frame[prevI + 2]
                if (Math.abs(lumCurr - lumAbove) > 16) {
                  rowEyeContrast++
                }
              }

              // A face row has both skin pixels AND eye/feature contrast
              if (rowSkin >= 3) {
                rowScores[y] = rowSkin * (1 + rowEyeContrast * 0.35)
              }
            }

            if (totalSkinPixels < 18) {
              isAway = true
            } else {
              // Compute the weighted vertical centroid of the face cluster
              let weightedSumY = 0
              let totalRowScore = 0
              for (let y = 3; y < 45; y++) {
                if (rowScores[y] > 0) {
                  weightedSumY += (y / 48) * rowScores[y]
                  totalRowScore += rowScores[y]
                }
              }

              if (totalRowScore > 0) {
                // Shift slightly above the full-face centroid (-0.03) so the dot sits right on your EYES!
                detectedEyeY = Math.max(0.08, weightedSumY / totalRowScore - 0.03)
                detectedEyeX = weightX > 0 ? sumX / weightX : 0.5
              }
            }
          }
        }

        if (!isAway && detectedEyeY !== null && detectedEyeX !== null) {
          // Fast responsive smoothing so when you move your eyes/head down, the dot moves down immediately
          smoothedEyeYRef.current = smoothedEyeYRef.current * 0.35 + detectedEyeY * 0.65
          smoothedEyeXRef.current = smoothedEyeXRef.current * 0.45 + detectedEyeX * 0.55

          if (!autoCalibratedRef.current) {
            autoCalibratedRef.current = true
            const initialLine = Math.max(0.22, Math.min(0.82, +(detectedEyeY + 0.06).toFixed(2)))
            setThresholdY(initialLine)
          }
        }

        const now = Date.now()
        const typingActive = now - lastKeydownMsRef.current < 1500

        const currentEyeY = smoothedEyeYRef.current
        const currentLineY = thresholdYRef.current
        const isBelowLine = !isAway && currentEyeY > currentLineY

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
          if (awaySec >= 2.0) {
            if (curStatus !== 'away_detected') cbStatus('away_detected')
            if (now - lastAlertTimeRef.current > 3500) {
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
            // Turn RED and trigger distraction as soon as eyes stay below the line for 0.45s!
            if (!belowLineStartMsRef.current) belowLineStartMsRef.current = now
            const elapsed = (now - belowLineStartMsRef.current) / 1000

            if (elapsed >= 0.45) {
              if (curStatus !== 'phone_detected') cbStatus('phone_detected')
              if (now - lastAlertTimeRef.current > 3000) {
                lastAlertTimeRef.current = now
                cbPhone()
              }
            }
          }
        } else {
          // Eyes are above the line -> GREEN!
          awayStartMsRef.current = null
          belowLineStartMsRef.current = null
          if (curStatus !== 'focused') {
            cbStatus('focused')
            cbFocused()
          }
        }

        // Draw clean Green / Red visual overlay
        if (overlay) {
          const octx = overlay.getContext('2d')
          if (octx) {
            const W = overlay.width
            const H = overlay.height
            octx.clearRect(0, 0, W, H)

            const linePx = currentLineY * H
            const isRed = (isBelowLine && !typingActive) || isAway

            // Tint below line
            octx.fillStyle = isRed
              ? 'rgba(244, 63, 94, 0.32)'
              : 'rgba(16, 185, 129, 0.08)'
            octx.fillRect(0, linePx, W, H - linePx)

            // Dashed Threshold Line (Turns RED immediately when your eyes cross below it!)
            octx.strokeStyle = isRed ? '#f43f5e' : '#10b981'
            octx.lineWidth = 2.4
            octx.setLineDash([5, 3])
            octx.beginPath()
            octx.moveTo(0, linePx)
            octx.lineTo(W, linePx)
            octx.stroke()
            octx.setLineDash([])

            if (!isAway) {
              const rx = (1 - smoothedEyeXRef.current) * W
              const ry = currentEyeY * H
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
      } finally {
        isDetecting = false
      }
    }, 130)

    return () => clearInterval(interval)
  }, [enabled, startCamera])

  const isRedState = status === 'phone_detected' || status === 'away_detected'

  return (
    <div
      className={`flex items-center gap-2 rounded-2xl border p-2 shadow-2xl backdrop-blur-md transition-colors ${
        isRedState
          ? 'border-rose-500 bg-rose-950/85 ring-2 ring-rose-500/50'
          : 'border-emerald-500/60 bg-stone-900/95'
      }`}
    >
      {/* Live Camera Viewport with Green/Red Status Dot */}
      <div
        className={`relative h-20 w-28 overflow-hidden rounded-xl border-2 bg-stone-950 shrink-0 transition-colors ${
          isRedState ? 'border-rose-500' : 'border-emerald-500'
        }`}
      >
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
            onClick={() => setThresholdY((v) => Math.max(0.12, +(v - 0.05).toFixed(2)))}
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
            title="Auto-snap line below your eyes"
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
