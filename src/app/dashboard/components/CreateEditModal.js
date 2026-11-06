"use client"

import { useState, useEffect } from "react"
import {
  normalizeStyle,
  isValidDestinationUrl,
  evaluateContrast,
  stripHttpsPrefix,
  toHttpsUrl
} from "@/lib/qrStyle"
import StyleEditor, { StylePreview } from "./StyleEditor"
import footerStyles from "./CreateEditModal.module.css"
import { TrashIcon } from "@/app/components/icons"

export default function CreateEditModal({
  isOpen,
  onClose,
  onSave,
  onDelete,
  qrcode,
  collections = [],
  defaultCollectionId = null
}) {
  // Close on Escape
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose()
    }
    if (isOpen) {
      document.addEventListener("keydown", onKey)
      return () => document.removeEventListener("keydown", onKey)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  // Remount the form whenever a different QR code (or create vs. edit) is
  // opened. This lets the fields initialize straight from props via useState,
  // so there's no prop→state sync Effect feeding the live-preview Effect.
  return (
    <QRCodeForm
      key={qrcode?.id ?? "new"}
      onClose={onClose}
      onSave={onSave}
      onDelete={onDelete}
      qrcode={qrcode}
      collections={collections}
      defaultCollectionId={defaultCollectionId}
    />
  )
}

