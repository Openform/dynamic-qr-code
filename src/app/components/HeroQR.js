"use client"

import { useEffect, useMemo, useState } from "react"

/**
 * Animated "living" QR code for the landing hero.
 *
 * It tells the product story in one visual:
 *   1. The matrix assembles in a diagonal ripple   -> "Generate"
 *   2. A laser line sweeps across it on a loop      -> "Scan"
 *   3. The data modules periodically regenerate and -> "Dynamic / evolves with you"
 *      the routing label swaps to a new destination -> "Change destinations anytime"
 *   4. A floating pill ticks live scans             -> "Real-time analytics"
 *
 * The three finder patterns + timing + alignment stay fixed (like a real QR),
 * so only the data field animates — which reads as authentic, not noisy.
 */

const N = 25 // module grid (QR "version 2" size)

const DESTINATIONS = [
  "qr.openform.co.za/menu",
  "qr.openform.co.za/sale",
  "qr.openform.co.za/drop",
  "qr.openform.co.za/email"
]

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

/* Build the fixed structural layer once: finders, separators, timing, alignment. */
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

const STRUCT = buildStructure()

/* Randomise just the data modules for a given seed. */
function buildData(seed) {
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

function usePrefersReducedMotion() {
  const [reduce, setReduce] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    const update = () => setReduce(mq.matches)
    update()
    mq.addEventListener("change", update)
    return () => mq.removeEventListener("change", update)
  }, [])
  return reduce
}

/* Live-scan counter — isolated so its tick doesn't re-render the matrix. */
function ScanPill({ reduce }) {
  const [scans, setScans] = useState(2480)
  useEffect(() => {
    if (reduce) return
    const id = setInterval(
      () => setScans((s) => s + Math.floor(Math.random() * 9) + 2),
      2600
    )
    return () => clearInterval(id)
  }, [reduce])

  return (
    <div className="qr-scan-pill glass-card-static">
      <svg
        className="qr-spark"
        width="34"
        height="22"
        viewBox="0 0 34 22"
        aria-hidden="true"
      >
        {[6, 11, 8, 15, 12, 19].map((h, i) => (
          <rect
            key={i}
            className="qr-spark-bar"
            x={i * 6}
            y={22 - h}
            width="4"
            height={h}
            rx="1.5"
            fill="url(#qrMod)"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </svg>
      <div>
        <div className="qr-scan-num">{scans.toLocaleString("en-US")}</div>
        <div className="qr-scan-lbl">live scans</div>
      </div>
    </div>
  )
}

export default function HeroQR() {
  const [armed, setArmed] = useState(false)
  const [seed, setSeed] = useState(1)
  const [urlIndex, setUrlIndex] = useState(0)
  const reduce = usePrefersReducedMotion()

  const data = useMemo(() => buildData(seed), [seed])

  // Trigger the assemble ripple just after hydration.
  useEffect(() => {
    const id = requestAnimationFrame(() => setArmed(true))
    return () => cancelAnimationFrame(id)
  }, [])

  // Regenerate the data field + reroute on a loop (skipped if reduced motion).
  useEffect(() => {
    if (reduce) return // assembled, but no looping regeneration
    const id = setInterval(() => {
      setSeed((s) => s + 1)
      setUrlIndex((i) => (i + 1) % DESTINATIONS.length)
    }, 3800)
    return () => clearInterval(id)
  }, [reduce])

  const rects = []
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const reserved = STRUCT.reserved[r][c]
      const on = reserved ? STRUCT.structOn[r][c] : data[r][c]
      let opacity
      if (!armed) opacity = 0.06
      else if (reserved) opacity = on ? 1 : 0
      else opacity = on ? 0.9 : 0.06

      rects.push(
        <rect
          key={`${r}-${c}`}
          x={c + 0.06}
          y={r + 0.06}
          width={0.88}
          height={0.88}
          rx={0.26}
          fill="url(#qrMod)"
          opacity={opacity}
          style={{
            transition: "opacity 0.55s ease",
            transitionDelay: armed ? `${(r + c) * 15}ms` : "0ms"
          }}
        />
      )
    }
  }

  return (
    <div className="qr-hero-card">
      <ScanPill reduce={reduce} />

      <div className="qr-hero-stage" style={{ width: 248, height: 248 }}>
        <svg
          className="qr-hero-svg"
          width={248}
          height={248}
          viewBox={`0 0 ${N} ${N}`}
          role="img"
          aria-label="Dynamic QR code that re-routes to new destinations"
        >
          <defs>
            <linearGradient
              id="qrMod"
              gradientUnits="userSpaceOnUse"
              x1="0"
              y1="0"
              x2={N}
              y2={N}
            >
              <stop offset="0%" stopColor="#00d4ff" />
              <stop offset="50%" stopColor="#7c3aed" />
              <stop offset="100%" stopColor="#f472b6" />
            </linearGradient>
            <linearGradient id="qrBeam" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00d4ff" stopOpacity="0" />
              <stop offset="50%" stopColor="#00d4ff" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#00d4ff" stopOpacity="0" />
            </linearGradient>
          </defs>

          {rects}

          {!reduce && (
            <g style={{ mixBlendMode: "screen" }}>
              <rect
                x={-1}
                y={-0.8}
                width={N + 2}
                height={1.6}
                fill="url(#qrBeam)"
              />
              <rect
                x={-1}
                y={-0.06}
                width={N + 2}
                height={0.12}
                fill="#cffafe"
                opacity={0.9}
              />
              <animateTransform
                attributeName="transform"
                attributeType="XML"
                type="translate"
                values={`0 -2; 0 ${N + 2}`}
                keyTimes="0;1"
                dur="2.6s"
                repeatCount="indefinite"
              />
              <animate
                attributeName="opacity"
                values="0;1;1;0"
                keyTimes="0;0.12;0.88;1"
                dur="2.6s"
                repeatCount="indefinite"
              />
            </g>
          )}
        </svg>

        <span className="qr-bracket qr-bracket-tl" />
        <span className="qr-bracket qr-bracket-tr" />
        <span className="qr-bracket qr-bracket-bl" />
        <span className="qr-bracket qr-bracket-br" />
      </div>

      <div className="qr-route">
        <span className="qr-route-dot" />
        <span className="qr-route-label">routing to</span>
        <span className="qr-route-url">
          <span key={urlIndex} className="qr-url-text">
            {DESTINATIONS[urlIndex]}
          </span>
        </span>
      </div>
    </div>
  )
}
