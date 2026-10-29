"use client"

import { useEffect, useRef, useState } from "react"
import { N, STRUCT, buildData } from "./qrMatrix"
import { useInView, usePrefersReducedMotion } from "./hooks"
import styles from "./StyleMorph.module.css"

/**
 * One QR code that morphs between the styles you can give your codes. It
 * cycles on its own while on screen; picking a style stops the cycle.
 */

const STYLES = [
  { id: "square", label: "Square" },
  { id: "dots", label: "Dots" },
  { id: "rounded", label: "Rounded" },
  { id: "gradient", label: "Gradient" }
]

const CYCLE_MS = 2400

const DATA = buildData(7)

// Each module's class, worked out once: finder/structure modules keep their
// square-ish shape in every style, like real styled QR codes.
const CELLS = []
for (let r = 0; r < N; r++) {
  for (let c = 0; c < N; c++) {
    const reserved = STRUCT.reserved[r][c]
    const on = reserved ? STRUCT.structOn[r][c] : DATA[r][c]
    CELLS.push(
      `${styles.cell} ${on ? styles.on : styles.off} ${reserved ? styles.finder : ""}`
    )
  }
}

export default function StyleMorph() {
  const ref = useRef(null)
  const inView = useInView(ref)
  const reduce = usePrefersReducedMotion()
  const [index, setIndex] = useState(0)
  const [picked, setPicked] = useState(false)

  useEffect(() => {
    if (!inView || reduce || picked) return
    const id = setInterval(
      () => setIndex((i) => (i + 1) % STYLES.length),
      CYCLE_MS
    )
    return () => clearInterval(id)
  }, [inView, reduce, picked])

  const current = STYLES[index]

  return (
    <div ref={ref} className={styles.wrap}>
      <div className={styles.plate}>
        <div
          className={`${styles.qr} ${styles[current.id]}`}
          role="img"
          aria-label={`Example QR code in the ${current.label.toLowerCase()} style`}
        >
          {CELLS.map((className, i) => (
            <span key={i} className={className} />
          ))}
        </div>
      </div>

      <div className={styles.options} role="group" aria-label="QR code style">
        {STYLES.map((style, i) => (
          <button
            key={style.id}
            type="button"
            className={styles.option}
            aria-pressed={i === index}
            onClick={() => {
              setIndex(i)
              setPicked(true)
            }}
          >
            {style.label}
          </button>
        ))}
      </div>
    </div>
  )
}
