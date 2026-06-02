'use client';

import { useState, useEffect, useRef } from 'react';
import QRCodeStyling from 'qr-code-styling';

export default function QRCodeCard({ qrcode, onEdit, onDelete }) {
  const [copied, setCopied] = useState(false);
  const qrRef = useRef(null);
  const qrCodeObj = useRef(null);

  const redirectUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/r/${qrcode.shortId}`
      : `/r/${qrcode.shortId}`;

  useEffect(() => {
    if (!qrCodeObj.current) {
      qrCodeObj.current = new QRCodeStyling({
        width: 300,
        height: 300,
        type: 'svg',
        data: redirectUrl,
        image: qrcode.logoUrl ? `/api/proxy-image?url=${encodeURIComponent(qrcode.logoUrl)}` : '',
        qrOptions: {
          errorCorrectionLevel: 'H',
        },
        dotsOptions: {
          color: qrcode.fgColor || '#000000',
          type: qrcode.dotStyle || 'square',
        },
        backgroundOptions: {
          color: qrcode.bgColor || '#ffffff',
        },
        cornersSquareOptions: {
          type: qrcode.cornerSquareStyle || 'square',
          color: qrcode.fgColor || '#000000',
        },
        cornersDotOptions: {
          type: qrcode.cornerDotStyle || 'square',
          color: qrcode.fgColor || '#000000',
        },
        imageOptions: {
          crossOrigin: 'anonymous',
          margin: 10,
          imageSize: 0.4,
        },
      });
    } else {
      qrCodeObj.current.update({
        data: redirectUrl,
        image: qrcode.logoUrl ? `/api/proxy-image?url=${encodeURIComponent(qrcode.logoUrl)}` : '',
        dotsOptions: {
          color: qrcode.fgColor || '#000000',
          type: qrcode.dotStyle || 'square',
        },
        backgroundOptions: {
          color: qrcode.bgColor || '#ffffff',
        },
        cornersSquareOptions: {
          type: qrcode.cornerSquareStyle || 'square',
          color: qrcode.fgColor || '#000000',
        },
        cornersDotOptions: {
          type: qrcode.cornerDotStyle || 'square',
          color: qrcode.fgColor || '#000000',
        },
      });
    }

    if (qrRef.current) {
      qrRef.current.innerHTML = '';
      qrCodeObj.current.append(qrRef.current);
      // Ensure the generated SVG scales to the container
      const svg = qrRef.current.querySelector('svg');
      if (svg) {
        svg.style.width = '100%';
        svg.style.height = '100%';
      }
    }
  }, [
    redirectUrl,
    qrcode.fgColor,
    qrcode.bgColor,
    qrcode.logoUrl,
    qrcode.dotStyle,
    qrcode.cornerSquareStyle,
    qrcode.cornerDotStyle,
  ]);

  function handleCopy() {
    navigator.clipboard.writeText(redirectUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleDownload() {
    if (qrCodeObj.current) {
      qrCodeObj.current.download({ name: qrcode.title || 'qrcode', extension: 'png' });
    }
  }

  function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
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
            style={{ padding: '4px 8px', fontSize: '0.8rem', minWidth: 'auto' }}
            aria-label="Copy redirect URL"
          >
            {copied ? (
              <span className="copy-feedback">✓ Copied</span>
            ) : (
              '📋'
            )}
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
        <button
          id={`download-qr-${qrcode.id}`}
          className="btn btn-ghost btn-sm"
          onClick={handleDownload}
          title="Download"
        >
          ⬇️ Download
        </button>
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
  );
}

const styles = {
  card: {
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  previewWrap: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '16px',
    background: 'rgba(255,255,255,0.02)',
    borderRadius: '12px',
  },
  previewImg: {
    width: '160px',
    height: '160px',
    borderRadius: '8px',
  },
  info: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    flex: 1,
  },
  title: {
    fontSize: '1.05rem',
    fontWeight: 600,
    maxWidth: '100%',
  },
  destUrl: {
    fontSize: '0.82rem',
    color: 'var(--cyan)',
    maxWidth: '100%',
    display: 'block',
  },
  redirectRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    background: 'rgba(255,255,255,0.03)',
    borderRadius: '8px',
    padding: '6px 10px',
  },
  redirectUrl: {
    fontSize: '0.78rem',
    color: 'var(--text-secondary)',
    flex: 1,
  },
  metaRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: '4px',
  },
  date: {
    fontSize: '0.78rem',
    color: 'var(--text-tertiary)',
  },
  actions: {
    display: 'flex',
    gap: '8px',
    borderTop: '1px solid rgba(255,255,255,0.06)',
    paddingTop: '12px',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
  },
};
