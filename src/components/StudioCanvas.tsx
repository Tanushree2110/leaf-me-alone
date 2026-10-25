import React, { useEffect, useRef } from 'react'
import {
  FocusMode,
  LeafNode,
  RoommateState,
  RoomSkinId,
  RoomUpgrade,
  VineSegment,
} from '../types'
import { fbm2D, noise2D } from '../utils/noise'
import { getSkinById } from '../utils/skins'

interface StudioCanvasProps {
  focusMode: FocusMode
  roommateState: RoommateState
  skinId: RoomSkinId
  isRoughWeather: boolean
  leaves: LeafNode[]
  vineSegments: VineSegment[]
  vineGrowthProgress: number
  nextLeafProgress: number
  upgrades: RoomUpgrade[]
  daysSinceDoomscroll: number
  goldenLeavesPainted: number
  roomTempCelsius: number
  comebackProgress: number
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

  const latestPropsRef = useRef<StudioCanvasProps>(props)
  useEffect(() => {
    latestPropsRef.current = props
  }, [props])

  const rainRef = useRef<RainDrop[]>([])
  const lightningRef = useRef<{ alpha: number; boltX: number; nextFlash: number }>({
    alpha: 0,
    boltX: 160,
    nextFlash: 65,
  })

  useEffect(() => {
    const drops: RainDrop[] = []
    for (let i = 0; i < 115; i++) {
      drops.push({
        x: Math.random() * 310 + 44,
        y: Math.random() * 320 + 44,
        length: 14 + Math.random() * 18,
        speed: 8 + Math.random() * 7,
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
        skinId,
        isRoughWeather,
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

      const skin = getSkinById(skinId)
      const t = (now - startTime) * 0.001
      const W = canvas.width
      const H = canvas.height

      const hasUpgrade = (id: RoomUpgrade['id']) =>
        upgrades.some((u) => u.id === id && u.unlocked)

      const isStormy =
        isRoughWeather ||
        focusMode === 'distracted' ||
        focusMode === 'last_leaf_climax'

      ctx.clearRect(0, 0, W, H)

      // 1. STUDIO WALL BACKGROUND (Themed by RoomSkin)
      const wallGrad = ctx.createLinearGradient(0, 0, 0, H)
      if (isStormy) {
        wallGrad.addColorStop(0, skin.wallColdTop)
        wallGrad.addColorStop(1, skin.wallColdBottom)
      } else {
        wallGrad.addColorStop(0, skin.wallTop)
        wallGrad.addColorStop(1, skin.wallBottom)
      }
      ctx.fillStyle = wallGrad
      ctx.fillRect(0, 0, W, H)

      // Subtle wallpaper / paneling stripes
      ctx.strokeStyle = isStormy
        ? 'rgba(148, 163, 184, 0.04)'
        : skinId === 'tokyo_lofi'
        ? 'rgba(168, 85, 247, 0.06)'
        : 'rgba(251, 191, 36, 0.04)'
      ctx.lineWidth = 2
      for (let x = 24; x < W; x += 36) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, H - 105)
        ctx.stroke()
      }

      // 2. WOODEN FLOOR & BASEBOARD (Themed by RoomSkin)
      const floorY = H - 105
      const floorGrad = ctx.createLinearGradient(0, floorY, 0, H)
      floorGrad.addColorStop(0, isStormy ? '#1e2029' : skin.floorTop)
      floorGrad.addColorStop(1, isStormy ? '#12131a' : skin.floorBottom)
      ctx.fillStyle = floorGrad
      ctx.fillRect(0, floorY, W, 105)

      ctx.fillStyle = isStormy ? '#334155' : skin.trimColor
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
      if (isStormy) {
        skyGrad.addColorStop(0, '#090d16')
        skyGrad.addColorStop(0.55, '#172136')
        skyGrad.addColorStop(1, '#263147')
      } else if (skinId === 'tokyo_lofi') {
        skyGrad.addColorStop(0, '#1e1b4b')
        skyGrad.addColorStop(0.6, '#4c1d95')
        skyGrad.addColorStop(1, '#f472b6')
      } else {
        skyGrad.addColorStop(0, '#0284c7')
        skyGrad.addColorStop(0.55, '#7dd3fc')
        skyGrad.addColorStop(1, '#fef08a')
      }
      ctx.fillStyle = skyGrad
      ctx.fillRect(winX, winY, winW, winH)

      // Sun / Moon outside when studying
      if (!isStormy) {
        const sunX = winX + 78 + Math.sin(t * 0.4) * 6
        const sunY = winY + 68
        const sunRadial = ctx.createRadialGradient(sunX, sunY, 8, sunX, sunY, 85)
        if (skinId === 'tokyo_lofi') {
          sunRadial.addColorStop(0, 'rgba(244, 114, 182, 0.95)')
          sunRadial.addColorStop(0.45, 'rgba(192, 132, 252, 0.4)')
          sunRadial.addColorStop(1, 'rgba(192, 132, 252, 0)')
        } else {
          sunRadial.addColorStop(0, 'rgba(254, 240, 138, 0.95)')
          sunRadial.addColorStop(0.4, 'rgba(253, 224, 71, 0.45)')
          sunRadial.addColorStop(1, 'rgba(253, 224, 71, 0)')
        }
        ctx.fillStyle = sunRadial
        ctx.beginPath()
        ctx.arc(sunX, sunY, 85, 0, Math.PI * 2)
        ctx.fill()
      }

      // Opposite Greenwich Village Brick Wall (Right side of window view)
      const brickWallX = winX + 194
      ctx.fillStyle = isStormy ? '#3b211e' : '#7c3a2d'
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

      // 4. AUTOMATIC ROUGH RAINSTORM + JAGGED LIGHTNING BOLTS + ROLLING STORM CLOUDS WHEN DISTRACTED!
      if (isStormy) {
        // Dark rolling storm clouds across top of window
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)'
        for (let c = 0; c < 5; c++) {
          const cx = winX + 35 + c * 62 + Math.sin(t * 1.5 + c) * 8
          const cy = winY + 18 + (c % 2) * 8
          ctx.beginPath()
          ctx.arc(cx, cy, 38, 0, Math.PI * 2)
          ctx.fill()
        }

        // Periodic Lightning Bolt + Sky Flash
        lightningRef.current.nextFlash -= 1
        if (lightningRef.current.nextFlash <= 0) {
          lightningRef.current.alpha = 0.92
          lightningRef.current.boltX = winX + 55 + Math.random() * 140
          lightningRef.current.nextFlash = 50 + Math.random() * 65
        }

        if (lightningRef.current.alpha > 0.02) {
          // Bright sky flash
          ctx.fillStyle = `rgba(224, 242, 254, ${lightningRef.current.alpha * 0.55})`
          ctx.fillRect(winX, winY, winW, winH)

          // Jagged Forked Lightning Bolt
          ctx.save()
          ctx.strokeStyle = `rgba(254, 249, 195, ${lightningRef.current.alpha})`
          ctx.shadowColor = '#38bdf8'
          ctx.shadowBlur = 14
          ctx.lineWidth = 3
          let bx = lightningRef.current.boltX
          let by = winY + 10
          ctx.beginPath()
          ctx.moveTo(bx, by)
          for (let seg = 0; seg < 6; seg++) {
            bx += (seg % 2 === 0 ? -16 : 18)
            by += 42
            ctx.lineTo(bx, by)
          }
          ctx.stroke()
          ctx.restore()

          lightningRef.current.alpha *= 0.84
        }

        // Heavy Slanted Rain Pouring Across the Entire Window
        ctx.strokeStyle = 'rgba(186, 230, 253, 0.82)'
        ctx.lineWidth = 2.1
        ctx.lineCap = 'round'
        const windSlant = -7
        for (const drop of rainRef.current) {
          drop.y += drop.speed * 1.45
          drop.x += windSlant * 0.45
          if (drop.y > winY + winH) {
            drop.y = winY - 12
            drop.x = winX + Math.random() * (winW + 40)
          }
          if (drop.x < winX - 20) {
            drop.x = winX + winW + 10
          }
          ctx.beginPath()
          ctx.moveTo(drop.x, drop.y)
          ctx.lineTo(drop.x + windSlant, drop.y + drop.length)
          ctx.stroke()
        }

        // Creeping Frost Shader along window edges
        const frostIntensity = Math.min(1, Math.max(0.35, (21 - roomTempCelsius) / 10))
        const frostGrad = ctx.createRadialGradient(
          winX + winW / 2,
          winY + winH / 2,
          winW * 0.22,
          winX + winW / 2,
          winY + winH / 2,
          winW * 0.72
        )
        frostGrad.addColorStop(0, 'rgba(224, 242, 254, 0)')
        frostGrad.addColorStop(0.7, `rgba(186, 230, 253, ${0.25 * frostIntensity})`)
        frostGrad.addColorStop(1, `rgba(224, 242, 254, ${0.65 * frostIntensity})`)
        ctx.fillStyle = frostGrad
        ctx.fillRect(winX, winY, winW, winH)

        ctx.strokeStyle = `rgba(224, 242, 254, ${0.6 * frostIntensity})`
        ctx.lineWidth = 1.3
        const corners = [
          [winX, winY, 1, 1],
          [winX + winW, winY, -1, 1],
          [winX, winY + winH, 1, -1],
          [winX + winW, winY + winH, -1, -1],
        ]
        for (const [cx, cy, dx, dy] of corners) {
          for (let b = 0; b < 5; b++) {
            const angle = (b / 5) * (Math.PI / 2)
            const len = (26 + fbm2D(b * 3.1, t * 0.2) * 18) * frostIntensity
            ctx.beginPath()
            ctx.moveTo(cx, cy)
            ctx.lineTo(cx + Math.cos(angle) * len * dx, cy + Math.sin(angle) * len * dy)
            ctx.stroke()
          }
        }
      }

      ctx.restore() // End window glass clip

      // Window Mullions (Wooden frame & crossbars)
      ctx.strokeStyle = isStormy ? '#334155' : skin.windowFrameColor
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
      ctx.fillStyle = isStormy ? '#475569' : skin.trimColor
      ctx.fillRect(winX - 10, winY + winH - 4, winW + 20, 14)

      // 5. PROCEDURAL MATHEMATICAL IVY VINE & LUSH LEAVES
      const windStrength =
        focusMode === 'last_leaf_climax' ? 15 : isStormy ? 9.5 : 3.8

      const totalSegs = vineSegments.length
      const activeSegFloat = Math.max(0.15, vineGrowthProgress) * totalSegs
      let tipX = vineSegments[0]?.x0 ?? 106
      let tipY = vineSegments[0]?.y0 ?? 342

      for (let i = 0; i < totalSegs; i++) {
        const seg = vineSegments[i]
        const segProgress = Math.max(0, Math.min(1, activeSegFloat - i))
        if (segProgress <= 0) break

        const wind0 = noise2D(seg.y0 * 0.015, t * (isStormy ? 3.2 : 1.5)) * windStrength * (i / totalSegs)
        const wind1 =
          noise2D(seg.y1 * 0.015, t * (isStormy ? 3.2 : 1.5)) *
          windStrength *
          ((i + 1) / totalSegs)

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

        ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)'
        ctx.lineWidth = seg.thickness + 2
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(x0 + 1, y0 + 2)
        ctx.bezierCurveTo(cp1x + 1, cp1y + 2, cp2x + 1, cp2y + 2, x1 + 1, y1 + 2)
        ctx.stroke()

        ctx.strokeStyle =
          focusMode === 'last_leaf_climax'
            ? '#452c1e'
            : isStormy
            ? '#15803d'
            : '#22c55e'
        ctx.lineWidth = seg.thickness
        ctx.beginPath()
        ctx.moveTo(x0, y0)
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x1, y1)
        ctx.stroke()
      }

