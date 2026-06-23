"use client"

import { useState, useEffect, useRef } from "react"
import QRCodeStyling from "qr-code-styling"
import {
  normalizeStyle,
  buildQRStylingOptions,
  PRESETS,
  CODE_TYPES,
  DOT_STYLES,
  CORNER_SQUARE_STYLES,
  CORNER_DOT_STYLES,
  ERROR_CORRECTION_LEVELS,
  QR_SHAPES,
  normalizeDestinationUrl,
  isValidDestinationUrl,
  evaluateContrast
} from "@/lib/qrStyle"
import { renderBwipCanvas } from "@/lib/barcode"

export default function CreateEditModal({
  isOpen,
  onClose,
  onSave,
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
      qrcode={qrcode}
      collections={collections}
      defaultCollectionId={defaultCollectionId}
    />
  )
}

const TABS = [
  { id: "content", label: "Content" },
  { id: "body", label: "Body" },
  { id: "corners", label: "Corners" },
  { id: "background", label: "Background" },
  { id: "logo", label: "Logo" },
  { id: "advanced", label: "Advanced" }
]

const DOT_STYLE_LABELS = {
  square: "Square",
  dots: "Dots",
  rounded: "Rounded",
  classy: "Classy",
  "classy-rounded": "Classy Rounded",
  "extra-rounded": "Extra Rounded"
}
const CORNER_STYLE_LABELS = {
  square: "Square",
  dot: "Dot",
  "extra-rounded": "Extra Rounded"
}

