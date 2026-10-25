import React, { useCallback, useEffect, useRef } from 'react'
import { CameraOff, RefreshCw } from 'lucide-react'
import { FaceDetector, FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision'
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
  const streamRef = useRef<MediaStream | null>(null)
  const segmenterRef = useRef<ImageSegmenter | null>(null)
  const faceDetectorRef = useRef<FaceDetector | null>(null)
  const modelsReadyRef = useRef<boolean>(false)
  const lastTimestampMsRef = useRef<number>(0)

  const hasTriggeredForCurrentAbsenceRef = useRef<boolean>(false)
  const missingStartMsRef = useRef<number | null>(null)

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

  // Initialize BOTH MediaPipe SelfieSegmenter (detects a human person/body at any angle)
  // AND MediaPipe FaceDetector from local /wasm and /models
  useEffect(() => {
    let cancelled = false
    async function initMediaPipe() {
      try {
        const vision = await FilesetResolver.forVisionTasks('/wasm')
        if (cancelled) return

        const [segmenter, faceDetector] = await Promise.all([
          ImageSegmenter.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: '/models/selfie_segmenter.tflite',
            },
            runningMode: 'VIDEO',
            outputCategoryMask: true,
            outputConfidenceMasks: true,
          }).catch(() => null),
          FaceDetector.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: '/models/blaze_face_short_range.tflite',
            },
            runningMode: 'VIDEO',
            minDetectionConfidence: 0.25,
          }).catch(() => null),
        ])

        if (!cancelled) {
          segmenterRef.current = segmenter
          faceDetectorRef.current = faceDetector
          modelsReadyRef.current = Boolean(segmenter || faceDetector)
        }
      } catch {
        modelsReadyRef.current = false
      }
    }
    initMediaPipe()
    return () => {
      cancelled = true
      try {
        segmenterRef.current?.close()
        faceDetectorRef.current?.close()
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

  // Real-time Person & Face Presence Loop
  useEffect(() => {
    if (!enabled) return

    let isDetecting = false

    const interval = setInterval(() => {
      if (
        typeof document !== 'undefined' &&
        (document.hidden || /Electron|Cursor/i.test(navigator.userAgent))
      ) {
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

      if (!modelsReadyRef.current) return

      isDetecting = true
      try {
        let personVisible = false
        let boxX = 0.2
        let boxY = 0.12
        let boxW = 0.6
        let boxH = 0.78

        const nowPerf = Math.max(
          lastTimestampMsRef.current + 2,
          Math.floor(performance.now())
        )
        lastTimestampMsRef.current = nowPerf

        // 1. Check MediaPipe SelfieSegmenter (detects a human person in the camera even if looking down or sideways!)
        if (segmenterRef.current) {
          try {
            const segResult = segmenterRef.current.segmentForVideo(video, nowPerf)
            const confMasks = segResult?.confidenceMasks
            if (confMasks && confMasks.length > 0) {
              const mask = confMasks[0]
              const floatArr = mask.getAsFloat32Array()
              const mW = mask.width
              const mH = mask.height
              const total = floatArr.length

              let personPixels = 0
              let minX = mW, maxX = 0, minY = mH, maxY = 0
              // Step by 4 pixels for super-fast evaluation
              for (let y = 0; y < mH; y += 2) {
                const rowOff = y * mW
                for (let x = 0; x < mW; x += 2) {
                  if (floatArr[rowOff + x] > 0.45) {
                    personPixels += 4
                    if (x < minX) minX = x
                    if (x > maxX) maxX = x
                    if (y < minY) minY = y
                    if (y > maxY) maxY = y
                  }
                }
              }

              const personAreaRatio = personPixels / Math.max(1, total)
              // If at least 6% of the camera frame contains a human person -> Person is visible!
              if (personAreaRatio >= 0.06) {
                personVisible = true
                boxX = minX / mW
                boxY = minY / mH
                boxW = Math.max(0.2, (maxX - minX) / mW)
                boxH = Math.max(0.25, (maxY - minY) / mH)
              }
            }
            segResult?.close()
          } catch {}
        }

        // 2. Also check MediaPipe FaceDetector
        if (faceDetectorRef.current) {
          try {
            const faceRes = faceDetectorRef.current.detectForVideo(video, nowPerf + 1)
            if (faceRes && faceRes.detections && faceRes.detections.length > 0) {
              const bb = faceRes.detections[0].boundingBox
              const vw = video.videoWidth || 320
              const vh = video.videoHeight || 240
              if (bb && bb.width >= 16 && bb.height >= 16) {
                personVisible = true
                boxX = bb.originX / vw
                boxY = bb.originY / vh
                boxW = bb.width / vw
                boxH = bb.height / vh
              }
            }
          } catch {}
        }

        const now = Date.now()
        const {
          status: curStatus,
          onStatusChange: cbStatus,
          onAwayDetected: cbAway,
          onBackFocused: cbFocused,
        } = callbacksRef.current

        if (!personVisible) {
          // As soon as no person is visible on camera for 0.6s -> TURN RED immediately!
          if (!missingStartMsRef.current) missingStartMsRef.current = now
          const elapsed = (now - missingStartMsRef.current) / 1000

          if (elapsed >= 0.6) {
            if (curStatus !== 'away_detected') {
              cbStatus('away_detected')
            }
            if (!hasTriggeredForCurrentAbsenceRef.current) {
              hasTriggeredForCurrentAbsenceRef.current = true
              cbAway()
            }
          }
        } else {
          // Person is visible on camera -> Immediately GREEN!
          missingStartMsRef.current = null
          hasTriggeredForCurrentAbsenceRef.current = false
          if (curStatus !== 'focused') {
            cbStatus('focused')
          }
          cbFocused()
        }

        // Draw Green box when person is visible, or Red frame when no person is visible
        if (overlay) {
          const octx = overlay.getContext('2d')
          if (octx) {
            const W = overlay.width
            const H = overlay.height
            octx.clearRect(0, 0, W, H)

            const showRed =
              !personVisible &&
              missingStartMsRef.current !== null &&
              now - missingStartMsRef.current >= 600

            if (!showRed) {
              const mirroredX = (1 - (boxX + boxW)) * W
              const ry = boxY * H
              const rw = boxW * W
              const rh = boxH * H

              octx.strokeStyle = '#10b981'
              octx.lineWidth = 2.5
              octx.strokeRect(mirroredX, ry, rw, rh)
            } else {
              octx.fillStyle = 'rgba(244, 63, 94, 0.48)'
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
    }, 150)

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
