import React, { useCallback, useEffect, useRef } from 'react'
import { CameraOff, RefreshCw } from 'lucide-react'
import { FaceDetector, FilesetResolver } from '@mediapipe/tasks-vision'
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
  onAwayDetected,
  onBackFocused,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const analysisCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const mpDetectorRef = useRef<FaceDetector | null>(null)
  const mpReadyRef = useRef<boolean>(false)
  const lastTimestampMsRef = useRef<number>(0)

  // Only fire a NEW camera violation once per actual absence episode (must return to screen before another can fire!)
  const hasTriggeredForCurrentAbsenceRef = useRef<boolean>(false)

  const callbacksRef = useRef({
    status,
    onStatusChange,
    onAwayDetected,
    onBackFocused,
  })
  useEffect(() => {
    callbacksRef.current = {
      status,
      onStatusChange,
      onAwayDetected,
      onBackFocused,
    }
  }, [status, onStatusChange, onAwayDetected, onBackFocused])

  const missingStartMsRef = useRef<number | null>(null)

  // Initialize local MediaPipe Neural FaceDetector from /wasm and /models
  useEffect(() => {
    let cancelled = false
    async function initMediaPipe() {
      try {
        const vision = await FilesetResolver.forVisionTasks('/wasm')
        if (cancelled) return
        const detector = await FaceDetector.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: '/models/blaze_face_short_range.tflite',
          },
          runningMode: 'VIDEO',
          minDetectionConfidence: 0.25,
        })
        if (!cancelled) {
          mpDetectorRef.current = detector
          mpReadyRef.current = true
        }
      } catch {
        mpReadyRef.current = false
      }
    }
    initMediaPipe()
    return () => {
      cancelled = true
      try {
        mpDetectorRef.current?.close()
      } catch {}
    }
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
      hasTriggeredForCurrentAbsenceRef.current = false
      missingStartMsRef.current = null
      callbacksRef.current.onStatusChange('focused')
      callbacksRef.current.onBackFocused()
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

  // Real-time Face Presence Detection Loop
  useEffect(() => {
    if (!enabled) return

    let isDetecting = false

    const interval = setInterval(() => {
      // NEVER run camera penalties while user is working on another existing allowed browser tab!
      if (typeof document !== 'undefined' && document.hidden) {
        missingStartMsRef.current = null
        return
      }

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
      if (video.readyState < 2 || video.videoWidth === 0) return

      isDetecting = true
      try {
        let faceVisible = false
        let boxX = 0.26
        let boxY = 0.18
        let boxW = 0.48
        let boxH = 0.62

        // 1. Primary: Local MediaPipe BlazeFace Neural Detector
        if (mpReadyRef.current && mpDetectorRef.current) {
          try {
            const nowPerf = Math.max(
              lastTimestampMsRef.current + 1,
              Math.floor(performance.now())
            )
            lastTimestampMsRef.current = nowPerf
            const result = mpDetectorRef.current.detectForVideo(video, nowPerf)
            if (result && result.detections && result.detections.length > 0) {
              const det = result.detections[0]
              const bb = det.boundingBox
              const vw = video.videoWidth || 320
              const vh = video.videoHeight || 240
              if (bb && bb.width > 14 && bb.height > 14) {
                faceVisible = true
                boxX = bb.originX / vw
                boxY = bb.originY / vh
                boxW = bb.width / vw
                boxH = bb.height / vh
              }
            }
          } catch {}
        }

        // 2. Secondary Check: Even if MediaPipe misses a tilted/side-profile face for a moment,
        // check if a clear human foreground silhouette is still sitting in the center of the frame
        if (!faceVisible) {
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

            // Sample top-left & top-right corner background
            let bgR = 0, bgG = 0, bgB = 0, bgCount = 0
            for (let y = 1; y < 8; y++) {
              for (let x = 1; x < 8; x++) {
                const p1 = (y * 64 + x) * 4
                const p2 = (y * 64 + (63 - x)) * 4
                bgR += frame[p1] + frame[p2]
                bgG += frame[p1 + 1] + frame[p2 + 1]
                bgB += frame[p1 + 2] + frame[p2 + 2]
                bgCount += 2
              }
            }
            bgR /= bgCount
            bgG /= bgCount
            bgB /= bgCount

            let fgPixels = 0
            let skinPixels = 0
            for (let y = 8; y < 42; y++) {
              for (let x = 16; x < 48; x++) {
                const p = (y * 64 + x) * 4
                const r = frame[p]
                const g = frame[p + 1]
                const b = frame[p + 2]
                const diff =
                  Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB)
                if (diff > 48) fgPixels++
                if (r > 70 && g > 35 && b > 18 && r > g + 8 && r > b + 14) {
                  skinPixels++
                }
              }
            }

            if (fgPixels >= 160 && skinPixels >= 28) {
              faceVisible = true
            }
          }
        }

        const now = Date.now()
        const {
          status: curStatus,
          onStatusChange: cbStatus,
          onAwayDetected: cbAway,
          onBackFocused: cbFocused,
        } = callbacksRef.current

        if (!faceVisible) {
          // Require 3.0 continuous seconds of no face on camera before triggering RED!
          // This completely eliminates random false-red flashes while sitting at your desk.
          if (!missingStartMsRef.current) missingStartMsRef.current = now
          const elapsed = (now - missingStartMsRef.current) / 1000

          if (elapsed >= 3.0) {
            if (curStatus !== 'away_detected') {
              cbStatus('away_detected')
            }
            if (!hasTriggeredForCurrentAbsenceRef.current) {
              hasTriggeredForCurrentAbsenceRef.current = true
              cbAway()
            }
          }
        } else {
          // Face is visible -> GREEN!
          missingStartMsRef.current = null
          hasTriggeredForCurrentAbsenceRef.current = false
          if (curStatus !== 'focused') {
            cbStatus('focused')
          }
          cbFocused()
        }

        // Draw Green face box when visible, or Red frame when away >= 3.0s
        if (overlay) {
          const octx = overlay.getContext('2d')
          if (octx) {
            const W = overlay.width
            const H = overlay.height
            octx.clearRect(0, 0, W, H)

            const showRed =
              !faceVisible &&
              missingStartMsRef.current !== null &&
              now - missingStartMsRef.current >= 3000

            if (!showRed) {
              const mirroredX = (1 - (boxX + boxW)) * W
              const ry = boxY * H
              const rw = boxW * W
              const rh = boxH * H

              octx.strokeStyle = '#10b981'
              octx.lineWidth = 2.5
              octx.strokeRect(mirroredX, ry, rw, rh)
            } else {
              octx.fillStyle = 'rgba(244, 63, 94, 0.42)'
              octx.fillRect(0, 0, W, H)
              octx.strokeStyle = '#f43f5e'
              octx.lineWidth = 4
              octx.strokeRect(2, 2, W - 4, H - 4)
            }
          }
        }
      } finally {
        isDetecting = false
      }
    }, 200)

    return () => clearInterval(interval)
  }, [enabled, startCamera])

  const isRedState = status === 'away_detected' || status === 'phone_detected'

  return (
    <div
      className={`flex items-center gap-1.5 rounded-2xl border-2 p-1.5 shadow-2xl backdrop-blur-md transition-all ${
        isRedState
          ? 'border-rose-500 bg-rose-950/95 ring-4 ring-rose-500/50'
          : 'border-emerald-500/80 bg-stone-900/95'
      }`}
    >
      <div
        className={`relative h-20 w-28 overflow-hidden rounded-xl border-2 bg-stone-950 shrink-0 transition-colors ${
          isRedState ? 'border-rose-500' : 'border-emerald-500'
        }`}
      >
        <span
          className={`absolute top-1.5 left-1.5 z-10 h-3 w-3 rounded-full shadow ${
            isRedState ? 'bg-rose-500 animate-ping' : 'bg-emerald-400'
          }`}
        />
        <span
          className={`absolute top-1.5 left-1.5 z-10 h-3 w-3 rounded-full ${
            isRedState ? 'bg-rose-500' : 'bg-emerald-400'
          }`}
        />

        <button
          onClick={startCamera}
          className="absolute top-1 right-1 z-10 rounded bg-black/50 p-1 text-stone-300 hover:bg-black/80 hover:text-white"
          title="Restart Camera"
        >
          <RefreshCw className="h-2.5 w-2.5" />
        </button>

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
          className={`pointer-events-none absolute inset-0 h-full w-full ${
            enabled && status !== 'off' ? 'block' : 'hidden'
          }`}
        />
        {(!enabled || status === 'off' || status === 'permission_denied') && (
          <div className="flex h-full w-full items-center justify-center text-stone-500">
            <CameraOff className="h-4 w-4" />
          </div>
        )}
      </div>
    </div>
  )
}
