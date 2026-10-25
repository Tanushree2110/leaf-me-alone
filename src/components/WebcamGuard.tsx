import React, { useCallback, useEffect, useRef } from 'react'
import { CameraOff, RefreshCw } from 'lucide-react'
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
  const faceDetectorRef = useRef<{
    detect: (v: HTMLVideoElement) => Promise<DetectedFace[]>
  } | null>(null)

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

  // Try initializing native Chrome FaceDetector if available
  useEffect(() => {
    try {
      const Win = window as unknown as {
        FaceDetector?: new (opts?: { fastMode?: boolean; maxDetectedFaces?: number }) => {
          detect: (v: HTMLVideoElement) => Promise<DetectedFace[]>
        }
      }
      if (Win.FaceDetector) {
        faceDetectorRef.current = new Win.FaceDetector({
          fastMode: true,
          maxDetectedFaces: 1,
        })
      }
    } catch {}
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

  // Pure Face Presence Loop:
  // Face visible in camera -> GREEN!
  // Face disappears from camera -> RED immediately & drops leaf!
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
        let faceVisible = false
        let faceCenterX = 0.5
        let faceCenterY = 0.5
        let faceBoxW = 0.35
        let faceBoxH = 0.45

        // 1. Native Chrome FaceDetector if supported
        if (faceDetectorRef.current) {
          try {
            const faces = await faceDetectorRef.current.detect(video)
            if (faces && faces.length > 0) {
              const b = faces[0].boundingBox
              const vw = video.videoWidth || 320
              const vh = video.videoHeight || 240
              faceVisible = true
              faceCenterX = (b.x + b.width * 0.5) / vw
              faceCenterY = (b.y + b.height * 0.5) / vh
              faceBoxW = b.width / vw
              faceBoxH = b.height / vh
            }
          } catch {
            faceDetectorRef.current = null
          }
        }

        // 2. Fallback: Skin + Facial Feature Contrast Detector on 64x48 frame
        if (!faceDetectorRef.current) {
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

            let skinPixels = 0
            let featureEdges = 0
            let sumX = 0
            let sumY = 0

            for (let y = 4; y < 44; y++) {
              for (let x = 10; x < 54; x++) {
                const i = (y * 64 + x) * 4
                const r = frame[i]
                const g = frame[i + 1]
                const b = frame[i + 2]

                const maxC = Math.max(r, g, b)
                const minC = Math.min(r, g, b)

                // Human skin tone check (rejects walls, ceilings, dark rooms, covered camera)
                const isSkin =
                  r > 72 &&
                  g > 38 &&
                  b > 20 &&
                  r < 248 &&
                  r > g &&
                  g > b * 0.82 &&
                  r - g >= 9 &&
                  r - b >= 16 &&
                  maxC - minC >= 16

                if (isSkin) {
                  skinPixels++
                  sumX += x / 64
                  sumY += y / 48

                  // Check if there is facial detail (eyes, eyebrows, glasses, nose/mouth shadow) nearby
                  const upI = ((y - 2) * 64 + x) * 4
                  const diff =
                    Math.abs(r - frame[upI]) +
                    Math.abs(g - frame[upI + 1]) +
                    Math.abs(b - frame[upI + 2])
                  if (diff > 42) {
                    featureEdges++
                  }
                }
              }
            }

            // Require both a contiguous cluster of face skin pixels AND facial feature contrast
            if (skinPixels >= 36 && featureEdges >= 5) {
              faceVisible = true
              faceCenterX = sumX / skinPixels
              faceCenterY = sumY / skinPixels
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
          // Face disappeared from camera! Turn RED after a brief 0.4s debounce
          if (!missingStartMsRef.current) missingStartMsRef.current = now
          const elapsed = (now - missingStartMsRef.current) / 1000

          if (elapsed >= 0.4) {
            if (curStatus !== 'away_detected') cbStatus('away_detected')
            if (now - lastAlertTimeRef.current > 3200) {
              lastAlertTimeRef.current = now
              cbAway()
            }
          }
        } else {
          // Face is visible on camera -> GREEN!
          missingStartMsRef.current = null
          if (curStatus !== 'focused') {
            cbStatus('focused')
            cbFocused()
          }
        }

        // Draw clean Green (Face Visible) or Red (Face Disappeared) box on overlay
        if (overlay) {
          const octx = overlay.getContext('2d')
          if (octx) {
            const W = overlay.width
            const H = overlay.height
            octx.clearRect(0, 0, W, H)

            if (faceVisible) {
              const rx = (1 - faceCenterX) * W
              const ry = faceCenterY * H
              const bw = Math.max(32, faceBoxW * W)
              const bh = Math.max(36, faceBoxH * H)

              octx.strokeStyle = '#10b981'
              octx.lineWidth = 2.2
              octx.strokeRect(rx - bw / 2, ry - bh / 2, bw, bh)
            } else {
              // Red wash when face disappears
              octx.fillStyle = 'rgba(244, 63, 94, 0.28)'
              octx.fillRect(0, 0, W, H)
            }
          }
        }
      } finally {
        isDetecting = false
      }
    }, 150)

    return () => clearInterval(interval)
  }, [enabled, startCamera])

  const isRedState = status === 'away_detected' || status === 'phone_detected'

  return (
    <div
      className={`flex items-center gap-1.5 rounded-2xl border p-1.5 shadow-2xl backdrop-blur-md transition-colors ${
        isRedState
          ? 'border-rose-500 bg-rose-950/90 ring-2 ring-rose-500/50'
          : 'border-emerald-500/60 bg-stone-900/95'
      }`}
    >
      {/* Live Camera Viewport: Green when Face Visible, Red when Face Disappears */}
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