      if (!isStormy) {
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

      for (const leaf of leaves) {
        if (leaf.status !== 'attached' && leaf.status !== 'dying') continue
        const seg = vineSegments[Math.min(leaf.segmentIndex, vineSegments.length - 1)]
        if (!seg) continue

        const windOffset =
          noise2D(seg.y1 * 0.015 + leaf.seed, t * (isStormy ? 3.5 : 1.8)) *
          windStrength *
          ((leaf.segmentIndex + 1) / totalSegs)

        const stemX = seg.x1 + windOffset
        const stemY = seg.y1
        const lx = stemX + leaf.side * 12
        const ly = stemY - 3

        ctx.strokeStyle = leaf.health > 0.5 ? '#16a34a' : '#78350f'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(stemX, stemY)
        ctx.lineTo(lx, ly)
        ctx.stroke()

        const flutter =
          noise2D(leaf.seed * 10, t * (isStormy ? 6.5 : 2.2)) *
          (isStormy ? 0.45 : 0.2)

        drawProceduralLeaf(ctx, lx, ly, leaf, flutter, t)
      }

      // Terracotta Pot
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

      // 6. VOLUMETRIC SUNLIGHT GOD-RAYS (When Studying)
      if (!isStormy) {
        ctx.save()
        const rayGrad = ctx.createLinearGradient(winX + 40, winY + 40, winX + 420, floorY + 60)
        if (skinId === 'tokyo_lofi') {
          rayGrad.addColorStop(0, 'rgba(244, 114, 182, 0.16)')
          rayGrad.addColorStop(0.6, 'rgba(168, 85, 247, 0.06)')
          rayGrad.addColorStop(1, 'rgba(168, 85, 247, 0)')
        } else {
          rayGrad.addColorStop(0, 'rgba(254, 240, 138, 0.18)')
          rayGrad.addColorStop(0.6, 'rgba(253, 224, 71, 0.07)')
          rayGrad.addColorStop(1, 'rgba(253, 224, 71, 0)')
        }
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
        ctx.fillStyle = skin.trimColor
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

      ctx.fillStyle = isStormy ? '#334155' : skin.rugColor
      ctx.beginPath()
      ctx.ellipse(deskX + 115, floorY + 34, 155, 24, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#fde68a'
      ctx.lineWidth = 2
      ctx.stroke()

      if (hasUpgrade('sleeping_cat')) {
        drawSleepingCat(ctx, deskX + 215, floorY + 26, t, isStormy)
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
        drawRoommateCharacter(
          ctx,
          deskX + 106,
          deskY - 22,
          roommateState,
          t,
          skin.sweaterColor
        )
      }

      ctx.fillStyle = '#271206'
      ctx.fillRect(deskX + 14, deskY + 12, 10, 74)
      ctx.fillRect(deskX + deskW - 24, deskY + 12, 10, 74)
      ctx.fillStyle = skin.deskColor
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

        if (!isStormy) {
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
        if (!isStormy) {
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
          skin.sweaterColor
        )
      } else if (roommateState === 'painting_golden_leaf') {
        drawRoommateCharacter(
          ctx,
          winX + 215,
          floorY - 62,
          roommateState,
          t,
          skin.sweaterColor
        )
      }

      // 11. WALL LIZARD (Clings to studio wall; shoots tongue & licks the screen when you don't study!)
      drawWallLizard(ctx, isStormy, t, W, H)

      // 12. SPEECH BUBBLE OVERLAY
      drawSpeechBubble(ctx, dialogueText, roommateState, W)

      // 13. TOP-LEFT LIVE ENVIRONMENT HUD PILL
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

  ctx.beginPath()
  ctx.moveTo(0, -sz * 0.85)
  ctx.bezierCurveTo(sz * 0.95, -sz * 0.65, sz * 1.1, sz * 0.35, 0, sz * 1.05)
  ctx.bezierCurveTo(-sz * 1.1, sz * 0.35, -sz * 0.95, -sz * 0.65, 0, -sz * 0.85)
  ctx.fill()
  ctx.stroke()

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
  sweaterColor: string
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
    ctx.fillStyle = state === 'painting_golden_leaf' ? '#7c2d12' : sweaterColor
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

function drawWallLizard(
  ctx: CanvasRenderingContext2D,
  isNotStudying: boolean,
  t: number,
  W: number,
  H: number
) {
  const lizX = 748
  const lizY = 104

  ctx.save()
  ctx.translate(lizX, lizY)

  // Scurry / breathing wiggle on the wall
  const bodyWiggle = isNotStudying
    ? Math.sin(t * 14) * 0.09
    : Math.sin(t * 2.2) * 0.03
  ctx.rotate(-0.35 + bodyWiggle)

  // Curled Gecko Tail wagging above
  const tailWag = Math.sin(t * (isNotStudying ? 10 : 2.5)) * 8
  ctx.strokeStyle = '#65a30d'
  ctx.lineWidth = 5.5
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(0, -18)
  ctx.bezierCurveTo(12 + tailWag, -36, -10 + tailWag, -52, 8 + tailWag, -62)
  ctx.stroke()

  // 4 Splayed Gecko Legs & Sticky Toe Pads
  const legs = [
    [-14, -10, -24, -16],
    [14, -10, 24, -16],
    [-14, 10, -24, 16],
    [14, 10, 24, 16],
  ]
  ctx.strokeStyle = '#4d7c0f'
  ctx.lineWidth = 3.2
  for (const [x0, y0, x1, y1] of legs) {
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    ctx.lineTo(x1, y1)
    ctx.stroke()
    // Sticky toe pad circles
    ctx.fillStyle = '#a3e635'
    ctx.beginPath()
    ctx.arc(x1, y1, 3, 0, Math.PI * 2)
    ctx.fill()
  }

  // Lizard Torso
  ctx.fillStyle = '#84cc16'
  ctx.strokeStyle = '#3f6212'
  ctx.lineWidth = 1.8
  ctx.beginPath()
  ctx.ellipse(0, 0, 12, 22, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()

  // Cute dorsal spots
  ctx.fillStyle = '#365314'
  ctx.beginPath()
  ctx.arc(-3, -7, 2.5, 0, Math.PI * 2)
  ctx.arc(4, -1, 2.2, 0, Math.PI * 2)
  ctx.arc(-2, 6, 2.5, 0, Math.PI * 2)
  ctx.fill()

  // Lizard Head (facing down-left toward you!)
  ctx.fillStyle = '#a3e635'
  ctx.beginPath()
  ctx.ellipse(0, 22, 13, 14, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()

  // Big Bulging Googly Reptile Eyes
  ctx.fillStyle = '#fef08a'
  ctx.beginPath()
  ctx.arc(-9, 20, 5.5, 0, Math.PI * 2)
  ctx.arc(9, 20, 5.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()

  // Vertical Slit Pupils
  ctx.fillStyle = isNotStudying ? '#dc2626' : '#18181b'
  ctx.beginPath()
  ctx.ellipse(-9, 21, 1.6, 3.8, 0, 0, Math.PI * 2)
  ctx.ellipse(9, 21, 1.6, 3.8, 0, 0, Math.PI * 2)
  ctx.fill()

  // Occasional tiny cute blep when studying
  if (!isNotStudying && Math.sin(t * 2) > 0.85) {
    ctx.fillStyle = '#f43f5e'
    ctx.beginPath()
    ctx.arc(0, 37, 3.5, 0, Math.PI * 2)
    ctx.fill()
  }

  // Wide open mouth when about to lick you!
  if (isNotStudying) {
    ctx.fillStyle = '#881337'
    ctx.beginPath()
    ctx.arc(0, 32, 7.5, 0, Math.PI)
    ctx.fill()
  }

  ctx.restore()

  // IF NOT STUDYING: Shoot giant stretchy pink tongue across the screen & lick the camera lens!
  if (isNotStudying) {
    // Periodic licking motion: shoots out and wipes up & down on the screen glass
    const lickCycle = (t * 2.4) % 1
    const isExtended = lickCycle < 0.78

    // Screen-glass wet saliva splat / lick streak (stays visible while not studying!)
    const targetCenterX = W * 0.45
    const targetCenterY = H * 0.54
    const wipeOffsetY = Math.sin(t * 11) * 42
    const wipeOffsetX = Math.cos(t * 5.5) * 18

    ctx.save()
    // Wet glossy saliva smear on the "camera glass"
    const smearGrad = ctx.createRadialGradient(
      targetCenterX,
      targetCenterY,
      10,
      targetCenterX,
      targetCenterY,
      95
    )
    smearGrad.addColorStop(0, 'rgba(244, 114, 182, 0.24)')
    smearGrad.addColorStop(0.5, 'rgba(186, 230, 253, 0.22)')
    smearGrad.addColorStop(1, 'rgba(186, 230, 253, 0)')
    ctx.fillStyle = smearGrad
    ctx.beginPath()
    ctx.ellipse(targetCenterX, targetCenterY, 72, 95, -0.15, 0, Math.PI * 2)
    ctx.fill()

    // Dripping saliva droplets on the screen lens
    ctx.fillStyle = 'rgba(224, 242, 254, 0.55)'
    const drops = [
      [-38, 25 + ((t * 22) % 35)],
      [28, 40 + ((t * 18) % 30)],
      [-12, 55 + ((t * 26) % 28)],
      [44, -10 + ((t * 15) % 32)],
    ]
    for (const [dx, dy] of drops) {
      ctx.beginPath()
      ctx.ellipse(targetCenterX + dx, targetCenterY + dy, 3.5, 6.5, 0, 0, Math.PI * 2)
      ctx.fill()
    }

    if (isExtended) {
      const mouthX = lizX - 10
      const mouthY = lizY + 28
      const tipX = targetCenterX + wipeOffsetX
      const tipY = targetCenterY + wipeOffsetY

      // Tongue shadow
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)'
      ctx.lineWidth = 18
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(mouthX, mouthY + 4)
      ctx.quadraticCurveTo(
        (mouthX + tipX) * 0.5,
        (mouthY + tipY) * 0.5 - 32,
        tipX,
        tipY + 4
      )
      ctx.stroke()

      // Stretchy Hot-Pink Chameleon Tongue
      ctx.strokeStyle = '#fb7185'
      ctx.lineWidth = 14
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(mouthX, mouthY)
      ctx.quadraticCurveTo(
        (mouthX + tipX) * 0.5,
        (mouthY + tipY) * 0.5 - 32,
        tipX,
        tipY
      )
      ctx.stroke()

      // Center tongue groove
      ctx.strokeStyle = '#e11d48'
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.moveTo(mouthX, mouthY)
      ctx.quadraticCurveTo(
        (mouthX + tipX) * 0.5,
        (mouthY + tipY) * 0.5 - 32,
        tipX,
        tipY
      )
      ctx.stroke()

      // Big Squishy Tongue Pad flattened against your screen glass (*SLURP!*)
      ctx.fillStyle = '#f43f5e'
      ctx.strokeStyle = '#be123c'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.ellipse(tipX, tipY, 34, 26, -0.2, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()

      // Glossy highlight on tongue tip
      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)'
      ctx.beginPath()
      ctx.ellipse(tipX - 10, tipY - 8, 10, 5, -0.3, 0, Math.PI * 2)
      ctx.fill()

      // Comic "*SLURP!*" text floating next to tongue tip
      ctx.fillStyle = '#fef08a'
      ctx.strokeStyle = '#881337'
      ctx.lineWidth = 3
      ctx.font = 'extrabold 16px "JetBrains Mono", monospace'
      ctx.strokeText('*SLURP!*', tipX - 36, tipY - 34)
      ctx.fillText('*SLURP!*', tipX - 36, tipY - 34)
    }

    ctx.restore()
  }
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

  ctx.save()
  ctx.fillStyle = 'rgba(12, 10, 9, 0.82)'
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.roundRect(16, 10, 324, 26, 8)
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
  ctx.arc(28, 23, 4, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = '#e7e5e4'
  ctx.font = 'bold 10.5px "JetBrains Mono", monospace'
  ctx.fillText(
    `${attachedCount}/14 LEAVES · ${roomTempCelsius.toFixed(0)}°C`,
    40,
    27
  )

  const barX = 185
  const barY = 16
  const barW = 144
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
      ? 'FULL BLOOM'
      : `NEXT LEAF ${Math.round(nextLeafProgress * 100)}%`,
    barX + 26,
    barY + 10.5
  )

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
      `GOLDEN LEAF COMEBACK: ${Math.round(comebackProgress * 100)}%`,
      92,
      383
    )
  }

  ctx.restore()
}
