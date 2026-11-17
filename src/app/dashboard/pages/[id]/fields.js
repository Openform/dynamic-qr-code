"use client"

import { ArrowDownIcon, ArrowUpIcon, TrashIcon } from "@/app/components/icons"
import { useState } from "react"
import styles from "../pages.module.css"

/**
 * Fields the campaign page editor's blocks share: text inputs, photo
 * pickers, small icon buttons, and the head of an item in a list (a button,
 * a question, a price) with its arrows and remove button.
 */

/**
 * A photo for a block: a thumbnail of the one chosen, and buttons to upload
 * one (resized in the browser first) or remove it. `onUpload(file, maxSide)`
 * resolves to the new image's id.
 */
export function ImageField({ id, label, value, images, onChange, onUpload, maxSide, round = false, error, hint }) {
  const [busy, setBusy] = useState(false)
  const [uploadError, setUploadError] = useState("")
  const image = value ? images?.[value] : null

  async function choose(e) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setBusy(true)
    setUploadError("")
    try {
      onChange(await onUpload(file, maxSide))
    } catch (err) {
      setUploadError(err.message || "That photo couldn’t be uploaded.")
    } finally {
      setBusy(false)
    }
  }

  const message = uploadError || error
  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel} id={`${id}-label`}>
        {label}
      </span>
      <div className={styles.imageRow}>
        {image ? (
          // A preview of the owner's own upload.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image.src} alt="" className={round ? styles.thumbRound : styles.thumb} />
        ) : (
          <span className={round ? styles.thumbRound : styles.thumb} aria-hidden="true" />
        )}
        <label className={`btn btn-secondary btn-sm${busy ? ` ${styles.busy}` : ""}`} htmlFor={id}>
          {busy ? "Uploading…" : image ? "Replace" : "Upload photo"}
        </label>
        <input
          id={id}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/*"
          className={styles.fileInput}
          onChange={choose}
          disabled={busy}
          aria-labelledby={`${id}-label`}
        />
        {image && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(null)} disabled={busy}>
            Remove
          </button>
        )}
      </div>
      {message ? <p className={styles.fieldError}>{message}</p> : hint ? <p className={styles.hint}>{hint}</p> : null}
    </div>
  )
}

/** A labelled text input or textarea, with its error or hint under it. */
export function TextField({ id, label, value, onChange, max, placeholder, type = "text", multiline = false, rows = 3, error, hint }) {
  const className = `input-field${multiline ? ` ${styles.textarea}` : ""}${error ? " input-error" : ""}`
  const common = {
    id,
    className,
    value: value ?? "",
    maxLength: max,
    placeholder,
    onChange: (e) => onChange(e.target.value),
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error || hint ? `${id}-note` : undefined
  }
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.fieldLabel}>
        {label}
      </label>
      {multiline ? <textarea rows={rows} {...common} /> : <input type={type} {...common} />}
      {error ? (
        <p id={`${id}-note`} className={styles.fieldError}>
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-note`} className={styles.hint}>
          {hint}
        </p>
      ) : null}
    </div>
  )
}

/**
 * A photo picker that adds a photo rather than choosing one: it uploads the
 * file (`onUpload(file, maxSide)` resolves to the new image's id) and hands
 * the id to `onAdd`.
 */
export function AddPhotoButton({ id, label, onUpload, onAdd, maxSide }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  async function choose(e) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setBusy(true)
    setError("")
    try {
      onAdd(await onUpload(file, maxSide))
    } catch (err) {
      setError(err.message || "That photo couldn’t be uploaded.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.field} style={{ alignSelf: "flex-start" }}>
      <label className={`btn btn-secondary btn-sm${busy ? ` ${styles.busy}` : ""}`} htmlFor={id}>
        {busy ? "Uploading…" : label}
      </label>
      <input id={id} type="file" accept="image/jpeg,image/png,image/webp,image/*" className={styles.fileInput} onChange={choose} disabled={busy} />
      {error && <p className={styles.fieldError}>{error}</p>}
    </div>
  )
}

/**
 * The head of item `index` in a list of `count`: its name, arrows to move
 * it, and a remove button (off while it's the last one, unless `canRemoveLast`).
 */
export function SubItemHead({ title, name, index, count, onMove, onRemove, canRemoveLast = false }) {
  const n = `${name} ${index + 1}`
  return (
    <div className={styles.subHead}>
      <span className={styles.subTitle}>{title ?? n}</span>
      <IconButton label={`Move ${n} up`} onClick={() => onMove(-1)} disabled={index === 0}>
        <ArrowUpIcon size={16} />
      </IconButton>
      <IconButton label={`Move ${n} down`} onClick={() => onMove(1)} disabled={index === count - 1}>
        <ArrowDownIcon size={16} />
      </IconButton>
      <IconButton label={`Remove ${n}`} onClick={onRemove} disabled={count === 1 && !canRemoveLast}>
        <TrashIcon size={16} />
      </IconButton>
    </div>
  )
}

export function IconButton({ label, onClick, disabled, expanded, controls, children }) {
  return (
    <button
      type="button"
      className={styles.iconButton}
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      aria-expanded={expanded}
      aria-controls={expanded ? controls : undefined}
    >
      {children}
    </button>
  )
}
