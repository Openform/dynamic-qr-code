"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import QRCodeStyling from "qr-code-styling"
import { normalizeStyle, buildQRStylingOptions } from "@/lib/qrStyle"
import { renderBwipCanvas, downloadBwip } from "@/lib/barcode"

export default function QRCodeCard({ qrcode, onEdit, onDelete }) {
  const [copied, setCopied] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const qrRef = useRef(null)
  const qrCodeObj = useRef(null)
  const menuRef = useRef(null)

  const redirectUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/r/${qrcode.shortId}`
      : `/r/${qrcode.shortId}`

  // Resolve the full style (from styleConfig, or legacy flat fields for old QRs).
  const style = useMemo(() => normalizeStyle(qrcode), [qrcode])
  const isQR = style.codeType === "qr"

  useEffect(() => {
    if (isQR) {
      const options = buildQRStylingOptions(style, {
        data: redirectUrl,
        width: 300,
        height: 300
      })

      // Recreate rather than .update(): qr-code-styling deep-merges options, so an
      // edited QR that removes a gradient/logo would otherwise keep stale styling.
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
      // Data Matrix renders to a <canvas> via bwip-js.
      qrCodeObj.current = null
      const canvas = document.createElement("canvas")
      canvas.style.maxWidth = "100%"
      canvas.style.height = "auto"
      if (qrRef.current) {
        qrRef.current.innerHTML = ""
        qrRef.current.appendChild(canvas)
      }
      renderBwipCanvas(canvas, style, redirectUrl, 6).catch(() => {})
    }
  }, [redirectUrl, style, isQR])

  // Close the download menu on outside click.
  useEffect(() => {
    if (!menuOpen) return
    function onDoc(e) {
      if (menuRef.current && !menuRef.current.contains(e.target))
        setMenuOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [menuOpen])

  function handleCopy() {
    navigator.clipboard.writeText(redirectUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function handleDownload(extension) {
    const name = qrcode.title || "qrcode"
    if (isQR) {
      if (qrCodeObj.current) {
        qrCodeObj.current.download({ name, extension })
      }
    } else {
      downloadBwip(style, redirectUrl, extension, name)
    }
    setMenuOpen(false)
  }

  function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric"
    })
  }

  return (
    <div className="glass-card animate-fadeIn" style={styles.card}>
      {/* QR Preview */}
      <div style={styles.previewWrap}>
        <div ref={qrRef} style={styles.previewImg} />
      </div>

      {/* Info */}
      <div style={styles.info}>
        <h3 className="truncate" style={styles.title}>
          {qrcode.title}
        </h3>

        <a
          href={qrcode.destinationUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="truncate"
          style={styles.destUrl}
        >
          {qrcode.destinationUrl}
        </a>

        {/* Redirect URL with copy */}
        <div style={styles.redirectRow}>
          <span className="truncate" style={styles.redirectUrl}>
            {redirectUrl}
          </span>
          <button
            onClick={handleCopy}
            className="btn btn-ghost btn-sm"
            style={{ padding: "4px 8px", fontSize: "0.8rem", minWidth: "auto" }}
            aria-label="Copy redirect URL"
          >
            {copied ? <span className="copy-feedback">✓ Copied</span> : "📋"}
          </button>
        </div>

        {/* Meta row */}
        <div style={styles.metaRow}>
          <span className="badge badge-cyan">
            {qrcode.scanCount ?? 0} scans
          </span>
          <span style={styles.date}>{formatDate(qrcode.createdAt)}</span>
        </div>
      </div>

      {/* Actions */}
      <div style={styles.actions}>
        <button
          id={`edit-qr-${qrcode.id}`}
          className="btn btn-ghost btn-sm"
          onClick={() => onEdit(qrcode)}
          title="Edit"
        >
          ✏️ Edit
        </button>
        <div style={styles.downloadWrap} ref={menuRef}>
          <button
            id={`download-qr-${qrcode.id}`}
            className="btn btn-ghost btn-sm"
            onClick={() => setMenuOpen((o) => !o)}
            title="Download"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            ⬇️ Download ▾
          </button>
          {menuOpen && (
            <div className="qr-download-menu" role="menu">
              <button
                type="button"
                role="menuitem"
                onClick={() => handleDownload("png")}
              >
                PNG
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => handleDownload("svg")}
              >
                SVG
              </button>
            </div>
          )}
        </div>
        <button
          id={`delete-qr-${qrcode.id}`}
          className="btn btn-danger btn-sm"
          onClick={() => onDelete(qrcode)}
          title="Delete"
        >
          🗑️ Delete
        </button>
      </div>
    </div>
  )
}

const styles = {
  card: {
    padding: "24px",
    display: "flex",
    flexDirection: "column",
    gap: "16px"
  },
  previewWrap: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: "16px",
    background: "rgba(255,255,255,0.02)",
    borderRadius: "12px"
  },
  previewImg: {
    width: "160px",
    height: "160px",
    borderRadius: "8px"
  },
  info: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    flex: 1
  },
  title: {
    fontSize: "1.05rem",
    fontWeight: 600,
    maxWidth: "100%"
  },
  destUrl: {
    fontSize: "0.82rem",
    color: "var(--cyan)",
    maxWidth: "100%",
    display: "block"
  },
  redirectRow: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    background: "rgba(255,255,255,0.03)",
    borderRadius: "8px",
    padding: "6px 10px"
  },
  redirectUrl: {
    fontSize: "0.78rem",
    color: "var(--text-secondary)",
    flex: 1
  },
  metaRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: "4px"
  },
  date: {
    fontSize: "0.78rem",
    color: "var(--text-tertiary)"
  },
  actions: {
    display: "flex",
    gap: "8px",
    borderTop: "1px solid rgba(255,255,255,0.06)",
    paddingTop: "12px",
    justifyContent: "space-between"
    // flexWrap: 'wrap',
  },
  downloadWrap: {
    position: "relative"
  }
}
