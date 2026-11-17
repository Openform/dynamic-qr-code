"use client"

import { useEffect, useRef } from "react"
import { ADDABLE_BLOCKS } from "@/lib/pageEditing"
import { BlockIcon } from "./blockIcons"
import styles from "../pages.module.css"

/**
 * "Add a block": every kind of block with its icon and a line on what it's
 * for. `where` says where the new block goes ("below “Price list”"), and
 * `onPick(type)` adds it. A native <dialog>, so Escape closes it and focus
 * stays inside while it's open.
 */
export default function AddBlockDialog({ where, onPick, onClose }) {
  const ref = useRef(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog.open) dialog.showModal()
    return () => dialog.close()
  }, [])

  return (
    <dialog
      ref={ref}
      className={styles.addDialog}
      aria-labelledby="add-block-title"
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      // A click on the backdrop lands on the dialog itself.
      onClick={(e) => e.target === ref.current && onClose()}
    >
      <div className={styles.addCard}>
        <div className="modal-header" style={{ marginBottom: 4 }}>
          <h2 id="add-block-title" className="modal-title">
            Add a block
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <p className={styles.hint} style={{ marginTop: 0, marginBottom: 16 }}>
          It goes {where}. You can move it afterwards.
        </p>
        <div className={styles.addGrid}>
          {ADDABLE_BLOCKS.map(({ type, label, description }) => (
            <button key={type} type="button" className={styles.addTile} onClick={() => onPick(type)}>
              <span className={styles.addIcon}>
                <BlockIcon type={type} size={20} />
              </span>
              <span className={styles.addText}>
                <span className={styles.addName}>{label}</span>
                <span className={styles.addDescription}>{description}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </dialog>
  )
}
