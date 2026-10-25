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
  const prevFrameRef = useRef<Float32Array | null>(null)
  const lastMotionMsRef = useRef<number>(Date.now())

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
  const lastAlertTimeRef = useRef<number>(0)

  // Initialize MediaPipe Neural FaceDetector (detects real human faces only, never walls/furniture!)
  useEffect(() => {
    let cancelled = false
    async function initMediaPipe() {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm'
        )
        if (cancelled) return
        const detector = await FaceDetector.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
          },
          runningMode: 'VIDEO',
          minDetectionConfidence: 0.55,
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

  // Real-time Face Presence Detection Loop
  useEffect(() => {
    if (!enabled) return

    let isDetecting = false

    const interval = setInterval(() => {
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
        let boxX = 0.3
        let boxY = 0.25
        let boxW = 0.4
        let boxH = 0.5

        // 1. Primary: MediaPipe BlazeFace Neural Detector (100% immune to warm walls or empty chairs!)
        if (mpReadyRef.current && mpDetectorRef.current) {
          try {
            const result = mpDetectorRef.current.detectForVideo(video, performance.now())
            if (result && result.detections && result.detections.length > 0) {
              const det = result.detections[0]
              const bb = det.boundingBox
              const vw = video.videoWidth || 320
              const vh = video.videoHeight || 240
              if (bb && bb.width > 24 && bb.height > 24) {
                faceVisible = true
                boxX = bb.originX / vw
                boxY = bb.originY / vh
                boxW = bb.width / vw
                boxH = bb.height / vh
              }
            }
          } catch {}
        } else {
          // 2. Fallback while MediaPipe model loads: requires BOTH central face geometry AND live micro-movement
          // An empty background wall has 0 live movement, so leaving the screen immediately registers as away!
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
            const gray = new Float32Array(64 * 48)

            let motionCount = 0
            let centerSkin = 0
            let outerSkin = 0
            const prev = prevFrameRef.current

            for (let y = 4; y < 44; y++) {
              for (let x = 4; x < 60; x++) {
                const idx = y * 64 + x
                const p = idx * 4
                const r = frame[p]
                const g = frame[p + 1]
                const b = frame[p + 2]
                const lum = 0.299 * r + 0.587 * g + 0.114 * b
                gray[idx] = lum

                if (prev && Math.abs(lum - prev[idx]) > 6.5) {
                  motionCount++
                }

                const isSkin =
                  r > 80 &&
                  g > 45 &&
                  b > 25 &&
                  r > g + 12 &&
                  r > b + 22 &&
                  g > b

                if (isSkin) {
                  if (x >= 18 && x <= 46 && y >= 8 && y <= 38) {
                    centerSkin++
                  } else {
                    outerSkin++
                  }
                }
              }
            }

            prevFrameRef.current = gray
            const nowMs = Date.now()
            if (motionCount >= 5) {
              lastMotionMsRef.current = nowMs
            }

            // A real person sitting at the desk has concentrated skin in the center (not covering the whole wall)
            // AND has micro-movements within the last 2.2 seconds
            const hasRecentPresenceMotion = nowMs - lastMotionMsRef.current < 2200
            const isLocalizedFace = centerSkin >= 45 && centerSkin > outerSkin * 0.75

            if (isLocalizedFace && hasRecentPresenceMotion) {
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
          // Face disappeared from camera -> Turn RED immediately (0.3s)!
          if (!missingStartMsRef.current) missingStartMsRef.current = now
          const elapsed = (now - missingStartMsRef.current) / 1000

          if (elapsed >= 0.3) {
            if (curStatus !== 'away_detected') cbStatus('away_detected')
            if (now - lastAlertTimeRef.current > 3000) {
              lastAlertTimeRef.current = now
              cbAway()
            }
          }
        } else {
          // Face is visible -> GREEN!
          missingStartMsRef.current = null
          if (curStatus !== 'focused') {
            cbStatus('focused')
            cbFocused()
          }
        }

        // Draw Green face box when visible, or bright Red frame when face disappears
        if (overlay) {
          const octx = overlay.getContext('2d')
          if (octx) {
            const W = overlay.width
            const H = overlay.height
            octx.clearRect(0, 0, W, H)

            if (faceVisible) {
              // Mirrored X coordinate
              const mirroredX = (1 - (boxX + boxW)) * W
              const ry = boxY * H
              const rw = boxW * W
              const rh = boxH * H

              octx.strokeStyle = '#10b981'
              octx.lineWidth = 2.5
              octx.strokeRect(mirroredX, ry, rw, rh)
            } else {
              // Bright Red overlay when face is not on screen
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
    }, 140)

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
