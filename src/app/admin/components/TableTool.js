"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import styles from "./LegalEditor.module.css"

const MAX_COLUMNS = 6
const MAX_ROWS = 8
const START_SIZE = { columns: 3, rows: 3 }

const clamp = (value, min, max) => Math.min(Math.max(value, min), max)
const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`

/**
 * The toolbar's Table button. It opens a grid for choosing the table's size,
 * like the one in Word: point at (or arrow-key to) a square and click it.
 * The grid's top row is the table's header row. `boundaryRef` is the box the
 * grid should stay inside.
 */
export default function TableTool({ onInsert, boundaryRef }) {
  const [open, setOpen] = useState(false)
  const [size, setSize] = useState(START_SIZE)
  const wrapperRef = useRef(null)
  const buttonRef = useRef(null)
  const pickerRef = useRef(null)

  const squareFor = ({ columns, rows }) =>
    pickerRef.current?.querySelector(`[data-size="${columns}x${rows}"]`)

  // On opening: keep the grid inside the panel, and focus its starting square.
  useLayoutEffect(() => {
    if (!open) return
    const picker = pickerRef.current
    const wrapper = wrapperRef.current.getBoundingClientRect()
    const boundary = boundaryRef.current?.getBoundingClientRect()
    if (boundary) {
      const left = Math.min(0, boundary.right - 8 - picker.offsetWidth - wrapper.left)
      picker.style.left = `${Math.max(left, boundary.left + 8 - wrapper.left)}px`
    }
    squareFor(START_SIZE)?.focus()
  }, [open, boundaryRef])

  // Clicking anywhere else closes it.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event) => {
      if (!wrapperRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [open])

  function toggle() {
    if (!open) setSize(START_SIZE)
    setOpen(!open)
  }

  function pick(chosen) {
    setOpen(false)
    onInsert(chosen.columns, chosen.rows)
  }

  function handleKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault()
      setOpen(false)
      buttonRef.current?.focus()
      return
    }
    const move = {
      ArrowRight: [1, 0],
      ArrowLeft: [-1, 0],
      ArrowDown: [0, 1],
      ArrowUp: [0, -1]
    }[event.key]
    if (!move) return
    event.preventDefault()
    const next = {
      columns: clamp(size.columns + move[0], 1, MAX_COLUMNS),
      rows: clamp(size.rows + move[1], 1, MAX_ROWS)
    }
    setSize(next)
    squareFor(next)?.focus()
  }

  return (
    <div
      ref={wrapperRef}
      className={styles.tableTool}
      // Tabbing away from the grid closes it.
      onBlur={(event) => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpen(false)
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        title="Insert a table"
        className={`${styles.toolButton} ${open ? styles.toolButtonOpen : ""}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        // Keep the text box's selection while clicking.
        onMouseDown={(event) => event.preventDefault()}
        onClick={toggle}
      >
        Table
      </button>

      {open && (
        <div
          ref={pickerRef}
          className={styles.tablePicker}
          role="dialog"
          aria-label="Table size"
          onKeyDown={handleKeyDown}
        >
          <div className={styles.tableGrid}>
            {Array.from({ length: MAX_ROWS }, (_, row) =>
              Array.from({ length: MAX_COLUMNS }, (_, column) => {
                const square = { columns: column + 1, rows: row + 1 }
                const inTable = square.columns <= size.columns && square.rows <= size.rows
                const isCurrent = square.columns === size.columns && square.rows === size.rows
                return (
                  <button
                    key={`${square.columns}x${square.rows}`}
                    type="button"
                    data-size={`${square.columns}x${square.rows}`}
                    tabIndex={isCurrent ? 0 : -1}
                    aria-label={`${plural(square.columns, "column")}, ${plural(square.rows, "row")}`}
                    className={[
                      styles.tableSquare,
                      inTable ? styles.tableSquareOn : "",
                      row === 0 ? styles.tableSquareHeader : ""
                    ].join(" ")}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setSize(square)}
                    onFocus={() => setSize(square)}
                    onClick={() => pick(square)}
                  />
                )
              })
            )}
          </div>
          <p className={styles.tablePickerSize} aria-hidden="true">
            {plural(size.columns, "column")} × {plural(size.rows, "row")}
          </p>
          <p className={styles.tablePickerHint}>The top row is the header.</p>
        </div>
      )}
    </div>
  )
}
