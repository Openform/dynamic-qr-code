"use client"

/**
 * Bulk creation of QR codes: one shared style, one collection, many
 * title + link rows.
 *
 *   Style  →  Rows  →  Review  →  (create)
 *
 * Rows can be typed into the grid, pasted from a spreadsheet (into the box or
 * straight into a cell) or loaded from a CSV file. Every row is checked with
 * the same rules the server applies (lib/codeInput.js); the server re-checks
 * and creates the whole batch or nothing.
 */

import { useState, useEffect, useRef } from "react"
import { normalizeStyle, evaluateContrast } from "@/lib/qrStyle"
import {
  MAX_BULK_ROWS,
  parseBulkText,
  validateBulkRows,
  findDuplicateRows
} from "@/lib/bulk"
import StyleEditor, { StylePreview } from "./StyleEditor"
import { CollectionSelect } from "./CreateEditModal"
import css from "./BulkCreateModal.module.css"
import footerStyles from "./CreateEditModal.module.css"

// Largest CSV file we'll read in the browser (200 rows is a few tens of KB).
const MAX_FILE_BYTES = 1024 * 1024

const STEPS = [
  { id: "style", label: "Style" },
  { id: "rows", label: "Rows" },
  { id: "review", label: "Review" }
]

// Each grid row gets a stable id so React keeps inputs in place as rows are
// added and removed.
let rowSeq = 0
const makeRow = (title = "", destinationUrl = "") => ({
  id: ++rowSeq,
  title,
  destinationUrl
})
const isBlank = (row) =>
  row.title.trim() === "" && row.destinationUrl.trim() === ""
const startingRows = () => Array.from({ length: 5 }, () => makeRow())

/** Keep at most MAX_BULK_ROWS filled rows (blank rows don't count). */
function fitRows(rows) {
  let filled = 0
  const kept = []
  let truncated = false
  for (const row of rows) {
    if (isBlank(row)) {
      kept.push(row)
    } else if (filled < MAX_BULK_ROWS) {
      filled++
      kept.push(row)
    } else {
      truncated = true
    }
  }
  return { rows: kept, truncated }
}

/**
 * Decode an uploaded CSV. Excel's plain "CSV" export is Windows-1252, not
 * UTF-8, which would turn accented names (é, ü, ô …) into replacement
 * characters, so fall back to that when UTF-8 decoding fails.
 */
async function readFileText(file) {
  const buffer = await file.arrayBuffer()
  const utf8 = new TextDecoder("utf-8").decode(buffer)
  if (!utf8.includes("�")) return utf8
  return new TextDecoder("windows-1252").decode(buffer)
}

export default function BulkCreateModal({
  isOpen,
  onClose,
  onCreated,
  onRefresh,
  collections = [],
  defaultCollectionId = null,
  remaining = Infinity,
  planName = "",
  limit = null,
  usedCount = 0
}) {
  if (!isOpen) return null

  // Mounted only while open, so every opening starts from a clean slate.
  return (
    <BulkForm
      onClose={onClose}
      onCreated={onCreated}
      onRefresh={onRefresh}
      collections={collections}
      defaultCollectionId={defaultCollectionId}
      remaining={remaining}
      planName={planName}
      limit={limit}
      usedCount={usedCount}
    />
  )
}

