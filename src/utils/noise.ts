// 1D & 2D Perlin-style value/gradient noise for procedural wind, vine curves, and weather shaders

const PERM = new Uint8Array(512)
const GRAD = [
  [1, 1], [-1, 1], [1, -1], [-1, -1],
  [1, 0], [-1, 0], [0, 1], [0, -1],
]

;(function initNoise() {
  const p = new Uint8Array(256)
  for (let i = 0; i < 256; i++) p[i] = i
  let seed = 1337
  for (let i = 255; i > 0; i--) {
    seed = (seed * 16807) % 2147483647
    const j = seed % (i + 1)
    const tmp = p[i]
    p[i] = p[j]
    p[j] = tmp
  }
  for (let i = 0; i < 512; i++) {
    PERM[i] = p[i & 255]
  }
})()

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10)
}

function lerp(a: number, b: number, t: number): number {
  return a + t * (b - a)
}

function dot2(g: number[], x: number, y: number): number {
  return g[0] * x + g[1] * y
}

export function noise2D(x: number, y: number): number {
  const X = Math.floor(x) & 255
  const Y = Math.floor(y) & 255

  const xf = x - Math.floor(x)
  const yf = y - Math.floor(y)

  const u = fade(xf)
  const v = fade(yf)

  const aa = PERM[PERM[X] + Y] & 7
  const ab = PERM[PERM[X] + Y + 1] & 7
  const ba = PERM[PERM[X + 1] + Y] & 7
  const bb = PERM[PERM[X + 1] + Y + 1] & 7

  const x1 = lerp(dot2(GRAD[aa], xf, yf), dot2(GRAD[ba], xf - 1, yf), u)
  const x2 = lerp(dot2(GRAD[ab], xf, yf - 1), dot2(GRAD[bb], xf - 1, yf - 1), u)

  return lerp(x1, x2, v)
}

export function fbm2D(x: number, y: number, octaves = 3): number {
  let value = 0
  let amplitude = 0.5
  let frequency = 1
  for (let i = 0; i < octaves; i++) {
    value += amplitude * noise2D(x * frequency, y * frequency)
    frequency *= 2.02
    amplitude *= 0.5
  }
  return value
}
