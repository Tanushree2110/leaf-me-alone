import React, { useEffect, useRef } from 'react'
import { FocusMode, LeafNode, RoommateState, RoomUpgrade, VineSegment } from '../types'
import { fbm2D, noise2D } from '../utils/noise'

interface StudioCanvasProps {
  focusMode: FocusMode
  roommateState: RoommateState
  leaves: LeafNode[]
  vineSegments: VineSegment[]
  vineGrowthProgress: number // 0 to 1
  nextLeafProgress: number // 0 to 1 (live progress toward sprouting next leaf)
  upgrades: RoomUpgrade[]
  daysSinceDoomscroll: number
  goldenLeavesPainted: number
  roomTempCelsius: number
  comebackProgress: number // 0 to 1
  dialogueText: string
  canvasRef: React.RefObject<HTMLCanvasElement>
}

interface RainDrop {
  x: number
  y: number
  length: number
  speed: number
}

export const StudioCanvas: React.FC<StudioCanvasProps> = (props) => {
  const { canvasRef } = props

  // Keep latest props in a ref so the 60fps animation loop never resets `t` on state updates!
  const latestPropsRef = useRef<StudioCanvasProps>(props)
  useEffect(() => {
    latestPropsRef.current = props
  }, [props])

  const rainRef = useRef<RainDrop[]>([])
  const lightningRef = useRef<{ alpha: number; nextFlash: number }>({ alpha: 0, nextFlash: 150 })

  useEffect(() => {
    const drops: RainDrop[] = []
    for (let i = 0; i < 85; i++) {
      drops.push({
        x: Math.random() * 300 + 48,
        y: Math.random() * 310 + 48,
        length: 11 + Math.random() * 14,
        speed: 6 + Math.random() * 6,
      })
    }
    rainRef.current = drops
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animId: number
    const startTime = performance.now()

    const render = (now: number) => {
      const {
        focusMode,
        roommateState,
        leaves,
        vineSegments,
        vineGrowthProgress,
        nextLeafProgress,
        upgrades,
        daysSinceDoomscroll,
        goldenLeavesPainted,
        roomTempCelsius,
        comebackProgress,
        dialogueText,
      } = latestPropsRef.current

      const t = (now - startTime) * 0.001
      const W = canvas.width
      const H = canvas.height

      const hasUpgrade = (id: RoomUpgrade['id']) =>
        upgrades.some((u) => u.id === id && u.unlocked)

      ctx.clearRect(0, 0, W, H)

      // 1. STUDIO WALL BACKGROUND
      const isCold = focusMode === 'distracted' || focusMode === 'last_leaf_climax'
      const wallGrad = ctx.createLinearGradient(0, 0, 0, H)
      if (focusMode === 'last_leaf_climax') {
        wallGrad.addColorStop(0, '#131624')
        wallGrad.addColorStop(1, '#1d1b29')
      } else if (isCold) {
        wallGrad.addColorStop(0, '#1a2332')
        wallGrad.addColorStop(1, '#242b38')
      } else {
        wallGrad.addColorStop(0, '#2a211d')
        wallGrad.addColorStop(1, '#3b2d26')
      }
      ctx.fillStyle = wallGrad
      ctx.fillRect(0, 0, W, H)

      // Subtle wallpaper texture stripes
      ctx.strokeStyle = isCold ? 'rgba(148, 163, 184, 0.04)' : 'rgba(251, 191, 36, 0.04)'
      ctx.lineWidth = 2
      for (let x = 24; x < W; x += 36) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, H - 105)
        ctx.stroke()
      }

      // 2. COZY WOODEN FLOOR & BASEBOARD
      const floorY = H - 105
      const floorGrad = ctx.createLinearGradient(0, floorY, 0, H)
      floorGrad.addColorStop(0, isCold ? '#232028' : '#3d281d')
      floorGrad.addColorStop(1, isCold ? '#16141a' : '#261810')
      ctx.fillStyle = floorGrad
      ctx.fillRect(0, floorY, W, 105)

      ctx.fillStyle = isCold ? '#334155' : '#5c3d2e'
      ctx.fillRect(0, floorY - 10, W, 10)
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(0, floorY)
      ctx.lineTo(W, floorY)
      ctx.stroke()

      ctx.strokeStyle = 'rgba(0,0,0,0.22)'
      for (let i = 0; i < 10; i++) {
        const px = i * 95
        ctx.beginPath()
        ctx.moveTo(px, floorY)
        ctx.lineTo((px - W / 2) * 1.35 + W / 2, H)
        ctx.stroke()
      }

      // 3. LEFT PANORAMIC WINDOW & OUTSIDE SKY / BRICK WALL
      const winX = 44
      const winY = 46
      const winW = 296
      const winH = 314

      ctx.save()
      ctx.beginPath()
      ctx.roundRect(winX, winY, winW, winH, [12, 12, 2, 2])
      ctx.clip()

      // Sky gradient outside window
      const skyGrad = ctx.createLinearGradient(winX, winY, winX, winY + winH)
      if (focusMode === 'last_leaf_climax') {
        skyGrad.addColorStop(0, '#090d16')
        skyGrad.addColorStop(0.6, '#172036')
        skyGrad.addColorStop(1, '#23293d')
      } else if (focusMode === 'distracted') {
        skyGrad.addColorStop(0, '#334155')
        skyGrad.addColorStop(0.6, '#475569')
        skyGrad.addColorStop(1, '#64748b')
      } else {
        skyGrad.addColorStop(0, '#0284c7')
        skyGrad.addColorStop(0.55, '#7dd3fc')
        skyGrad.addColorStop(1, '#fef08a')
      }
      ctx.fillStyle = skyGrad
      ctx.fillRect(winX, winY, winW, winH)

      // Sun outside when focused
      if (focusMode === 'locked_in' || focusMode === 'golden_comeback') {
        const sunX = winX + 78 + Math.sin(t * 0.4) * 6
        const sunY = winY + 68
        const sunRadial = ctx.createRadialGradient(sunX, sunY, 8, sunX, sunY, 85)
        sunRadial.addColorStop(0, 'rgba(254, 240, 138, 0.95)')
        sunRadial.addColorStop(0.4, 'rgba(253, 224, 71, 0.45)')
        sunRadial.addColorStop(1, 'rgba(253, 224, 71, 0)')
        ctx.fillStyle = sunRadial
        ctx.beginPath()
        ctx.arc(sunX, sunY, 85, 0, Math.PI * 2)
        ctx.fill()
      }

      // Opposite Greenwich Village Brick Wall (Right side of window view)
      const brickWallX = winX + 194
      ctx.fillStyle = isCold ? '#472825' : '#7c3a2d'
      ctx.fillRect(brickWallX, winY + 22, winW - 194, winH - 22)
      ctx.strokeStyle = 'rgba(20, 10, 8, 0.35)'
      ctx.lineWidth = 1
      for (let by = winY + 22; by < winY + winH; by += 14) {
        ctx.beginPath()
        ctx.moveTo(brickWallX, by)
        ctx.lineTo(winX + winW, by)
        ctx.stroke()
        const offset = ((by / 14) | 0) % 2 === 0 ? 0 : 12
        for (let bx = brickWallX + offset; bx < winX + winW; bx += 24) {
          ctx.beginPath()
          ctx.moveTo(bx, by)
          ctx.lineTo(bx, by + 14)
          ctx.stroke()
        }
      }

      // Permanent Golden Leaf painted on the opposite brick wall (O. Henry Twist)
      if (goldenLeavesPainted > 0 || roommateState === 'painting_golden_leaf') {
        const gX = brickWallX + 48
        const gY = winY + 148
        ctx.save()
        ctx.translate(gX, gY)
        const pulse = 1 + Math.sin(t * 4) * 0.06
        ctx.scale(pulse, pulse)

        const goldGlow = ctx.createRadialGradient(0, 0, 2, 0, 0, 32)
        goldGlow.addColorStop(0, 'rgba(250, 204, 21, 0.85)')
        goldGlow.addColorStop(0.6, 'rgba(234, 179, 8, 0.3)')
        goldGlow.addColorStop(1, 'rgba(234, 179, 8, 0)')
        ctx.fillStyle = goldGlow
        ctx.beginPath()
        ctx.arc(0, 0, 32, 0, Math.PI * 2)
        ctx.fill()

        ctx.fillStyle = '#facc15'
        ctx.strokeStyle = '#ca8a04'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(0, -16)
        ctx.bezierCurveTo(16, -12, 20, 6, 0, 18)
        ctx.bezierCurveTo(-20, 6, -16, -12, 0, -16)
        ctx.fill()
        ctx.stroke()

        ctx.strokeStyle = '#fef08a'
        ctx.lineWidth = 1.2
        ctx.beginPath()
        ctx.moveTo(0, -12)
        ctx.lineTo(0, 14)
        ctx.moveTo(0, -2)
        ctx.lineTo(8, -7)
        ctx.moveTo(0, 4)
        ctx.lineTo(-8, -1)
        ctx.stroke()
        ctx.restore()
      }

      // 4. WEATHER SHADERS OUTSIDE WINDOW (Rain, Thunderstorm Lightning, Frost)
      if (
        focusMode === 'last_leaf_climax' ||
        focusMode === 'distracted' ||
        hasUpgrade('string_lights')
      ) {
        const isStorm = focusMode === 'last_leaf_climax'
        const isLoFiRain = focusMode === 'locked_in' && hasUpgrade('string_lights')

        if (isStorm || isLoFiRain || focusMode === 'distracted') {
          ctx.strokeStyle = isStorm
            ? 'rgba(186, 230, 253, 0.55)'
            : 'rgba(148, 163, 184, 0.28)'
          ctx.lineWidth = isStorm ? 1.6 : 1
          const windSlant = isStorm ? -6 : -2
          for (const drop of rainRef.current) {
            drop.y += drop.speed * (isStorm ? 1.5 : 0.7)
            drop.x += windSlant * 0.3
            if (drop.y > winY + winH) {
              drop.y = winY - 10
              drop.x = winX + Math.random() * winW
            }
            if (drop.x < winX) drop.x = winX + winW
            ctx.beginPath()
            ctx.moveTo(drop.x, drop.y)
            ctx.lineTo(drop.x + windSlant, drop.y + drop.length)
            ctx.stroke()
          }
        }

        if (isStorm) {
          lightningRef.current.nextFlash -= 1
          if (lightningRef.current.nextFlash <= 0) {
            lightningRef.current.alpha = 0.75
            lightningRef.current.nextFlash = 110 + Math.random() * 160
          }
          if (lightningRef.current.alpha > 0.01) {
            ctx.fillStyle = `rgba(224, 242, 254, ${lightningRef.current.alpha})`
            ctx.fillRect(winX, winY, winW, winH)
            lightningRef.current.alpha *= 0.86
          }
        }
      }

      // Creeping Frost Shader along window edges when distracted or cold
      if (isCold || roomTempCelsius < 16) {
        const frostIntensity = Math.min(1, Math.max(0.2, (20 - roomTempCelsius) / 12))
        const frostGrad = ctx.createRadialGradient(
          winX + winW / 2,
          winY + winH / 2,
          winW * 0.25,
          winX + winW / 2,
          winY + winH / 2,
          winW * 0.72
        )
        frostGrad.addColorStop(0, 'rgba(224, 242, 254, 0)')
        frostGrad.addColorStop(0.7, `rgba(186, 230, 253, ${0.22 * frostIntensity})`)
        frostGrad.addColorStop(1, `rgba(224, 242, 254, ${0.62 * frostIntensity})`)
        ctx.fillStyle = frostGrad
        ctx.fillRect(winX, winY, winW, winH)

        ctx.strokeStyle = `rgba(224, 242, 254, ${0.55 * frostIntensity})`
        ctx.lineWidth = 1.2
        const corners = [
          [winX, winY, 1, 1],
          [winX + winW, winY, -1, 1],
          [winX, winY + winH, 1, -1],
          [winX + winW, winY + winH, -1, -1],
        ]
        for (const [cx, cy, dx, dy] of corners) {
          for (let b = 0; b < 5; b++) {
            const angle = (b / 5) * (Math.PI / 2)
            const len = (24 + fbm2D(b * 3.1, t * 0.2) * 18) * frostIntensity
            ctx.beginPath()
            ctx.moveTo(cx, cy)
            ctx.lineTo(cx + Math.cos(angle) * len * dx, cy + Math.sin(angle) * len * dy)
            ctx.stroke()
          }
        }
      }

      ctx.restore() // End window glass clip

      // Window Mullions (Wooden frame & crossbars)
      ctx.strokeStyle = isCold ? '#334155' : '#5c3a21'
      ctx.lineWidth = 7
      ctx.beginPath()
      ctx.roundRect(winX, winY, winW, winH, [12, 12, 2, 2])
      ctx.stroke()

      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.moveTo(winX + winW / 2, winY)
      ctx.lineTo(winX + winW / 2, winY + winH)
      ctx.moveTo(winX, winY + winH * 0.52)
      ctx.lineTo(winX + winW, winY + winH * 0.52)
      ctx.stroke()

      // Window Sill
      ctx.fillStyle = isCold ? '#475569' : '#78492a'
      ctx.fillRect(winX - 10, winY + winH - 4, winW + 20, 14)

      // 5. PROCEDURAL MATHEMATICAL IVY VINE & LUSH LEAVES (Drawn IN FRONT of window frame so every leaf is vivid & clear!)
      const windStrength =
        focusMode === 'last_leaf_climax' ? 14 : focusMode === 'distracted' ? 5.5 : 3.8

      const totalSegs = vineSegments.length
      const activeSegFloat = Math.max(0.15, vineGrowthProgress) * totalSegs
      let tipX = vineSegments[0]?.x0 ?? 106
      let tipY = vineSegments[0]?.y0 ?? 342

      for (let i = 0; i < totalSegs; i++) {
        const seg = vineSegments[i]
        const segProgress = Math.max(0, Math.min(1, activeSegFloat - i))
        if (segProgress <= 0) break

        const wind0 = noise2D(seg.y0 * 0.015, t * 1.5) * windStrength * (i / totalSegs)
        const wind1 = noise2D(seg.y1 * 0.015, t * 1.5) * windStrength * ((i + 1) / totalSegs)

        const x0 = seg.x0 + wind0
        const y0 = seg.y0
        const cp1x = seg.cp1x + (wind0 + wind1) * 0.5
        const cp1y = seg.cp1y
        const cp2x = seg.cp2x + (wind0 + wind1) * 0.5
        const cp2y = seg.cp2y
        const x1 = seg.x0 + (seg.x1 - seg.x0) * segProgress + wind1
        const y1 = seg.y0 + (seg.y1 - seg.y0) * segProgress

        tipX = x1
        tipY = y1

        // Vine stem shadow for depth
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)'
        ctx.lineWidth = seg.thickness + 2
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(x0 + 1, y0 + 2)
        ctx.bezierCurveTo(cp1x + 1, cp1y + 2, cp2x + 1, cp2y + 2, x1 + 1, y1 + 2)
        ctx.stroke()

        // Main vine stem
        ctx.strokeStyle =
          focusMode === 'last_leaf_climax'
            ? '#452c1e'
            : isCold
            ? '#15803d'
            : '#22c55e'
        ctx.lineWidth = seg.thickness
        ctx.beginPath()
        ctx.moveTo(x0, y0)
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x1, y1)
        ctx.stroke()
      }

      // Glowing Growing Shoot Bud at the tip of the vine when focused!
      if (focusMode === 'locked_in' || focusMode === 'golden_comeback') {
        const budScale = 4 + nextLeafProgress * 6 + Math.sin(t * 6) * 1.2
        const budGlow = ctx.createRadialGradient(tipX, tipY, 1, tipX, tipY, budScale * 2.5)
        budGlow.addColorStop(0, 'rgba(74, 222, 128, 0.9)')
        budGlow.addColorStop(1, 'rgba(74, 222, 128, 0)')
        ctx.fillStyle = budGlow
        ctx.beginPath()
        ctx.arc(tipX, tipY, budScale * 2.5, 0, Math.PI * 2)
        ctx.fill()

        ctx.fillStyle = '#86efac'
        ctx.beginPath()
        ctx.arc(tipX, tipY, budScale * 0.65, 0, Math.PI * 2)
        ctx.fill()
      }

      // Draw attached / dying leaves along the vine
      for (const leaf of leaves) {
        if (leaf.status !== 'attached' && leaf.status !== 'dying') continue
        const seg = vineSegments[Math.min(leaf.segmentIndex, vineSegments.length - 1)]
        if (!seg) continue

        const windOffset =
          noise2D(seg.y1 * 0.015 + leaf.seed, t * 1.8) *
          windStrength *
          ((leaf.segmentIndex + 1) / totalSegs)

        // Offset leaf slightly left/right of stem via petiole stalk so leaves fan out lushly
        const stemX = seg.x1 + windOffset
        const stemY = seg.y1
        const lx = stemX + leaf.side * 12
        const ly = stemY - 3

        // Draw petiole (small leaf stalk)
        ctx.strokeStyle = leaf.health > 0.5 ? '#16a34a' : '#78350f'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(stemX, stemY)
        ctx.lineTo(lx, ly)
        ctx.stroke()

        const flutter =
          noise2D(leaf.seed * 10, t * (focusMode === 'last_leaf_climax' ? 6 : 2.2)) *
          (focusMode === 'last_leaf_climax' ? 0.45 : 0.2)

        drawProceduralLeaf(ctx, lx, ly, leaf, flutter, t)
      }

      // Terracotta Pot on the left side of the sill (drawn over base of vine)
      const potX = winX + 62
      const potY = winY + winH - 2
      ctx.fillStyle = '#c2410c'
      ctx.beginPath()
      ctx.moveTo(potX - 22, potY - 28)
      ctx.lineTo(potX + 22, potY - 28)
      ctx.lineTo(potX + 15, potY)
      ctx.lineTo(potX - 15, potY)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = '#ea580c'
      ctx.fillRect(potX - 25, potY - 35, 50, 8)

      // 6. VOLUMETRIC SUNLIGHT GOD-RAYS (When Locked In)
      if (focusMode === 'locked_in' || focusMode === 'golden_comeback') {
        ctx.save()
        const rayGrad = ctx.createLinearGradient(winX + 40, winY + 40, winX + 420, floorY + 60)
        rayGrad.addColorStop(0, 'rgba(254, 240, 138, 0.18)')
        rayGrad.addColorStop(0.6, 'rgba(253, 224, 71, 0.07)')
        rayGrad.addColorStop(1, 'rgba(253, 224, 71, 0)')
        ctx.fillStyle = rayGrad
        ctx.beginPath()
        ctx.moveTo(winX + 10, winY + 30)
        ctx.lineTo(winX + winW - 10, winY + 30)
        ctx.lineTo(winX + winW + 170, floorY + 80)
        ctx.lineTo(winX + 80, floorY + 80)
        ctx.closePath()
        ctx.fill()
        ctx.restore()
      }

      // 7. WALL POSTERS & COZY UPGRADES
      const signX = 368
      const signY = 62
      ctx.save()
      ctx.translate(signX, signY)
      ctx.rotate(daysSinceDoomscroll === 0 ? -0.04 : 0.01)
      ctx.fillStyle = '#fef3c7'
      ctx.strokeStyle = '#92400e'
      ctx.lineWidth = 2
      ctx.fillRect(0, 0, 142, 66)
      ctx.strokeRect(0, 0, 142, 66)
      ctx.fillStyle = 'rgba(255,255,255,0.55)'
      ctx.fillRect(-6, -4, 24, 10)
      ctx.fillRect(122, -4, 24, 10)

      ctx.fillStyle = '#451a03'
      ctx.font = 'bold 8.5px "JetBrains Mono", monospace'
      ctx.textAlign = 'center'
      ctx.fillText('DAYS SINCE LAST', 71, 18)
      ctx.fillText('DOOMSCROLL / TAB HOP:', 71, 29)

      ctx.fillStyle = daysSinceDoomscroll === 0 ? '#dc2626' : '#15803d'
      ctx.font = 'extrabold 24px "JetBrains Mono", monospace'
      ctx.fillText(String(daysSinceDoomscroll), 71, 56)
      ctx.restore()

      if (hasUpgrade('bookshelf')) {
        const shelfX = 535
        const shelfY = 74
        ctx.fillStyle = '#5c3a21'
        ctx.fillRect(shelfX, shelfY + 42, 165, 8)
        const bookColors = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899']
        let bx = shelfX + 12
        for (let i = 0; i < bookColors.length; i++) {
          const bw = 14 + (i % 2) * 5
          const bh = 28 + (i % 3) * 5
          ctx.fillStyle = bookColors[i]
          ctx.fillRect(bx, shelfY + 42 - bh, bw, bh)
          bx += bw + 3
        }
        ctx.fillStyle = '#16a34a'
        ctx.beginPath()
        ctx.arc(shelfX + 145, shelfY + 34, 9, 0, Math.PI * 2)
        ctx.fill()
      }

      if (hasUpgrade('string_lights')) {
        ctx.strokeStyle = '#44403c'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(20, 22)
        ctx.quadraticCurveTo(W * 0.25, 42, W * 0.5, 20)
        ctx.quadraticCurveTo(W * 0.75, 42, W - 20, 22)
        ctx.stroke()

        for (let i = 1; i <= 14; i++) {
          const lx = (W / 15) * i
          const sag = Math.sin((i / 15) * Math.PI * 2) * 8
          const ly = 26 + Math.abs(sag)
          const glow = 0.65 + Math.sin(t * 3 + i) * 0.3
          ctx.fillStyle = `rgba(253, 224, 71, ${glow})`
          ctx.beginPath()
          ctx.arc(lx, ly, 4.5, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      // 8. DRAMATIC VICTORIAN SICKBED
      const bedX = 635
      const bedY = floorY - 58
      drawCozyBed(ctx, bedX, bedY, roommateState === 'dramatic_sickbed', t)

      // 9. DESK, LAPTOP, LAMP, MATCHA & SLEEPING CAT
      const deskX = 375
      const deskY = floorY - 82
      const deskW = 225

      ctx.fillStyle = isCold ? '#334155' : '#9a3412'
      ctx.beginPath()
      ctx.ellipse(deskX + 115, floorY + 34, 155, 24, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#fde68a'
      ctx.lineWidth = 2
      ctx.stroke()

      if (hasUpgrade('sleeping_cat')) {
        drawSleepingCat(ctx, deskX + 215, floorY + 26, t, isCold)
      }

      ctx.fillStyle = '#1e293b'
      ctx.beginPath()
      ctx.roundRect(deskX + 78, deskY - 46, 56, 68, 10)
      ctx.fill()

      if (
        roommateState === 'typing' ||
        roommateState === 'shivering' ||
        roommateState === 'glaring_with_clipboard'
      ) {
        drawRoommateCharacter(ctx, deskX + 106, deskY - 22, roommateState, t, comebackProgress)
      }

      ctx.fillStyle = '#451a03'
      ctx.fillRect(deskX + 14, deskY + 12, 10, 74)
      ctx.fillRect(deskX + deskW - 24, deskY + 12, 10, 74)
      ctx.fillStyle = '#78350f'
      ctx.beginPath()
      ctx.roundRect(deskX, deskY, deskW, 14, 4)
      ctx.fill()

      const lapX = deskX + 82
      const lapY = deskY - 28
      ctx.fillStyle = '#cbd5e1'
      ctx.beginPath()
      ctx.roundRect(lapX, lapY, 52, 28, 3)
      ctx.fill()
      ctx.fillStyle = roommateState === 'typing' ? '#34d399' : '#f43f5e'
      ctx.beginPath()
      ctx.arc(lapX + 26, lapY + 14, 4.5, 0, Math.PI * 2)
      ctx.fill()

      if (hasUpgrade('warm_lamp')) {
        const lampX = deskX + 28
        const lampY = deskY
        ctx.fillStyle = '#d97706'
        ctx.fillRect(lampX - 10, lampY - 5, 20, 5)
        ctx.fillRect(lampX - 2, lampY - 36, 4, 31)
        ctx.fillStyle = '#10b981'
        ctx.beginPath()
        ctx.moveTo(lampX - 16, lampY - 32)
        ctx.lineTo(lampX + 16, lampY - 32)
        ctx.lineTo(lampX + 10, lampY - 44)
        ctx.lineTo(lampX - 10, lampY - 44)
        ctx.closePath()
        ctx.fill()

        if (focusMode === 'locked_in' || focusMode === 'golden_comeback') {
          const cone = ctx.createRadialGradient(lampX, lampY - 28, 4, lampX, lampY - 10, 75)
          cone.addColorStop(0, 'rgba(253, 224, 71, 0.45)')
          cone.addColorStop(1, 'rgba(253, 224, 71, 0)')
          ctx.fillStyle = cone
          ctx.beginPath()
          ctx.arc(lampX, lampY - 10, 75, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      if (hasUpgrade('matcha_station') || roommateState === 'typing') {
        const mugX = deskX + 168
        const mugY = deskY - 14
        ctx.fillStyle = hasUpgrade('matcha_station') ? '#86efac' : '#f8fafc'
        ctx.beginPath()
        ctx.roundRect(mugX, mugY, 16, 14, 2)
        ctx.fill()
        if (!isCold) {
          ctx.strokeStyle = 'rgba(255,255,255,0.45)'
          ctx.lineWidth = 1.4
          for (let s = 0; s < 2; s++) {
            const sx = mugX + 5 + s * 6 + Math.sin(t * 4 + s) * 2
            ctx.beginPath()
            ctx.moveTo(sx, mugY - 2)
            ctx.quadraticCurveTo(sx + 3, mugY - 9, sx - 2, mugY - 16)
            ctx.stroke()
          }
        }
      }

      // 10. FALLING & FALLEN DEAD LEAVES ON THE FLOOR
      for (const leaf of leaves) {
        if (leaf.status === 'falling' || leaf.status === 'fallen') {
          drawProceduralLeaf(ctx, leaf.x, leaf.y, leaf, leaf.rotation, t)
        }
      }

      if (roommateState === 'sweeping_leaves') {
        drawRoommateCharacter(
          ctx,
          250 + Math.sin(t * 2.2) * 28,
          floorY - 36,
          roommateState,
          t,
          comebackProgress
        )
      } else if (roommateState === 'painting_golden_leaf') {
        drawRoommateCharacter(
          ctx,
          winX + 215,
          floorY - 62,
          roommateState,
          t,
          comebackProgress
        )
      }

      // 11. SPEECH BUBBLE OVERLAY
      drawSpeechBubble(ctx, dialogueText, roommateState, W)

      // 12. TOP-LEFT LIVE ENVIRONMENT HUD PILL + LIVE LEAF SPROUT PROGRESS BAR
      drawCanvasHud(ctx, focusMode, roomTempCelsius, leaves, comebackProgress, nextLeafProgress)

      animId = requestAnimationFrame(render)
    }

    animId = requestAnimationFrame(render)
    return () => cancelAnimationFrame(animId)
  }, [canvasRef])

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-2xl border border-stone-800 bg-stone-950 shadow-2xl">
      <canvas
        ref={canvasRef}
        width={820}
        height={480}
        className="block max-h-full max-w-full object-contain"
      />
    </div>
  )
}

function drawProceduralLeaf(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  leaf: LeafNode,
  angleOffset: number,
  t: number
) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(leaf.baseAngle + angleOffset)

  const h = Math.max(0, Math.min(1, leaf.health))
  let fill = '#22c55e'
  let stroke = '#14532d'
  if (h < 0.35) {
    fill = '#78350f'
    stroke = '#451a03'
  } else if (h < 0.75) {
    fill = '#f59e0b'
    stroke = '#78350f'
  } else {
    fill = '#22c55e'
    stroke = '#064e3b'
  }

  const curlScale = 0.7 + 0.35 * h
  ctx.scale(curlScale, curlScale)

  const sz = leaf.size
  ctx.fillStyle = fill
  ctx.strokeStyle = stroke
  ctx.lineWidth = 1.8

  // Heart-shaped botanical ivy leaf via Bézier curves
  ctx.beginPath()
  ctx.moveTo(0, -sz * 0.85)
  ctx.bezierCurveTo(sz * 0.95, -sz * 0.65, sz * 1.1, sz * 0.35, 0, sz * 1.05)
  ctx.bezierCurveTo(-sz * 1.1, sz * 0.35, -sz * 0.95, -sz * 0.65, 0, -sz * 0.85)
  ctx.fill()
  ctx.stroke()

  // Central & side leaf veins
  ctx.strokeStyle = h > 0.5 ? '#bbf7d0' : '#a16207'
  ctx.lineWidth = 1.1
  ctx.beginPath()
  ctx.moveTo(0, -sz * 0.6)
  ctx.lineTo(0, sz * 0.8)
  ctx.moveTo(0, -sz * 0.1)
  ctx.lineTo(sz * 0.45, -sz * 0.35)
  ctx.moveTo(0, sz * 0.2)
  ctx.lineTo(-sz * 0.45, -sz * 0.05)
  ctx.stroke()

  // Glowing Blossom at node when healthy & blooming
  if (leaf.hasBlossom && h > 0.65 && leaf.status === 'attached') {
    const pulse = 1 + Math.sin(t * 3.5 + leaf.id) * 0.1
    ctx.save()
    ctx.translate(0, -sz * 0.8)
    ctx.scale(leaf.blossomScale * pulse, leaf.blossomScale * pulse)

    for (let p = 0; p < 5; p++) {
      ctx.rotate((Math.PI * 2) / 5)
      ctx.fillStyle = leaf.blossomColor
      ctx.beginPath()
      ctx.ellipse(0, -5.5, 3.6, 5.8, 0, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.fillStyle = '#fef08a'
    ctx.beginPath()
    ctx.arc(0, 0, 3.2, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  ctx.restore()
}

function drawRoommateCharacter(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  state: RoommateState,
  t: number,
  _comebackProgress: number
) {
  ctx.save()
  ctx.translate(x, y)

  if (state === 'shivering') {
    ctx.translate(Math.sin(t * 45) * 2.5, 0)
  }

  const bounce = state === 'typing' ? Math.abs(Math.sin(t * 12)) * 2 : Math.sin(t * 3) * 1.2
  ctx.translate(0, -bounce)

  if (state === 'sweeping_leaves' || state === 'painting_golden_leaf') {
    ctx.fillStyle = '#1e293b'
    ctx.fillRect(-10, 18, 7, 20)
    ctx.fillRect(3, 18, 7, 20)
  }

  if (state === 'shivering') {
    ctx.fillStyle = '#0284c7'
    ctx.beginPath()
    ctx.roundRect(-22, -8, 44, 34, 12)
    ctx.fill()
    ctx.strokeStyle = '#0369a1'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(-20, 3)
    ctx.lineTo(20, 3)
    ctx.moveTo(-20, 14)
    ctx.lineTo(20, 14)
    ctx.stroke()
  } else {
    ctx.fillStyle = state === 'painting_golden_leaf' ? '#7c2d12' : '#059669'
    ctx.beginPath()
    ctx.roundRect(-17, -6, 34, 30, 9)
    ctx.fill()
  }

  ctx.fillStyle = '#fde68a'
  ctx.beginPath()
  ctx.arc(0, -22, 16, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = '#27272a'
  ctx.beginPath()
  ctx.arc(0, -26, 16.5, Math.PI, Math.PI * 2)
  ctx.fill()

  if (state === 'typing') {
    ctx.strokeStyle = '#f59e0b'
    ctx.lineWidth = 3.5
    ctx.beginPath()
    ctx.arc(0, -23, 18, Math.PI * 1.1, Math.PI * 1.9)
    ctx.stroke()
    ctx.fillStyle = '#d97706'
    ctx.beginPath()
    ctx.roundRect(-20, -26, 6, 12, 3)
    ctx.roundRect(14, -26, 6, 12, 3)
    ctx.fill()
  }

  if (state === 'painting_golden_leaf') {
    ctx.fillStyle = '#dc2626'
    ctx.beginPath()
    ctx.ellipse(-2, -38, 18, 7, -0.18, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.fillStyle = '#18181b'
  if (state === 'glaring_with_clipboard') {
    ctx.fillRect(-9, -24, 6, 4)
    ctx.fillRect(3, -24, 6, 4)
    ctx.strokeStyle = '#18181b'
    ctx.lineWidth = 2.2
    ctx.beginPath()
    ctx.moveTo(-11, -26)
    ctx.lineTo(-2, -24)
    ctx.moveTo(11, -26)
    ctx.lineTo(2, -24)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(-5, -14)
    ctx.lineTo(5, -14)
    ctx.stroke()
  } else if (state === 'shivering') {
    ctx.beginPath()
    ctx.arc(-6, -23, 2.5, 0, Math.PI * 2)
    ctx.arc(6, -23, 2.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#18181b'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(-6, -14)
    ctx.lineTo(-3, -12)
    ctx.lineTo(0, -14)
    ctx.lineTo(3, -12)
    ctx.lineTo(6, -14)
    ctx.stroke()
  } else {
    ctx.beginPath()
    ctx.arc(-6, -22, 2.2, 0, Math.PI * 2)
    ctx.arc(6, -22, 2.2, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#18181b'
    ctx.lineWidth = 1.6
    ctx.beginPath()
    ctx.arc(0, -16, 4, 0.15 * Math.PI, 0.85 * Math.PI)
    ctx.stroke()
  }

  if (state === 'glaring_with_clipboard') {
    ctx.fillStyle = '#b45309'
    ctx.beginPath()
    ctx.roundRect(12, -10, 20, 26, 2)
    ctx.fill()
    ctx.fillStyle = '#f8fafc'
    ctx.fillRect(14, -6, 16, 20)
    ctx.strokeStyle = '#ef4444'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(16, -1)
    ctx.lineTo(27, -1)
    ctx.moveTo(16, 4)
    ctx.lineTo(25, 4)
    ctx.stroke()
  } else if (state === 'sweeping_leaves') {
    const sweepAngle = Math.sin(t * 8) * 0.35
    ctx.save()
    ctx.rotate(sweepAngle)
    ctx.strokeStyle = '#a16207'
    ctx.lineWidth = 3.5
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(18, 36)
    ctx.stroke()
    ctx.fillStyle = '#eab308'
    ctx.beginPath()
    ctx.moveTo(10, 34)
    ctx.lineTo(28, 32)
    ctx.lineTo(32, 45)
    ctx.lineTo(6, 45)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  } else if (state === 'painting_golden_leaf') {
    const brushWave = Math.sin(t * 9) * 6
    ctx.strokeStyle = '#78350f'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(12, -6)
    ctx.lineTo(28, -24 + brushWave)
    ctx.stroke()
    ctx.fillStyle = '#facc15'
    ctx.beginPath()
    ctx.arc(29, -26 + brushWave, 5, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.restore()
}

function drawCozyBed(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  inSickbed: boolean,
  t: number
) {
  ctx.save()
  ctx.translate(x, y)

  ctx.fillStyle = '#451a03'
  ctx.fillRect(0, 14, 148, 44)
  ctx.fillRect(136, -12, 12, 70)
  ctx.fillRect(0, 4, 10, 54)

  ctx.fillStyle = '#f1f5f9'
  ctx.beginPath()
  ctx.roundRect(8, 12, 130, 22, 4)
  ctx.fill()
  ctx.fillStyle = '#e2e8f0'
  ctx.beginPath()
  ctx.roundRect(102, 4, 30, 12, 5)
  ctx.fill()

  if (inSickbed) {
    ctx.fillStyle = '#fde68a'
    ctx.beginPath()
    ctx.arc(114, 6, 12, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#fde68a'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(95, 16)
    ctx.lineTo(110, -2 + Math.sin(t * 4) * 1.5)
    ctx.stroke()
  }

  ctx.fillStyle = inSickbed ? '#475569' : '#047857'
  ctx.beginPath()
  ctx.roundRect(8, 14, 96, 22, 5)
  ctx.fill()

  ctx.restore()
}

function drawSleepingCat(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
  isCold: boolean
) {
  ctx.save()
  ctx.translate(x, y)
  const purrScale = 1 + Math.sin(t * 3.5) * 0.04
  ctx.scale(purrScale, purrScale)

  ctx.fillStyle = '#fb923c'
  ctx.beginPath()
  ctx.ellipse(0, 0, 16, 10, 0, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = '#27272a'
  ctx.beginPath()
  ctx.arc(-5, -3, 6, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = '#fb923c'
  ctx.beginPath()
  ctx.moveTo(8, -6)
  ctx.lineTo(12, -13)
  ctx.lineTo(15, -5)
  ctx.fill()

  if (!isCold) {
    ctx.fillStyle = 'rgba(254, 243, 199, 0.7)'
    ctx.font = 'bold 9px "JetBrains Mono", monospace'
    ctx.fillText('z', 14, -10 - ((t * 8) % 10))
    ctx.fillText('Z', 20, -16 - ((t * 8) % 10))
  }
  ctx.restore()
}

function drawSpeechBubble(
  ctx: CanvasRenderingContext2D,
  text: string,
  state: RoommateState,
  W: number
) {
  if (!text) return
  const boxX = 358
  const boxY = 148
  const boxW = W - boxX - 28
  const boxH = 74

  ctx.save()
  ctx.fillStyle =
    state === 'dramatic_sickbed'
      ? 'rgba(30, 27, 75, 0.94)'
      : state === 'glaring_with_clipboard' || state === 'shivering'
      ? 'rgba(39, 10, 18, 0.92)'
      : 'rgba(20, 32, 26, 0.92)'
  ctx.strokeStyle =
    state === 'painting_golden_leaf'
      ? '#facc15'
      : state === 'typing'
      ? '#34d399'
      : '#fb7185'
  ctx.lineWidth = 2

  ctx.beginPath()
  ctx.roundRect(boxX, boxY, boxW, boxH, 12)
  ctx.fill()
  ctx.stroke()

  const badgeLabel = state.replace(/_/g, ' ').toUpperCase()
  ctx.fillStyle =
    state === 'painting_golden_leaf'
      ? '#facc15'
      : state === 'typing'
      ? '#34d399'
      : '#fda4af'
  ctx.font = 'bold 9.5px "JetBrains Mono", monospace'
  ctx.fillText(`ROOMMATE // ${badgeLabel}`, boxX + 14, boxY + 19)

  ctx.fillStyle = '#f8fafc'
  ctx.font = '12px "JetBrains Mono", monospace'
  const words = text.trim().split(' ')
  let line = ''
  let y = boxY + 39
  const maxWidth = boxW - 28
  for (let i = 0; i < words.length; i++) {
    const testLine = line + words[i] + ' '
    if (ctx.measureText(testLine).width > maxWidth && line.length > 0) {
      ctx.fillText(line.trim(), boxX + 14, y)
      line = words[i] + ' '
      y += 17
    } else {
      line = testLine
    }
  }
  if (line.trim()) {
    ctx.fillText(line.trim(), boxX + 14, y)
  }

  ctx.restore()
}

function drawCanvasHud(
  ctx: CanvasRenderingContext2D,
  focusMode: FocusMode,
  roomTempCelsius: number,
  leaves: LeafNode[],
  comebackProgress: number,
  nextLeafProgress: number
) {
  const attachedCount = leaves.filter((l) => l.status === 'attached' || l.status === 'dying').length
  const fallenCount = leaves.filter((l) => l.status === 'falling' || l.status === 'fallen').length

  ctx.save()
  ctx.fillStyle = 'rgba(12, 10, 9, 0.85)'
  ctx.strokeStyle = 'rgba(255,255,255,0.14)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.roundRect(16, 10, 485, 28, 8)
  ctx.fill()
  ctx.stroke()

  const dotColor =
    focusMode === 'locked_in'
      ? '#10b981'
      : focusMode === 'golden_comeback'
      ? '#facc15'
      : focusMode === 'last_leaf_climax'
      ? '#ef4444'
      : '#f97316'

  ctx.fillStyle = dotColor
  ctx.beginPath()
  ctx.arc(29, 24, 4.5, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = '#e7e5e4'
  ctx.font = 'bold 10.5px "JetBrains Mono", monospace'
  ctx.fillText(
    `VINE: ${attachedCount}/14 LIVE · ${fallenCount} FLOOR · ${roomTempCelsius.toFixed(0)}°C`,
    42,
    28
  )

  // Live Next-Leaf Sprout Progress Bar right inside the top HUD!
  const barX = 290
  const barY = 17
  const barW = 115
  const barH = 14
  ctx.fillStyle = '#1c1917'
  ctx.beginPath()
  ctx.roundRect(barX, barY, barW, barH, 4)
  ctx.fill()

  ctx.fillStyle = focusMode === 'locked_in' || focusMode === 'golden_comeback' ? '#22c55e' : '#64748b'
  ctx.beginPath()
  ctx.roundRect(barX + 1, barY + 1, Math.max(4, (barW - 2) * nextLeafProgress), barH - 2, 3)
  ctx.fill()

  ctx.fillStyle = '#f8fafc'
  ctx.font = 'bold 9px "JetBrains Mono", monospace'
  ctx.fillText(
    attachedCount >= 14
      ? 'FULL BLOOM!'
      : `NEXT LEAF: ${Math.round(nextLeafProgress * 100)}%`,
    barX + 10,
    barY + 10.5
  )

  // If in Last Leaf Climax, show O. Henry Redemption Progress Bar across bottom of window
  if (focusMode === 'last_leaf_climax' && comebackProgress > 0) {
    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)'
    ctx.strokeStyle = '#facc15'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.roundRect(44, 368, 296, 22, 6)
    ctx.fill()
    ctx.stroke()

    ctx.fillStyle = '#eab308'
    ctx.beginPath()
    ctx.roundRect(47, 371, Math.max(8, 290 * comebackProgress), 16, 4)
    ctx.fill()

    ctx.fillStyle = '#fefce8'
    ctx.font = 'bold 9.5px "JetBrains Mono", monospace'
    ctx.fillText(
      `O. HENRY REDEMPTION: ${Math.round(comebackProgress * 100)}% TO GOLDEN LEAF`,
      58,
      383
    )
  }

  ctx.restore()
}