function BulkForm({
  onClose,
  onCreated,
  onRefresh,
  collections,
  defaultCollectionId,
  remaining,
  planName,
  limit,
  usedCount
}) {
  const [step, setStep] = useState("style")
  const [style, setStyle] = useState(() => normalizeStyle(null))
  const [collectionId, setCollectionId] = useState(
    defaultCollectionId == null ? "" : String(defaultCollectionId)
  )
  const [rows, setRows] = useState(startingRows)
  const [pasteText, setPasteText] = useState("")
  const [notice, setNotice] = useState(null) // { text, warn }
  const [showErrors, setShowErrors] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState("")
  const fileRef = useRef(null)

  function patch(partial) {
    setStyle((s) => ({ ...s, ...partial }))
  }
  function setField(key, value) {
    setStyle((s) => ({ ...s, [key]: value }))
  }

  // Escape closes the screen, but not while the request is in flight.
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape" && !submitting) onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose, submitting])

  // ── Derived data ──

  const contrast = evaluateContrast(style)
  const filled = rows.filter((r) => !isBlank(r))
  const { items, errors } = validateBulkRows(filled)
  const duplicates = new Set(findDuplicateRows(filled)) // indexes into `filled`
  const duplicateIds = new Set([...duplicates].map((i) => filled[i].id))

  // Per-row messages, keyed by the grid row's id.
  const rowErrors = {}
  for (const e of errors) {
    const id = filled[e.row].id
    rowErrors[id] = rowErrors[id] || {}
    rowErrors[id][e.field] = e.message
  }
  const invalidCount = Object.keys(rowErrors).length
  const httpCount = filled.filter((r) =>
    /^\s*http:\/\//i.test(r.destinationUrl)
  ).length

  const maxAllowed = Math.min(MAX_BULK_ROWS, remaining)
  const overBy = Math.max(0, filled.length - maxAllowed)
  const collectionName =
    collectionId === ""
      ? "Default Collection"
      : (collections.find((c) => String(c.id) === collectionId)?.name ??
        "Default Collection")

  // What the preview encodes: a realistic short link, so the dot density
  // matches the real codes (each one will encode its own /r/<id> link).
  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://example.com"
  const previewText = `${origin}/r/aBcDeFgHiJ`

  // ── Row editing ──

  function updateRow(id, field, value) {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    )
  }

  function removeRow(id) {
    const next = rows.filter((r) => r.id !== id)
    setRows(next.length ? next : [makeRow()])
  }

  function addBlankRow() {
    setRows((prev) => [...prev, makeRow()])
  }

  // Replace the grid with `next`, keeping within the row cap, and show
  // `message` (as a warning when `warn`) unless rows had to be dropped.
  function applyRows(next, message, warn = false) {
    const fitted = fitRows(next)
    setRows(fitted.rows.length ? fitted.rows : [makeRow()])
    if (fitted.truncated) {
      setNotice({
        text: `Only the first ${MAX_BULK_ROWS} rows were kept — you can create at most ${MAX_BULK_ROWS} codes at a time.`,
        warn: true
      })
    } else {
      setNotice(message ? { text: message, warn } : null)
    }
  }

  // Add parsed rows after the ones already filled in (dropping blank
  // placeholder rows), and say what happened.
  function appendParsed(parsed) {
    if (parsed.rows.length === 0) {
      setNotice({
        text: "Nothing to add — no rows were found in that text.",
        warn: true
      })
      return false
    }
    const added = parsed.rows.map((r) => makeRow(r.title, r.destinationUrl))
    const existing = rows.filter((r) => !isBlank(r))
    const bits = [
      `Added ${added.length} row${added.length === 1 ? "" : "s"}${parsed.hasHeader ? " (header row skipped)" : ""}.`
    ]
    if (parsed.unterminatedQuote) {
      bits.push(
        "A quote mark was never closed, so the last row may contain more text than intended — please check it."
      )
    }
    applyRows([...existing, ...added], bits.join(" "), parsed.unterminatedQuote)
    setShowErrors(false)
    return true
  }

  function handleAddPasted() {
    if (appendParsed(parseBulkText(pasteText))) setPasteText("")
  }

  async function handleFile(e) {
    const file = e.target.files?.[0]
    e.target.value = "" // allow choosing the same file again
    if (!file) return
    if (/\.xlsx?$/i.test(file.name)) {
      setNotice({
        text: "Excel workbooks (.xlsx) can’t be read directly. In Excel, choose File → Save As → CSV and upload that file instead — or just copy the cells and paste them into the box above.",
        warn: true
      })
      return
    }
    if (file.size > MAX_FILE_BYTES) {
      setNotice({
        text: "That file is too large. A bulk batch is at most 200 rows.",
        warn: true
      })
      return
    }
    try {
      appendParsed(parseBulkText(await readFileText(file)))
    } catch {
      setNotice({ text: "Couldn’t read that file.", warn: true })
    }
  }

  // Pasting several rows from a spreadsheet straight into a cell fills the grid
  // from that row down, instead of mashing everything into one cell.
  function handleCellPaste(e, rowId) {
    const text = e.clipboardData.getData("text")
    if (!/[\n\r\t]/.test(text)) return // an ordinary single-value paste
    e.preventDefault()
    const parsed = parseBulkText(text)
    if (parsed.rows.length === 0) return
    const index = rows.findIndex((r) => r.id === rowId)
    const target = rows[index]
    const fresh = parsed.rows.map((r) => makeRow(r.title, r.destinationUrl))
    // Take over the row pasted into when it's still empty; otherwise go below it.
    const at = isBlank(target) ? index : index + 1
    const after = isBlank(target) ? index + 1 : at
    applyRows(
      [...rows.slice(0, at), ...fresh, ...rows.slice(after)],
      `Added ${fresh.length} row${fresh.length === 1 ? "" : "s"}.`
    )
    setShowErrors(false)
  }

  function upgradeHttp() {
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        destinationUrl: r.destinationUrl.replace(/^(\s*)http:\/\//i, "$1https://")
      }))
    )
  }

  function removeInvalid() {
    const next = rows.filter((r) => isBlank(r) || !rowErrors[r.id])
    setRows(next.length ? next : [makeRow()])
  }

  // Drop the last rows until the batch fits what the package allows.
  function trimToFit() {
    let toDrop = overBy
    const next = [...rows]
    for (let i = next.length - 1; i >= 0 && toDrop > 0; i--) {
      if (!isBlank(next[i])) {
        next.splice(i, 1)
        toDrop--
      }
    }
    setRows(next.length ? next : [makeRow()])
  }

  function clearAll() {
    setRows(startingRows())
    setNotice(null)
    setShowErrors(false)
  }

  // ── Navigation ──

  function goToReview() {
    if (filled.length === 0) {
      setShowErrors(true)
      setNotice({ text: "Add at least one row to continue.", warn: true })
      return
    }
    if (errors.length > 0) {
      setShowErrors(true)
      const firstBad = filled.find((r) => rowErrors[r.id])
      if (firstBad) {
        document
          .getElementById(`bulk-row-${firstBad.id}`)
          ?.scrollIntoView({ block: "center", behavior: "smooth" })
      }
      return
    }
    if (overBy > 0) return // the over-limit banner explains and offers a fix
    setNotice(null)
    setSubmitError("")
    setStep("review")
  }

  // ── Submit ──

  async function handleCreate() {
    if (submitting) return
    setSubmitting(true)
    setSubmitError("")
    try {
      const res = await fetch("/api/qrcodes/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: items,
          styleConfig: style,
          collectionId: collectionId === "" ? null : Number(collectionId)
        })
      })
      const data = await res.json().catch(() => ({}))

      if (res.ok) {
        onCreated({
          qrcodes: data.qrcodes ?? [],
          collectionId: collectionId === "" ? null : Number(collectionId),
          collectionName
        })
        return
      }

      setSubmitError(
        data.error || "Could not create the QR codes. Please try again."
      )
      if (res.status === 400 && Array.isArray(data.errors)) {
        // The server found rows the browser didn't — send them back to the grid.
        setShowErrors(true)
        setStep("rows")
      }
      // e.g. the limit changed from another tab: make the dashboard catch up.
      if (res.status === 403) onRefresh?.()
    } catch (error) {
      console.error("Bulk create failed:", error)
      setSubmitError(
        "We couldn’t confirm whether the codes were created. Check your dashboard before trying again."
      )
      onRefresh?.()
    } finally {
      setSubmitting(false)
    }
  }

  // ── Render ──

  const stepIndex = STEPS.findIndex((s) => s.id === step)

  return (
    <div className="modal-overlay">
      <div
        className="modal-card"
        style={{ maxWidth: "960px", maxHeight: "92vh", overflowY: "auto" }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-modal-title"
      >
        <div className="modal-header" style={{ marginBottom: "16px" }}>
          <h2 className="modal-title" id="bulk-modal-title">
            Bulk create QR codes
          </h2>
          <button
            className="modal-close"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        <ol className={css.steps} aria-label="Progress" style={{ padding: 0 }}>
          {STEPS.map((s, i) => (
            <li
              key={s.id}
              className={`${css.step} ${i === stepIndex ? css.stepActive : ""} ${i < stepIndex ? css.stepDone : ""}`}
              aria-current={i === stepIndex ? "step" : undefined}
              style={{ listStyle: "none" }}
            >
              <span className={css.stepNum}>{i < stepIndex ? "✓" : i + 1}</span>
              {s.label}
            </li>
          ))}
        </ol>

        {/* ───────── Step 1: style ───────── */}
        {step === "style" && (
          <>
            <p style={styles.lead}>
              Choose how the codes look. Every code in this batch gets the same
              style, and a code’s appearance is locked once it’s created.
            </p>
            <div style={styles.contentGrid}>
              <div style={styles.formSection}>
                <StyleEditor style={style} setField={setField} patch={patch} />
              </div>
              <StylePreview
                style={style}
                text={previewText}
                contrast={contrast}
              />
            </div>
          </>
        )}

        {/* ───────── Step 2: rows ───────── */}
        {step === "rows" && (
          <>
            {collections.length > 0 && (
              <CollectionSelect
                collections={collections}
                value={collectionId}
                onChange={setCollectionId}
                hint="All the codes in this batch are added to this collection."
              />
            )}

            <div className="input-group" style={{ marginBottom: "20px" }}>
              <label htmlFor="bulk-paste" className="input-label">
                Paste from a spreadsheet or CSV
              </label>
              <textarea
                id="bulk-paste"
                className={`input-field ${css.pasteBox}`}
                placeholder={
                  "Menu\tqrgo.co.za/menu\nWine list\tqrgo.co.za/wine"
                }
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
              />
              <div className={css.pasteActions}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleAddPasted}
                  disabled={pasteText.trim() === ""}
                >
                  Add to list
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => fileRef.current?.click()}
                >
                  Upload a CSV file…
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.tsv,.txt,text/csv,text/plain"
                  className={css.hiddenFile}
                  onChange={handleFile}
                  aria-label="Upload a CSV file"
                />
              </div>
              <p style={styles.hint}>
                Two columns: title, then link. A header row is fine, and links
                without https:// get it added. Up to {MAX_BULK_ROWS} rows.
              </p>
              {notice && (
                <p
                  className={`${css.notice} ${notice.warn ? css.noticeWarn : ""}`}
                  role="status"
                >
                  {notice.text}
                </p>
              )}
            </div>

            <div className={css.gridHead} aria-hidden="true">
              <span />
              <span>Title</span>
              <span>Link</span>
              <span />
            </div>
            <div className={css.rows}>
              {rows.map((row, i) => {
                const errs = (showErrors && rowErrors[row.id]) || null
                const isDup = duplicateIds.has(row.id)
                const message =
                  errs?.title ||
                  errs?.destinationUrl ||
                  (isDup ? "Same title and link as an earlier row." : "")
                return (
                  <div
                    key={row.id}
                    id={`bulk-row-${row.id}`}
                    className={`${css.row} ${errs ? css.rowInvalid : ""}`}
                  >
                    <span className={css.num}>{i + 1}</span>
                    <div className={css.cell}>
                      <input
                        type="text"
                        className="input-field"
                        placeholder="Title"
                        aria-label={`Title for row ${i + 1}`}
                        aria-invalid={errs?.title ? true : undefined}
                        value={row.title}
                        onChange={(e) =>
                          updateRow(row.id, "title", e.target.value)
                        }
                        onPaste={(e) => handleCellPaste(e, row.id)}
                      />
                    </div>
                    <div className={`${css.cell} ${css.urlCell}`}>
                      <input
                        type="text"
                        inputMode="url"
                        className="input-field"
                        placeholder="example.com/page"
                        aria-label={`Link for row ${i + 1}`}
                        aria-invalid={errs?.destinationUrl ? true : undefined}
                        value={row.destinationUrl}
                        onChange={(e) =>
                          updateRow(row.id, "destinationUrl", e.target.value)
                        }
                        onPaste={(e) => handleCellPaste(e, row.id)}
                      />
                    </div>
                    <button
                      type="button"
                      className={css.remove}
                      onClick={() => removeRow(row.id)}
                      aria-label={`Remove row ${i + 1}`}
                      title="Remove row"
                    >
                      ×
                    </button>
                    {message && (
                      <p
                        className={`${css.rowMsg} ${errs ? "" : css.rowMsgWarn}`}
                      >
                        {message}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>

            <div className={css.gridTools}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={addBlankRow}
                disabled={rows.length >= MAX_BULK_ROWS}
              >
                + Add row
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={clearAll}
                disabled={filled.length === 0}
              >
                Clear all
              </button>
              <span
                className={`${css.count} ${overBy > 0 ? css.countOver : ""}`}
                aria-live="polite"
              >
                {filled.length} {filled.length === 1 ? "code" : "codes"}
                {Number.isFinite(remaining)
                  ? ` · room for ${remaining} more on your ${planName} package`
                  : ""}
              </span>
            </div>

            {showErrors && invalidCount > 0 && (
              <div className={`${css.banner} ${css.bannerError}`} role="alert">
                <span className={css.bannerText}>
                  {invalidCount === 1
                    ? "1 row needs fixing before you can continue."
                    : `${invalidCount} rows need fixing before you can continue.`}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={removeInvalid}
                >
                  Remove {invalidCount === 1 ? "it" : "them"}
                </button>
              </div>
            )}

            {httpCount > 0 && (
              <div className={css.banner}>
                <span className={css.bannerText}>
                  {httpCount} {httpCount === 1 ? "link uses" : "links use"}{" "}
                  http://. Only https:// links are allowed. If those sites
                  support https, you can upgrade them in one go.
                </span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={upgradeHttp}
                >
                  Change to https://
                </button>
              </div>
            )}

            {overBy > 0 && (
              <div className={`${css.banner} ${css.bannerError}`} role="alert">
                <span className={css.bannerText}>
                  {maxAllowed < MAX_BULK_ROWS
                    ? `Your ${planName} package has room for ${remaining} more ${remaining === 1 ? "code" : "codes"}, but this list has ${filled.length}.`
                    : `You can create at most ${MAX_BULK_ROWS} codes at a time, but this list has ${filled.length}.`}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={trimToFit}
                >
                  Remove the last {overBy}
                </button>
              </div>
            )}

            {submitError && (
              <div className={`${css.banner} ${css.bannerError}`} role="alert">
                <span className={css.bannerText}>{submitError}</span>
              </div>
            )}
          </>
        )}

        {/* ───────── Step 3: review ───────── */}
        {step === "review" && (
          <>
            <div className={css.summary}>
              <div className={css.summaryMain}>
                <p style={{ ...styles.lead, marginBottom: "16px" }}>
                  You’re about to create{" "}
                  <strong>
                    {items.length} QR {items.length === 1 ? "code" : "codes"}
                  </strong>
                  . You’ll be able to undo this straight afterwards.
                </p>
                <dl className={css.facts}>
                  <dt>Collection</dt>
                  <dd>{collectionName}</dd>
                  <dt>Type</dt>
                  <dd>{style.codeType === "qr" ? "QR code" : "Data Matrix"}</dd>
                  {limit !== null && (
                    <>
                      <dt>Package</dt>
                      <dd>
                        {planName} — you’ll have{" "}
                        {usedCount + items.length} of {limit} codes
                      </dd>
                    </>
                  )}
                </dl>

                <div className={css.reviewList} aria-label="Codes to create">
                  {filled.map((row, i) => (
                    <div key={row.id} className={css.reviewItem}>
                      <span className={css.reviewTitle} title={items[i]?.title}>
                        {items[i]?.title}
                      </span>
                      <span
                        className={`${css.reviewUrl} ${duplicates.has(i) ? css.reviewDup : ""}`}
                        title={items[i]?.destinationUrl}
                      >
                        {items[i]?.destinationUrl}
                        {duplicates.has(i) ? " · duplicate" : ""}
                      </span>
                    </div>
                  ))}
                </div>
                {duplicates.size > 0 && (
                  <p style={{ ...styles.hint, color: "var(--warning)" }}>
                    {duplicates.size}{" "}
                    {duplicates.size === 1 ? "row repeats" : "rows repeat"} an
                    earlier row. That’s allowed — each code gets its own link —
                    but check it isn’t a double paste.
                  </p>
                )}
              </div>
              <StylePreview
                style={style}
                text={previewText}
                contrast={contrast}
              />
            </div>

            {submitError && (
              <div className={`${css.banner} ${css.bannerError}`} role="alert">
                <span className={css.bannerText}>{submitError}</span>
              </div>
            )}
          </>
        )}

        {/* ───────── Footer ───────── */}
        <div className={`modal-footer ${footerStyles.footer}`}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={
              step === "style"
                ? onClose
                : () => {
                    setSubmitError("")
                    setStep(step === "review" ? "rows" : "style")
                  }
            }
            disabled={submitting}
          >
            {step === "style" ? "Cancel" : "Back"}
          </button>
          <div className={footerStyles.footerActions}>
            {step === "style" && (
              <button
                type="button"
                id="bulk-next-btn"
                className="btn btn-primary"
                onClick={() => setStep("rows")}
                disabled={!contrast.scannable}
                title={
                  !contrast.scannable
                    ? "Increase the contrast between the foreground and background to continue."
                    : undefined
                }
              >
                Next: add rows
              </button>
            )}
            {step === "rows" && (
              <button
                type="button"
                id="bulk-review-btn"
                className="btn btn-primary"
                onClick={goToReview}
              >
                Review{filled.length > 0 ? ` ${filled.length}` : ""}
              </button>
            )}
            {step === "review" && (
              <button
                type="button"
                id="bulk-create-submit"
                className="btn btn-primary"
                onClick={handleCreate}
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <span className="spinner" /> Creating…
                  </>
                ) : (
                  `Create ${items.length} QR ${items.length === 1 ? "code" : "codes"}`
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const styles = {
  lead: {
    color: "var(--text-secondary)",
    fontSize: "0.92rem",
    lineHeight: 1.5,
    marginBottom: "20px"
  },
  contentGrid: {
    display: "flex",
    gap: "32px",
    flexWrap: "wrap",
    alignItems: "flex-start"
  },
  formSection: {
    flex: "1 1 360px",
    minWidth: 0
  },
  hint: {
    fontSize: "0.78rem",
    color: "var(--text-tertiary)",
    marginTop: "10px",
    lineHeight: 1.5
  }
}
