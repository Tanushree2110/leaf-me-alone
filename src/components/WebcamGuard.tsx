import React, { useEffect, useRef, useState } from 'react'
import { CameraOff, RefreshCw } from 'lucide-react'
import { FaceDetector, FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision'

interface WebcamGuardProps {
  enabled: boolean
  onPresenceChange: (present: boolean) => void
}

/** Normalized (0..1) box in the raw, un-mirrored camera frame. */
type Box = { x: number; y: number; w: number; h: number }

const CHECK_INTERVAL_MS = 150
const ABSENT_AFTER_MS = 1000
const PERSON_PIXEL_THRESHOLD = 0.5
const PERSON_MIN_COVERAGE = 0.05
const FACE_MIN_SCORE = 0.5

export const WebcamGuard: React.FC<WebcamGuardProps> = ({ enabled, onPresenceChange }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const overlayRef = useRef<HTMLCanvasElement | null>(null)
  const segmenterRef = useRef<ImageSegmenter | null>(null)
  const faceDetectorRef = useRef<FaceDetector | null>(null)
  const lastTimestampRef = useRef(0)
  const lastSeenAtRef = useRef(Date.now())
  const presentRef = useRef(true)
  const onPresenceChangeRef = useRef(onPresenceChange)
  onPresenceChangeRef.current = onPresenceChange

  const [present, setPresent] = useState(true)
  const [modelsReady, setModelsReady] = useState(false)
  const [cameraState, setCameraState] = useState<'starting' | 'live' | 'blocked'>('starting')
  const [restartKey, setRestartKey] = useState(0)

  const reportPresence = (next: boolean) => {
    if (presentRef.current === next) return
    presentRef.current = next
    setPresent(next)
    onPresenceChangeRef.current(next)
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks('/wasm')
        const [segmenter, faceDetector] = await Promise.all([
          ImageSegmenter.createFromOptions(vision, {
            baseOptions: { modelAssetPath: '/models/selfie_segmenter.tflite' },
            runningMode: 'VIDEO',
            outputCategoryMask: false,
            outputConfidenceMasks: true,
          }).catch(() => null),
          FaceDetector.createFromOptions(vision, {
            baseOptions: { modelAssetPath: '/models/blaze_face_short_range.tflite' },
            runningMode: 'VIDEO',
            minDetectionConfidence: 0.4,
          }).catch(() => null),
        ])
        if (cancelled) {
          segmenter?.close()
          faceDetector?.close()
          return
        }
        segmenterRef.current = segmenter
        faceDetectorRef.current = faceDetector
        setModelsReady(Boolean(segmenter || faceDetector))
      } catch {}
    })()
    return () => {
      cancelled = true
      try {
        segmenterRef.current?.close()
        faceDetectorRef.current?.close()
      } catch {}
      segmenterRef.current = null
      faceDetectorRef.current = null
    }
  }, [])

  // Camera hardware is only on while enabled (Pomodoro focus running).
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let stream: MediaStream | null = null
    lastSeenAtRef.current = Date.now()
    presentRef.current = true
    setPresent(true)
    setCameraState('starting')

    navigator.mediaDevices
      .getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop())
          return
        }
        stream = s
        s.getVideoTracks().forEach((t) => {
          t.onended = () => {
            if (!cancelled) setCameraState('blocked')
          }
        })
        const video = videoRef.current
        if (video) {
          video.srcObject = s
          video.play().catch(() => {})
        }
        setCameraState('live')
      })
      .catch(() => {
        if (!cancelled) setCameraState('blocked')
      })

    return () => {
      cancelled = true
      stream?.getTracks().forEach((t) => {
        try {
          t.stop()
        } catch {}
      })
      const video = videoRef.current
      if (video) {
        try {
          video.pause()
          video.srcObject = null
        } catch {}
      }
    }
  }, [enabled, restartKey])

  useEffect(() => {
    if (!enabled) return
    let busy = false

    const drawOverlay = (box: Box | null, isFace: boolean, vw: number, vh: number) => {
      const canvas = overlayRef.current
      if (!canvas) return
      const cw = canvas.clientWidth
      const ch = canvas.clientHeight
      if (!cw || !ch) return
      const dpr = window.devicePixelRatio || 1
      if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
        canvas.width = Math.round(cw * dpr)
        canvas.height = Math.round(ch * dpr)
      }
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, cw, ch)

      if (!presentRef.current) {
        ctx.fillStyle = 'rgba(244, 63, 94, 0.45)'
        ctx.fillRect(0, 0, cw, ch)
        return
      }
      if (!box) return

      // The <video> is object-cover + mirrored, so map the raw-frame box the same way.
      const scale = Math.max(cw / vw, ch / vh)
      const dw = vw * scale
      const dh = vh * scale
      const ox = (cw - dw) / 2
      const oy = (ch - dh) / 2
      const x = ox + (1 - box.x - box.w) * dw
      const y = oy + box.y * dh
      ctx.strokeStyle = '#10b981'
      ctx.lineWidth = 2
      ctx.setLineDash(isFace ? [] : [4, 3])
      ctx.strokeRect(x, y, box.w * dw, box.h * dh)
    }

    const interval = setInterval(() => {
      if (busy) return
      const video = videoRef.current
      const segmenter = segmenterRef.current
      const faceDetector = faceDetectorRef.current
      const canCheck =
        !document.hidden &&
        video !== null &&
        video.readyState >= 2 &&
        video.videoWidth > 0 &&
        (segmenter !== null || faceDetector !== null)

      // Never judge presence without a live frame and a loaded model.
      if (!canCheck) {
        lastSeenAtRef.current = Date.now()
        return
      }

      busy = true
      try {
        const vw = video.videoWidth
        const vh = video.videoHeight
        const ts = Math.max(lastTimestampRef.current + 1, Math.floor(performance.now()))
        lastTimestampRef.current = ts
        let faceBox: Box | null = null
        let bodyBox: Box | null = null

        if (faceDetector) {
          try {
            const result = faceDetector.detectForVideo(video, ts)
            for (const det of result.detections ?? []) {
              const bb = det.boundingBox
              const score = det.categories?.[0]?.score ?? 1
              if (!bb || score < FACE_MIN_SCORE || bb.width < 12) continue
              faceBox = { x: bb.originX / vw, y: bb.originY / vh, w: bb.width / vw, h: bb.height / vh }
              break
            }
          } catch {}
        }

        if (segmenter) {
          try {
            const result = segmenter.segmentForVideo(video, ts)
            const masks = result.confidenceMasks
            if (masks && masks.length > 0) {
              // Single-channel selfie model -> [background, person]; person is always last.
              const mask = masks[masks.length - 1]
              const data = mask.getAsFloat32Array()
              const mw = mask.width
              const mh = mask.height
              const step = Math.max(1, Math.round(Math.min(mw, mh) / 64))
              let samples = 0
              let hits = 0
              let minX = mw
              let maxX = -1
              let minY = mh
              let maxY = -1
              for (let y = 0; y < mh; y += step) {
                const row = y * mw
                for (let x = 0; x < mw; x += step) {
                  samples++
                  if (data[row + x] > PERSON_PIXEL_THRESHOLD) {
                    hits++
                    if (x < minX) minX = x
                    if (x > maxX) maxX = x
                    if (y < minY) minY = y
                    if (y > maxY) maxY = y
                  }
                }
              }
              if (samples > 0 && hits / samples >= PERSON_MIN_COVERAGE) {
                bodyBox = {
                  x: minX / mw,
                  y: minY / mh,
                  w: Math.min(1, (maxX - minX + step) / mw),
                  h: Math.min(1, (maxY - minY + step) / mh),
                }
              }
            }
            result.close()
          } catch {}
        }

        const now = Date.now()
        if (faceBox || bodyBox) {
          lastSeenAtRef.current = now
          reportPresence(true)
        } else if (now - lastSeenAtRef.current >= ABSENT_AFTER_MS) {
          reportPresence(false)
        }
        drawOverlay(faceBox ?? bodyBox, faceBox !== null, vw, vh)
      } finally {
        busy = false
      }
    }, CHECK_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [enabled, restartKey])

  if (!enabled) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-stone-800 bg-stone-900/90 px-3 py-2 font-mono text-[11px] text-stone-400 shadow-lg backdrop-blur-md">
        <CameraOff className="h-3.5 w-3.5 text-stone-500" />
        <span>Camera off · starts with Pomodoro</span>
      </div>
    )
  }

  const isAway = !present
  const caption =
    cameraState === 'blocked'
      ? 'Camera blocked'
      : cameraState === 'starting' || !modelsReady
      ? 'Starting…'
      : isAway
      ? 'Not in camera'
      : "You're here"

  return (
    <div
      data-camera-presence={isAway ? 'away' : 'present'}
      className={`rounded-2xl border-2 p-1.5 shadow-2xl backdrop-blur-md transition-colors ${
        isAway ? 'border-rose-500 bg-rose-950/95 ring-4 ring-rose-500/50' : 'border-emerald-500/80 bg-stone-900/95'
      }`}
    >
      <div
        className={`relative h-24 w-32 overflow-hidden rounded-xl border-2 bg-stone-950 ${
          isAway ? 'border-rose-500' : 'border-emerald-500'
        }`}
      >
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="block h-full w-full -scale-x-100 object-cover"
        />
        <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 block h-full w-full" />
        <button
          onClick={() => setRestartKey((k) => k + 1)}
          className="absolute right-1 top-1 z-10 rounded bg-black/50 p-1 text-stone-300 hover:bg-black/80 hover:text-white"
          title="Restart camera"
        >
          <RefreshCw className="h-2.5 w-2.5" />
        </button>
        <span
          className={`absolute bottom-1 left-1 z-10 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[9px] font-bold ${
            isAway ? 'text-rose-300' : 'text-emerald-300'
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${isAway ? 'bg-rose-500 animate-ping' : 'bg-emerald-400'}`} />
          {caption}
        </span>
      </div>
    </div>
  )
}
