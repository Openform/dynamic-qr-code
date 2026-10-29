"use client"

import { useRef } from "react"

/**
 * A grid whose tiles light up around the mouse pointer. Each child marked
 * `data-spotlight` gets the pointer position as `--mx` / `--my`, which its
 * CSS uses for a soft glow and a lit edge.
 */
export default function SpotlightGrid({ className, children }) {
  const gridRef = useRef(null)
  const frame = useRef(0)

  function handlePointerMove(event) {
    if (event.pointerType !== "mouse") return
    const { clientX, clientY } = event
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => {
      const tiles = gridRef.current?.querySelectorAll("[data-spotlight]") ?? []
      for (const tile of tiles) {
        const rect = tile.getBoundingClientRect()
        tile.style.setProperty("--mx", `${clientX - rect.left}px`)
        tile.style.setProperty("--my", `${clientY - rect.top}px`)
      }
    })
  }

  return (
    <div ref={gridRef} className={className} onPointerMove={handlePointerMove}>
      {children}
    </div>
  )
}
