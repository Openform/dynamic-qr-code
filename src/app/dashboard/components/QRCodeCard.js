"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import Link from "next/link"
import QRCodeStyling from "qr-code-styling"
import { normalizeStyle, buildQRStylingOptions } from "@/lib/qrStyle"
import { renderBwipCanvas, downloadBwip } from "@/lib/barcode"
import cardStyles from "./QRCodeCard.module.css"

function PencilIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
      <path d="m15 5 4 4" />
    </svg>
  )
}

export default function QRCodeCard({
  qrcode,
  collections = [],
  onEdit,
  onAssignCollection
}) {
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
      canvas.style.maxHeight = "100%"
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

  function getSafeUrl(url) {
    if (!url) return '#';
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return parsed.href;
      }
    } catch {
      // ignore
    }
    return '#';
  }

  const safeDestinationUrl = getSafeUrl(qrcode.destinationUrl);

  return (
    <div className="glass-card animate-fadeIn" style={styles.card}>
      {/* Small code on the left (click it to edit), name and destination on the right */}
      <div style={styles.header}>
        <button
          id={`edit-qr-${qrcode.id}`}
          type="button"
          className={cardStyles.codeButton}
          onClick={() => onEdit(qrcode)}
          aria-label={`Edit ${qrcode.title}`}
          title="Edit"
        >
          <span ref={qrRef} style={styles.previewImg} />
          <span className={cardStyles.editBadge} aria-hidden="true">
            <PencilIcon />
          </span>
        </button>
        <div style={styles.headerText}>
          <h3 style={styles.title} title={qrcode.title}>
            {qrcode.title}
          </h3>
          <a
            href={safeDestinationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate"
            style={styles.destUrl}
            title={qrcode.destinationUrl}
          >
            {qrcode.destinationUrl}
          </a>
        </div>
      </div>

      {/* Info */}
      <div style={styles.info}>
        {/* Short link, with copy and download */}
        <div style={styles.redirectRow}>
          <span className="truncate" style={styles.redirectUrl}>
            {redirectUrl}
          </span>
          <button
            onClick={handleCopy}
            className="btn btn-ghost btn-sm"
            style={styles.iconButton}
            aria-label="Copy redirect URL"
          >
            {copied ? <span className="copy-feedback">✓ Copied</span> : "📋"}
          </button>
          <div style={styles.downloadWrap} ref={menuRef}>
            <button
              id={`download-qr-${qrcode.id}`}
              type="button"
              className="btn btn-ghost btn-sm"
              style={styles.iconButton}
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="Download"
              title="Download PNG or SVG"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              ⬇️
            </button>
            {menuOpen && (
              <div className="qr-download-menu" style={styles.downloadMenu} role="menu">
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
        </div>

        {/* Meta row */}
        <div style={styles.metaRow}>
          <div style={styles.scansGroup}>
            <span className="badge badge-cyan">
              {qrcode.scanCount ?? 0} scans
            </span>
            <Link
              id={`analytics-qr-${qrcode.id}`}
              href={`/dashboard/analytics?code=${qrcode.id}`}
              style={styles.analyticsLink}
              title="See where, when and on what this code is scanned"
            >
              📈 Analytics
            </Link>
          </div>
          <span style={styles.date}>{formatDate(qrcode.createdAt)}</span>
        </div>

        {/* Collection assignment (only once the user has collections) */}
        {collections.length > 0 && (
          <div style={styles.collectionRow}>
            <label
              htmlFor={`collection-${qrcode.id}`}
              style={styles.collectionLabel}
            >
              🗂️ Collection
            </label>
            <select
              id={`collection-${qrcode.id}`}
              className="input-field"
              style={styles.collectionSelect}
              value={qrcode.collectionId == null ? "" : String(qrcode.collectionId)}
              onChange={(e) =>
                onAssignCollection?.(
                  qrcode,
                  e.target.value === "" ? null : Number(e.target.value)
                )
              }
              aria-label="Assign to collection"
            >
              <option value="">Default</option>
              {collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  )
}

const styles = {
  card: {
    padding: "20px",
    display: "flex",
    flexDirection: "column",
    gap: "14px",
    // Lets long names truncate instead of stretching the grid column.
    minWidth: 0
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: "14px",
    minWidth: 0
  },
  previewImg: {
    width: "88px",
    height: "88px",
    flex: "none",
    borderRadius: "6px",
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center"
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: "6px"
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
    lineHeight: 1.3,
    // Up to two lines, then an ellipsis.
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
    overflowWrap: "anywhere"
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
  scansGroup: {
    display: "flex",
    alignItems: "center",
    gap: "10px"
  },
  analyticsLink: {
    fontSize: "0.8rem",
    color: "var(--text-secondary)"
  },
  collectionRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginTop: "4px"
  },
  collectionLabel: {
    fontSize: "0.75rem",
    color: "var(--text-tertiary)",
    whiteSpace: "nowrap"
  },
  collectionSelect: {
    flex: 1,
    padding: "6px 10px",
    fontSize: "0.8rem",
    minWidth: 0
  },
  date: {
    fontSize: "0.78rem",
    color: "var(--text-tertiary)"
  },
  iconButton: {
    padding: "4px 8px",
    fontSize: "0.8rem",
    minWidth: "auto"
  },
  downloadWrap: {
    position: "relative",
    flex: "none"
  },
  // Open the menu leftwards: the button sits at the card's right edge.
  downloadMenu: {
    left: "auto",
    right: 0
  }
}
