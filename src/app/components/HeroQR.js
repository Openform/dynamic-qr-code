"use client"

import { useEffect, useState } from "react"
import { N, STRUCT, buildData } from "./landing/qrMatrix"
import { usePrefersReducedMotion } from "./landing/hooks"

/**
 * Animated "living" QR code for the landing hero.
 *
 * It tells the product story in one visual:
 *   1. The matrix assembles in a diagonal ripple    -> "Generate"
 *   2. A laser line sweeps across it on a loop       -> "Scan"
 *   3. The routing label swaps to a new destination, -> "Change the link,
 *      while the pattern itself never changes            keep the code"
 *   4. A floating pill ticks live scans              -> "Real-time analytics"
 */

const DESTINATIONS = [
  "yoursite.com/menu",
  "yoursite.com/specials",
  "yoursite.com/events",
  "yoursite.com/feedback"
]

// The printed code: one fixed pattern, like a real dynamic QR code.
const DATA = buildData(1)

const REROUTE_EVERY_MS = 3800

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
  // How many times the link has changed since the page loaded.
  const [reroutes, setReroutes] = useState(0)
  const reduce = usePrefersReducedMotion()

  // Trigger the assemble ripple just after hydration.
  useEffect(() => {
    const id = requestAnimationFrame(() => setArmed(true))
    return () => cancelAnimationFrame(id)
  }, [])

  // Point the code somewhere new on a loop (skipped if reduced motion).
  useEffect(() => {
    if (reduce) return
    const id = setInterval(() => setReroutes((n) => n + 1), REROUTE_EVERY_MS)
    return () => clearInterval(id)
  }, [reduce])

  const urlIndex = reroutes % DESTINATIONS.length

  const rects = []
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const reserved = STRUCT.reserved[r][c]
      const on = reserved ? STRUCT.structOn[r][c] : DATA[r][c]
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
          aria-label="Dynamic QR code whose link changes while the code stays the same"
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

        {/* A ripple each time the link changes. Keyed so it replays. */}
        {reroutes > 0 && (
          <span key={reroutes} className="qr-reroute-ring" aria-hidden="true" />
        )}
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

      {reroutes > 0 && (
        <div
          key={reroutes}
          className="qr-change-toast glass-card-static"
          aria-hidden="true"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12l5 5L20 7" />
          </svg>
          Link changed · same code
        </div>
      )}
    </div>
  )
}