function QRCodeForm({
  onClose,
  onSave,
  qrcode,
  collections = [],
  defaultCollectionId = null
}) {
  const isEdit = Boolean(qrcode)

  const [title, setTitle] = useState(qrcode?.title || "")
  const [destinationUrl, setDestinationUrl] = useState(
    qrcode?.destinationUrl || ""
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
  const [tab, setTab] = useState("content")
  const [loading, setSaving] = useState(false)

  const qrRef = useRef(null)
  const qrCodeObj = useRef(null)

  // Merge a partial update into the style object.
  function patch(partial) {
    setStyle((s) => ({ ...s, ...partial }))
  }
  function setField(key, value) {
    setStyle((s) => ({ ...s, [key]: value }))
  }

  // Live preview
  useEffect(() => {
    let text = "https://example.com"
    if (qrcode && typeof window !== "undefined") {
      text = `${window.location.origin}/r/${qrcode.shortId}`
    } else if (destinationUrl) {
      text = destinationUrl
    }

    if (style.codeType === "qr") {
      const options = buildQRStylingOptions(style, {
        data: text,
        width: 300,
        height: 300
      })

      // Recreate the instance on every change rather than calling .update():
      // qr-code-styling deep-merges options, so omitted keys (e.g. `gradient` when
      // switching a fill back to solid) would otherwise retain stale values and the
      // preview wouldn't fully reflect the current settings.
      qrCodeObj.current = new QRCodeStyling(options)

      if (qrRef.current) {
        qrRef.current.innerHTML = ""
        qrCodeObj.current.append(qrRef.current)
        // Ensure the generated SVG scales to the container
        const svg = qrRef.current.querySelector("svg")
        if (svg) {
          svg.style.width = "100%"
          svg.style.height = "100%"
        }
      }
    } else {
      // Non-QR symbologies render to a <canvas> via bwip-js.
      qrCodeObj.current = null
      const canvas = document.createElement("canvas")
      canvas.style.maxWidth = "100%"
      canvas.style.height = "auto"
      if (qrRef.current) {
        qrRef.current.innerHTML = ""
        qrRef.current.appendChild(canvas)
      }
      // Late resolutions harmlessly draw onto a now-detached canvas.
      renderBwipCanvas(canvas, style, text, 6).catch(() => {})
    }
  }, [destinationUrl, style, qrcode])

  // QR-only controls (gradients, shapes, logo) are hidden for other symbologies,
  // but a foreground color picker is kept (the "Body" tab, relabeled "Color").
  const isQR = style.codeType === "qr"
  const visibleTabs = isQR
    ? TABS
    : [
        { id: "content", label: "Content" },
        { id: "body", label: "Color" },
        { id: "background", label: "Background" },
        { id: "advanced", label: "Advanced" }
      ]

  // If the selected tab isn't available for the current symbology, fall back to
  // Content for rendering (no state write — avoids a cascading effect).
  const activeTab = visibleTabs.some((t) => t.id === tab) ? tab : "content"

  // Foreground/background contrast check. Only enforced while customizing (the
  // appearance is locked in edit mode, so an existing code is never re-gated).
  const contrast = evaluateContrast(style)
  const blockSave = !isEdit && !contrast.scannable

  // Prepend https:// when the user omits the scheme, so the field shows the
  // URL we'll actually save (and passes the native url-input validation).
  function handleUrlBlur() {
    const normalized = normalizeDestinationUrl(destinationUrl)
    if (normalized !== destinationUrl) setDestinationUrl(normalized)
    if (urlError) setUrlError("")
  }

  async function handleSubmit(e) {
    e.preventDefault()

    // Autofill https:// and reject anything that isn't https (e.g. http://).
    const normalized = normalizeDestinationUrl(destinationUrl)
    if (normalized !== destinationUrl) setDestinationUrl(normalized)
    if (!isValidDestinationUrl(normalized)) {
      setUrlError(
        "Enter a valid https:// URL. Insecure http:// links aren’t allowed."
      )
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
        destinationUrl: normalized,
        styleConfig: style,
        collectionId: collectionId === "" ? null : Number(collectionId)
      }
      await onSave(payload)
    } finally {
      setSaving(false)
    }
  }

  function applyPreset(preset) {
    // Presets carry visual fields only — keep the user's logo and content.
    patch(preset.style)
  }

  // Handle the Escape key press
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose()
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onClose])

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
                <>
                  {/* Code type */}
                  <div style={{ marginBottom: "16px" }}>
                    <label className="input-label">Code type</label>
                    <div className="qr-segmented">
                      {CODE_TYPES.map((ct) => (
                        <button
                          key={ct.id}
                          type="button"
                          className={`qr-seg${style.codeType === ct.id ? " qr-seg-active" : ""}`}
                          onClick={() => setField("codeType", ct.id)}
                        >
                          {ct.label}
                        </button>
                      ))}
                    </div>
                    {!isQR && (
                      <p style={styles.hint}>
                        Data Matrix supports color &amp; size only — gradients,
                        shapes, and logos are QR-only.
                      </p>
                    )}
                  </div>

                  {/* Collection (only once the user has collections) */}
                  {collections.length > 0 && (
                    <CollectionSelect
                      collections={collections}
                      value={collectionId}
                      onChange={setCollectionId}
                    />
                  )}

                  {/* Presets (QR only) */}
                  {isQR && (
                    <div style={{ marginBottom: "20px" }}>
                      <label className="input-label">Presets</label>
                      <div style={styles.presetRow}>
                        {PRESETS.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            className="qr-preset"
                            onClick={() => applyPreset(p)}
                            title={`Apply "${p.name}" style`}
                          >
                            {p.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Tabs */}
                  <div className="qr-tabs" role="tablist">
                    {visibleTabs.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        role="tab"
                        aria-selected={activeTab === t.id}
                        className={`qr-tab${activeTab === t.id ? " qr-tab-active" : ""}`}
                        onClick={() => setTab(t.id)}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>

                  <div style={styles.tabPanel}>
                    {activeTab === "content" && (
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
                    )}

                    {activeTab === "body" && (
                      <BodyTab style={style} setField={setField} isQR={isQR} />
                    )}

                    {activeTab === "corners" && isQR && (
                      <CornersTab style={style} setField={setField} />
                    )}

                    {activeTab === "background" && (
                      <BackgroundTab
                        style={style}
                        setField={setField}
                        isQR={isQR}
                      />
                    )}

                    {activeTab === "logo" && isQR && (
                      <LogoTab style={style} setField={setField} />
                    )}

                    {activeTab === "advanced" && (
                      <AdvancedTab
                        style={style}
                        setField={setField}
                        isQR={isQR}
                      />
                    )}
                  </div>
                </>
              )}
            </div>

            {/* ── Preview column ── */}
            <div style={styles.previewSection}>
              <p className="input-label" style={{ marginBottom: "12px" }}>
                Preview
              </p>
              <div style={styles.previewCard}>
                <div ref={qrRef} style={styles.previewImg} />
              </div>
              {!isEdit && <ContrastChecker contrast={contrast} />}
            </div>
          </div>

          {/* Footer Buttons */}
          <div className="modal-footer" style={{ marginTop: "24px" }}>
            <button
              id="cancel-qr-btn"
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              id="save-qr-btn"
              type="submit"
              className="btn btn-primary"
              disabled={loading || blockSave}
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
        </form>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────
// Tab panels
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
      </div>

      {showLogo && (
        <div className="input-group" style={{ marginBottom: 0 }}>
          <label htmlFor="qr-logo-url" className="input-label">
            Logo URL (optional)
          </label>
          <input
            id="qr-logo-url"
            type="url"
            className="input-field"
            placeholder="https://example.com/logo.png"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
          />
          <p style={styles.hint}>
            Fine-tune logo size and spacing in the Logo tab.
          </p>
        </div>
      )}
    </>
  )
}