function QRCodeForm({
  onClose,
  onSave,
  onDelete,
  qrcode,
  collections = [],
  defaultCollectionId = null
}) {
  const isEdit = Boolean(qrcode)

  const [title, setTitle] = useState(qrcode?.title || "")
  const [destinationUrl, setDestinationUrl] = useState(
    stripHttpsPrefix(qrcode?.destinationUrl)
  )
  // Select value is a string ("" = Default Collection). New codes default to
  // the collection currently being viewed on the dashboard.
  const [collectionId, setCollectionId] = useState(() => {
    const v = qrcode ? qrcode.collectionId : defaultCollectionId
    return v == null ? "" : String(v)
  })
  const [urlError, setUrlError] = useState("")
  // Single style object — the source of truth for all visual customization.
  const [style, setStyle] = useState(() => normalizeStyle(qrcode))
  const [loading, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Merge a partial update into the style object.
  function patch(partial) {
    setStyle((s) => ({ ...s, ...partial }))
  }
  function setField(key, value) {
    setStyle((s) => ({ ...s, [key]: value }))
  }

  // What the preview encodes: an existing code's real short link, otherwise the
  // destination being typed (a placeholder until there is one).
  let previewText = "https://example.com"
  if (qrcode) {
    if (typeof window !== "undefined") {
      previewText = `${window.location.origin}/r/${qrcode.shortId}`
    }
  } else {
    const url = toHttpsUrl(destinationUrl)
    if (url) previewText = url
  }

  const isQR = style.codeType === "qr"

  // Foreground/background contrast check. Only enforced while customizing (the
  // appearance is locked in edit mode, so an existing code is never re-gated).
  const contrast = evaluateContrast(style)
  const blockSave = !isEdit && !contrast.scannable

  // The field shows a fixed "https://" prefix, so strip a scheme the user may
  // have pasted to keep the visible value clean (no "https://https://…").
  function handleUrlBlur() {
    const cleaned = stripHttpsPrefix(destinationUrl)
    if (cleaned !== destinationUrl) setDestinationUrl(cleaned)
    if (urlError) setUrlError("")
  }

  async function handleSubmit(e) {
    e.preventDefault()

    // The "https://" scheme is shown as a fixed prefix on the field, so the
    // value holds just the host/path — re-attach it to build the saved URL.
    const fullUrl = toHttpsUrl(destinationUrl)
    if (!isValidDestinationUrl(fullUrl)) {
      setUrlError("Enter a valid URL.")
      return
    }
    setUrlError("")

    // Guard against saving an unscannable code (the button is also disabled).
    if (blockSave) return

    setSaving(true)
    try {
      // Collection is sent on both create and edit — it's an organizational
      // label that doesn't affect the code's image, so it stays editable even
      // though the appearance is locked after creation. The server ignores any
      // style fields on edit.
      const payload = {
        title,
        destinationUrl: fullUrl,
        styleConfig: style,
        collectionId: collectionId === "" ? null : Number(collectionId)
      }
      await onSave(payload)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      await onDelete(qrcode)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div
      className="modal-overlay"
      // onClick={(e) => {
      //   if (e.target === e.currentTarget) onClose();
      // }}
    >
      <div
        className="modal-card"
        style={{ maxWidth: "860px", maxHeight: "92vh", overflowY: "auto" }}
      >
        {/* Header */}
        <div className="modal-header">
          <h2 className="modal-title">
            {isEdit ? "Edit QR Code" : "Create QR Code"}
          </h2>
          <button
            className="modal-close"
            onClick={onClose}
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={styles.contentGrid}>
            {/* ── Controls column ── */}
            <div style={styles.formSection}>
              {/*
                After creation a code's appearance is frozen: only the title and
                destination URL can change. So in edit mode we show just the
                Content fields (no code type, presets, or style tabs) and leave
                the logo locked too. The preview still renders from the stored
                style so the user sees the exact code they're editing.
              */}
              {isEdit ? (
                <div style={styles.tabPanel}>
                  <ContentTab
                    title={title}
                    setTitle={setTitle}
                    destinationUrl={destinationUrl}
                    setDestinationUrl={setDestinationUrl}
                    onUrlBlur={handleUrlBlur}
                    urlError={urlError}
                    logoUrl={style.logoUrl}
                    setLogoUrl={(v) => setField("logoUrl", v)}
                    showLogo={false}
                  />
                  {collections.length > 0 && (
                    <CollectionSelect
                      collections={collections}
                      value={collectionId}
                      onChange={setCollectionId}
                    />
                  )}
                  <p style={styles.hint}>
                    The code&apos;s appearance is locked after creation so codes
                    already printed or shared keep scanning. Only the title,
                    destination URL, and collection can be changed.
                  </p>
                </div>
              ) : (
                <StyleEditor
                  style={style}
                  setField={setField}
                  patch={patch}
                  // Collection (only once the user has collections)
                  afterCodeType={
                    collections.length > 0 && (
                      <CollectionSelect
                        collections={collections}
                        value={collectionId}
                        onChange={setCollectionId}
                      />
                    )
                  }
                  contentPanel={
                    <ContentTab
                      title={title}
                      setTitle={setTitle}
                      destinationUrl={destinationUrl}
                      setDestinationUrl={setDestinationUrl}
                      onUrlBlur={handleUrlBlur}
                      urlError={urlError}
                      logoUrl={style.logoUrl}
                      setLogoUrl={(v) => setField("logoUrl", v)}
                      showLogo={isQR}
                    />
                  }
                />
              )}
            </div>

            {/* ── Preview column ── */}
            <StylePreview
              style={style}
              text={previewText}
              contrast={isEdit ? null : contrast}
            />
          </div>

          {/* Footer Buttons */}
          <div className={`modal-footer ${footerStyles.footer}`}>
            <button
              id="cancel-qr-btn"
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
            >
              Cancel
            </button>
            <div className={footerStyles.footerActions}>
              {isEdit && onDelete && (
                <button
                  id="delete-qr-btn"
                  type="button"
                  className="btn btn-danger"
                  onClick={handleDelete}
                  disabled={loading || deleting}
                >
                  {deleting ? (
                    <>
                      <span className="spinner" /> Moving…
                    </>
                  ) : (
                    <>
                      <TrashIcon size={16} /> Move to Trash
                    </>
                  )}
                </button>
              )}
              <button
                id="save-qr-btn"
                type="submit"
                className="btn btn-primary"
                disabled={loading || deleting || blockSave}
                title={
                  blockSave
                    ? "Increase the contrast between the foreground and background to save."
                    : undefined
                }
              >
                {loading ? (
                  <>
                    <span className="spinner" /> Saving…
                  </>
                ) : isEdit ? (
                  "Save Changes"
                ) : (
                  "Create QR Code"
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
// ──────────────────────────────────────────────
// Content fields
// ──────────────────────────────────────────────

function ContentTab({
  title,
  setTitle,
  destinationUrl,
  setDestinationUrl,
  onUrlBlur,
  urlError,
  logoUrl,
  setLogoUrl,
  showLogo
}) {
  return (
    <>
      <div className="input-group">
        <label htmlFor="qr-title" className="input-label">
          Title
        </label>
        <input
          id="qr-title"
          type="text"
          className="input-field"
          placeholder="My QR Code"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
      </div>

      <div
        className="input-group"
        style={{ marginBottom: showLogo ? undefined : 0 }}
      >
        <label htmlFor="qr-destination-url" className="input-label">
          Destination URL
        </label>

        {/* Fixed "https://" prefix sits inside the field; the input holds
            only the host/path. */}
        <div className="input-wrapper">
          <span className="prefix">https://</span>
          <input
            id="qr-destination-url"
            type="text" /* text, not url: the value omits the scheme */
            className="input-field"
            placeholder="qrgo.co.za"
            value={destinationUrl}
            onChange={(e) => setDestinationUrl(e.target.value)}
            onBlur={onUrlBlur}
            aria-invalid={urlError ? true : undefined}
            required
          />
        </div>

        {urlError ? (
          <p style={{ ...styles.hint, color: "var(--danger, #e5484d)" }}>
            {urlError}
          </p>
        ) : (
          <p style={styles.hint}>Insecure http:// links are not allowed.</p>
        )}
      </div>

      {/* <div
        className="input-group"
        style={{ marginBottom: showLogo ? undefined : 0 }}
      >
        <label htmlFor="qr-destination-url" className="input-label">
          Destination URL
        </label>
        <input
          id="qr-destination-url"
          type="url"
          className="input-field"
          placeholder="https://example.com"
          value={destinationUrl}
          onChange={(e) => setDestinationUrl(e.target.value)}
          onBlur={onUrlBlur}
          aria-invalid={urlError ? true : undefined}
          required
        />
        {urlError ? (
          <p style={{ ...styles.hint, color: "var(--danger, #e5484d)" }}>
            {urlError}
          </p>
        ) : (
          <p style={styles.hint}>
            We’ll add https:// if you leave it out. Insecure http:// links
            aren’t allowed.
          </p>
        )}
      </div> */}

      {showLogo && (
        <div className="input-group" style={{ marginBottom: 0 }}>
          <label htmlFor="qr-logo-url" className="input-label">
            Logo URL (optional)
          </label>
          <div className="input-wrapper">
            <span className="prefix">https://</span>
            <input
              id="qr-logo-url"
              type="text" /* text, not url: the value omits the scheme */
              className="input-field"
              placeholder="example.com/logo.png"
              value={stripHttpsPrefix(logoUrl)}
              onChange={(e) => setLogoUrl(toHttpsUrl(e.target.value))}
            />
          </div>
          <p style={styles.hint}>
            Fine-tune logo size and spacing in the Logo tab.
          </p>
        </div>
      )}
    </>
  )
}

// Collection picker shared by the create and edit forms. "" = Default Collection.
export function CollectionSelect({
  collections,
  value,
  onChange,
  hint = "Group this code with others — moving it won’t change the code itself."
}) {
  return (
    <div className="input-group">
      <label htmlFor="qr-collection" className="input-label">
        Collection
      </label>
      <select
        id="qr-collection"
        className="input-field"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Default Collection</option>
        {collections.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <p style={styles.hint}>{hint}</p>
    </div>
  )
}

const styles = {
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
  tabPanel: {
    marginTop: "20px"
  },
  hint: {
    fontSize: "0.78rem",
    color: "var(--text-tertiary)",
    marginTop: "10px",
    lineHeight: 1.5
  }
}
