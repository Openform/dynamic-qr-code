/**
 * A QR-looking module grid for the landing page visuals. It has real finder,
 * timing and alignment patterns, but random data, so it isn't scannable.
 */

export const N = 25 // module grid (QR "version 2" size)

/* Tiny deterministic PRNG so the first paint matches on server + client. */
function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/* The fixed structural layer: finders, separators, timing, alignment. */
function buildStructure() {
  const reserved = Array.from({ length: N }, () => Array(N).fill(false))
  const structOn = Array.from({ length: N }, () => Array(N).fill(false))

  const placeFinder = (R, C) => {
    for (let i = -1; i <= 7; i++) {
      for (let j = -1; j <= 7; j++) {
        const r = R + i
        const c = C + j
        if (r < 0 || c < 0 || r >= N || c >= N) continue
        reserved[r][c] = true // includes the 1-module separator ring
        if (i >= 0 && i <= 6 && j >= 0 && j <= 6) {
          const edge = i === 0 || i === 6 || j === 0 || j === 6
          const center = i >= 2 && i <= 4 && j >= 2 && j <= 4
          structOn[r][c] = edge || center
        }
      }
    }
  }

  placeFinder(0, 0)
  placeFinder(0, N - 7)
  placeFinder(N - 7, 0)

  // Timing patterns (alternating) along row 6 / col 6, between the finders.
  for (let i = 8; i < N - 8; i++) {
    if (!reserved[6][i]) {
      reserved[6][i] = true
      structOn[6][i] = i % 2 === 0
    }
    if (!reserved[i][6]) {
      reserved[i][6] = true
      structOn[i][6] = i % 2 === 0
    }
  }

  // Alignment pattern (5x5) near the bottom-right, like a real version-2 code.
  const a = N - 7
  for (let i = -2; i <= 2; i++) {
    for (let j = -2; j <= 2; j++) {
      const r = a + i
      const c = a + j
      if (r < 0 || c < 0 || r >= N || c >= N) continue
      reserved[r][c] = true
      const ring = Math.max(Math.abs(i), Math.abs(j))
      structOn[r][c] = ring === 2 || ring === 0
    }
  }

  return { reserved, structOn }
}

export const STRUCT = buildStructure()

/* Random data modules for a given seed (structure cells are left false). */
export function buildData(seed) {
  const rand = mulberry32((seed * 2654435761) >>> 0)
  const m = Array.from({ length: N }, () => Array(N).fill(false))
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (STRUCT.reserved[r][c]) continue
      m[r][c] = rand() > 0.5
    }
  }
  return m
}