function BodyTab({ style, setField, isQR }) {
  // Data Matrix supports a single flat foreground color only.
  if (!isQR) {
    return (
      <div className="input-group">
        <label className="input-label">Foreground color</label>
        <ColorRow
          value={style.fgColor}
          onChange={(v) => setField("fgColor", v)}
        />
        <p style={styles.hint}>
          Use a dark color on a light background for reliable scanning.
        </p>
      </div>
    )
  }

  return (
    <>
      <SelectField
        id="qr-dot-style"
        label="Dot shape"
        value={style.dotStyle}
        onChange={(v) => setField("dotStyle", v)}
        options={DOT_STYLES.map((v) => ({
          value: v,
          label: DOT_STYLE_LABELS[v]
        }))}
      />
      <FillControl
        label="Fill"
        color={style.fgColor}
        gradient={style.dotGradient}
        fallbackColor={style.fgColor}
        onChangeBoth={(color, gradient) =>
          setFieldBoth(setField, {
            fgColor: color || style.fgColor,
            dotGradient: gradient
          })
        }
      />
    </>
  )
}

function CornersTab({ style, setField }) {
  return (
    <>
      <div style={styles.subhead}>Corner square (eye frame)</div>
      <SelectField
        id="qr-corner-square"
        label="Shape"
        value={style.cornerSquareStyle}
        onChange={(v) => setField("cornerSquareStyle", v)}
        options={CORNER_SQUARE_STYLES.map((v) => ({
          value: v,
          label: CORNER_STYLE_LABELS[v]
        }))}
      />
      <FillControl
        label="Fill"
        allowInherit
        color={style.cornerSquareColor}
        gradient={style.cornerSquareGradient}
        fallbackColor={style.fgColor}
        onChangeBoth={(color, gradient) =>
          setFieldBoth(setField, {
            cornerSquareColor: color,
            cornerSquareGradient: gradient
          })
        }
      />

      <div style={{ ...styles.subhead, marginTop: "8px" }}>
        Corner dot (eye center)
      </div>
      <SelectField
        id="qr-corner-dot"
        label="Shape"
        value={style.cornerDotStyle}
        onChange={(v) => setField("cornerDotStyle", v)}
        options={CORNER_DOT_STYLES.map((v) => ({
          value: v,
          label: CORNER_STYLE_LABELS[v]
        }))}
      />
      <FillControl
        label="Fill"
        allowInherit
        color={style.cornerDotColor}
        gradient={style.cornerDotGradient}
        fallbackColor={style.fgColor}
        onChangeBoth={(color, gradient) =>
          setFieldBoth(setField, {
            cornerDotColor: color,
            cornerDotGradient: gradient
          })
        }
      />
    </>
  )
}

function BackgroundTab({ style, setField, isQR }) {
  return (
    <>
      <ToggleField
        id="qr-bg-transparent"
        label="Transparent background"
        checked={style.bgTransparent}
        onChange={(v) => setField("bgTransparent", v)}
      />
      {!style.bgTransparent &&
        (isQR ? (
          <FillControl
            label="Fill"
            color={style.bgColor}
            gradient={style.bgGradient}
            fallbackColor={style.bgColor}
            onChangeBoth={(color, gradient) =>
              setFieldBoth(setField, {
                bgColor: color || style.bgColor,
                bgGradient: gradient
              })
            }
          />
        ) : (
          <div className="input-group">
            <label className="input-label">Background color</label>
            <ColorRow
              value={style.bgColor}
              onChange={(v) => setField("bgColor", v)}
            />
          </div>
        ))}
    </>
  )
}

function LogoTab({ style, setField }) {
  return (
    <>
      <SliderField
        id="qr-logo-size"
        label="Logo size"
        min={0.1}
        max={0.6}
        step={0.05}
        value={style.logoSize}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={(v) => setField("logoSize", v)}
      />
      <SliderField
        id="qr-logo-margin"
        label="Logo padding"
        min={0}
        max={40}
        step={1}
        value={style.logoMargin}
        format={(v) => `${v}px`}
        onChange={(v) => setField("logoMargin", v)}
      />
      <ToggleField
        id="qr-hide-bg-dots"
        label="Hide dots behind logo"
        checked={style.hideBgDots}
        onChange={(v) => setField("hideBgDots", v)}
      />
      <p style={styles.hint}>
        Add a logo URL in the Content tab. Error correction is raised to H
        automatically while a logo is set, so the code stays scannable behind
        it.
      </p>
    </>
  )
}

function AdvancedTab({ style, setField, isQR }) {
  // A center logo forces error correction up to H (mirrors
  // effectiveErrorCorrectionLevel in qrStyle.js), so reflect that in the control.
  const logoForcesH = isQR && Boolean(style.logoUrl)
  return (
    <>
      {isQR && (
        <SelectField
          id="qr-shape"
          label="Overall shape"
          value={style.shape}
          onChange={(v) => setField("shape", v)}
          options={QR_SHAPES.map((v) => ({
            value: v,
            label: v === "square" ? "Square" : "Circle"
          }))}
        />
      )}
      <SliderField
        id="qr-margin"
        label="Quiet zone (margin)"
        min={0}
        max={40}
        step={1}
        value={style.margin}
        format={(v) => `${v}px`}
        onChange={(v) => setField("margin", v)}
      />
      {isQR ? (
        <>
          <SelectField
            id="qr-ec-level"
            label="Error correction"
            // A logo forces H (see effectiveErrorCorrectionLevel); show that and
            // lock the control so the displayed level matches what's encoded.
            value={logoForcesH ? "H" : style.errorCorrectionLevel}
            onChange={(v) => setField("errorCorrectionLevel", v)}
            disabled={logoForcesH}
            options={ERROR_CORRECTION_LEVELS.map((v) => ({
              value: v,
              label: {
                L: "L — Low (7%)",
                M: "M — Medium (15%)",
                Q: "Q — Quartile (25%)",
                H: "H — High (30%)"
              }[v]
            }))}
          />
          <p style={styles.hint}>
            {logoForcesH
              ? "Raised to H automatically while a logo is set, so the code stays scannable behind it. Lower levels (M is the default) make logo-free codes coarser and more minimal."
              : "Higher correction tolerates more damage but packs denser. M (the default) keeps codes minimal; a logo raises this to H automatically."}
          </p>
        </>
      ) : (
        <p style={styles.hint}>
          Data Matrix auto-sizes and includes its own error correction.
        </p>
      )}
    </>
  )
}

// ──────────────────────────────────────────────
// Reusable controls
// ──────────────────────────────────────────────

// Apply several style keys at once (works with the parent's single-key setField).
function setFieldBoth(setField, obj) {
  for (const [k, v] of Object.entries(obj)) setField(k, v)
}

function safeHex(v, fallback) {
  return typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback
}

// Collection picker shared by the create and edit forms. "" = Default Collection.
function CollectionSelect({ collections, value, onChange }) {
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
      <p style={styles.hint}>
        Group this code with others — moving it won’t change the code itself.
      </p>
    </div>
  )
}

function SelectField({
  id,
  label,
  value,
  onChange,
  options,
  disabled = false
}) {
  return (
    <div className="input-group">
      <label htmlFor={id} className="input-label">
        {label}
      </label>
      <select
        id={id}
        className="input-field"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

function ColorRow({ value, onChange }) {
  return (
    <div style={styles.colorPickerWrap}>
      <input
        type="color"
        value={safeHex(value, "#000000")}
        onChange={(e) => onChange(e.target.value)}
        style={styles.colorInput}
        aria-label="Pick color"
      />
      <span style={styles.colorHex}>{value || "inherit"}</span>
    </div>
  )
}

function ToggleField({ id, label, checked, onChange }) {
  return (
    <label htmlFor={id} className="qr-toggle">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  )
}

function SliderField({ id, label, min, max, step, value, onChange, format }) {
  return (
    <div className="input-group">
      <div style={styles.sliderHead}>
        <label htmlFor={id} className="input-label" style={{ marginBottom: 0 }}>
          {label}
        </label>
        <span style={styles.sliderValue}>{format ? format(value) : value}</span>
      </div>
      <input
        id={id}
        type="range"
        className="qr-range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  )
}

/**
 * Fill picker shared by body/corners/background. Lets the user choose between a
 * solid color and a 2-stop gradient (and optionally "inherit" for corners).
 * Emits the resulting (color, gradient) pair via onChangeBoth.
 */
function FillControl({
  label,
  color,
  gradient,
  fallbackColor,
  allowInherit,
  onChangeBoth
}) {
  const mode = gradient
    ? "gradient"
    : allowInherit && !color
      ? "inherit"
      : "solid"

  function setMode(next) {
    if (next === "inherit") {
      onChangeBoth("", null)
    } else if (next === "solid") {
      onChangeBoth(color || fallbackColor || "#000000", null)
    } else {
      onChangeBoth(color, {
        type: gradient?.type || "linear",
        rotation: gradient?.rotation ?? 0,
        color1: gradient?.color1 || color || fallbackColor || "#000000",
        color2: gradient?.color2 || "#ffffff"
      })
    }
  }

  const modeOptions = [
    ...(allowInherit ? [{ value: "inherit", label: "Inherit" }] : []),
    { value: "solid", label: "Solid" },
    { value: "gradient", label: "Gradient" }
  ]

  return (
    <div className="input-group">
      <label className="input-label">{label}</label>
      <div className="qr-segmented">
        {modeOptions.map((o) => (
          <button
            key={o.value}
            type="button"
            className={`qr-seg${mode === o.value ? " qr-seg-active" : ""}`}
            onClick={() => setMode(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>

      {mode === "solid" && (
        <div style={{ marginTop: "10px" }}>
          <ColorRow
            value={color || fallbackColor}
            onChange={(v) => onChangeBoth(v, null)}
          />
        </div>
      )}

      {mode === "gradient" && gradient && (
        <div style={styles.gradientBox}>
          <div style={styles.gradientColors}>
            <div style={{ flex: 1 }}>
              <span style={styles.miniLabel}>From</span>
              <ColorRow
                value={gradient.color1}
                onChange={(v) =>
                  onChangeBoth(color, { ...gradient, color1: v })
                }
              />
            </div>
            <div style={{ flex: 1 }}>
              <span style={styles.miniLabel}>To</span>
              <ColorRow
                value={gradient.color2}
                onChange={(v) =>
                  onChangeBoth(color, { ...gradient, color2: v })
                }
              />
            </div>
          </div>

          <div style={styles.gradientRow}>
            <div style={{ flex: 1 }}>
              <span style={styles.miniLabel}>Type</span>
              <select
                className="input-field"
                value={gradient.type}
                onChange={(e) =>
                  onChangeBoth(color, { ...gradient, type: e.target.value })
                }
              >
                <option value="linear">Linear</option>
                <option value="radial">Radial</option>
              </select>
            </div>
            {gradient.type === "linear" && (
              <div style={{ flex: 1 }}>
                <div style={styles.sliderHead}>
                  <span style={styles.miniLabel}>Rotation</span>
                  <span style={styles.sliderValue}>
                    {Math.round(gradient.rotation)}°
                  </span>
                </div>
                <input
                  type="range"
                  className="qr-range"
                  min={0}
                  max={360}
                  step={5}
                  value={gradient.rotation}
                  onChange={(e) =>
                    onChangeBoth(color, {
                      ...gradient,
                      rotation: Number(e.target.value)
                    })
                  }
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// Visual treatment per contrast level, keyed by evaluateContrast()'s `level`.
const CONTRAST_UI = {
  good: { color: "var(--success, #10b981)", label: "Scannable" },
  warn: { color: "var(--warning, #f59e0b)", label: "Low contrast" },
  fail: { color: "var(--error, #ef4444)", label: "Won’t scan" },
  unknown: { color: "var(--text-secondary)", label: "Check contrast" }
}

/**
 * Live foreground/background contrast badge shown under the preview. Surfaces a
 * pass/risky/fail verdict so users don't build a code too low-contrast to scan;
 * the parent also disables saving when `contrast.scannable` is false.
 */
function ContrastChecker({ contrast }) {
  const ui = CONTRAST_UI[contrast.level] || CONTRAST_UI.unknown
  return (
    <div
      role="status"
      aria-live="polite"
      style={{ ...styles.contrastBox, borderLeftColor: ui.color }}
    >
      <div style={styles.contrastHead}>
        <span
          style={{ ...styles.contrastDot, background: ui.color }}
          aria-hidden="true"
        />
        <span style={{ ...styles.contrastLabel, color: ui.color }}>
          {ui.label}
        </span>
        {contrast.ratio != null && (
          <span style={styles.contrastRatio}>
            {Math.round(contrast.ratio * 10) / 10}:1
          </span>
        )}
      </div>
      <p style={styles.contrastMsg}>{contrast.message}</p>
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
  previewSection: {
    flex: "0 0 auto",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    position: "sticky",
    top: 0
  },
  previewCard: {
    display: "flex",
    justifyContent: "center",
    padding: "24px",
    background: "rgba(255,255,255,0.02)",
    borderRadius: "16px",
    border: "1px solid var(--glass-border)"
  },
  previewImg: {
    width: "220px",
    height: "220px",
    borderRadius: "8px"
  },
  tabPanel: {
    marginTop: "20px"
  },
  presetRow: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap"
  },
  subhead: {
    fontSize: "0.8rem",
    fontWeight: 600,
    color: "var(--text-secondary)",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    marginBottom: "12px"
  },
  colorPickerWrap: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    background: "var(--bg-secondary)",
    border: "1px solid var(--glass-border)",
    borderRadius: "var(--radius-md)",
    padding: "8px 12px"
  },
  colorInput: {
    width: "32px",
    height: "32px",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    background: "transparent",
    padding: 0,
    flexShrink: 0
  },
  colorHex: {
    fontSize: "0.85rem",
    color: "var(--text-secondary)",
    fontFamily: "monospace"
  },
  gradientBox: {
    marginTop: "10px",
    padding: "12px",
    background: "rgba(255,255,255,0.02)",
    border: "1px solid var(--glass-border)",
    borderRadius: "var(--radius-md)",
    display: "flex",
    flexDirection: "column",
    gap: "12px"
  },
  gradientColors: {
    display: "flex",
    gap: "12px"
  },
  gradientRow: {
    display: "flex",
    gap: "12px",
    alignItems: "flex-end"
  },
  miniLabel: {
    display: "block",
    fontSize: "0.75rem",
    color: "var(--text-tertiary)",
    marginBottom: "6px"
  },
  sliderHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "8px"
  },
  sliderValue: {
    fontSize: "0.8rem",
    color: "var(--text-secondary)",
    fontFamily: "monospace"
  },
  hint: {
    fontSize: "0.78rem",
    color: "var(--text-tertiary)",
    marginTop: "10px",
    lineHeight: 1.5
  },
  contrastBox: {
    marginTop: "16px",
    width: "100%",
    maxWidth: "260px",
    padding: "12px 14px",
    background: "rgba(255,255,255,0.02)",
    borderRadius: "var(--radius-md)",
    borderStyle: "solid",
    borderWidth: "1px 1px 1px 3px",
    borderColor: "var(--glass-border)"
  },
  contrastHead: {
    display: "flex",
    alignItems: "center",
    gap: "8px"
  },
  contrastDot: {
    width: "10px",
    height: "10px",
    borderRadius: "50%",
    flexShrink: 0
  },
  contrastLabel: {
    fontSize: "0.85rem",
    fontWeight: 600
  },
  contrastRatio: {
    marginLeft: "auto",
    fontSize: "0.8rem",
    fontFamily: "monospace",
    color: "var(--text-secondary)"
  },
  contrastMsg: {
    fontSize: "0.78rem",
    color: "var(--text-tertiary)",
    marginTop: "8px",
    lineHeight: 1.5
  }
}
