'use client';

import { useState, useEffect } from 'react';
import QRCode from 'qrcode';

export default function QRCodeCard({ qrcode, onEdit, onDelete, onDownload }) {
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copied, setCopied] = useState(false);

  const redirectUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/r/${qrcode.shortId}`
      : `/r/${qrcode.shortId}`;

  useEffect(() => {
    QRCode.toDataURL(redirectUrl, {
      width: 160,
      margin: 2,
      color: {
        dark: qrcode.fgColor || '#000000',
        light: qrcode.bgColor || '#ffffff',
      },
    })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''));
  }, [redirectUrl, qrcode.fgColor, qrcode.bgColor]);

  function handleCopy() {
    navigator.clipboard.writeText(redirectUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
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
        {qrDataUrl ? (
          <img
            src={qrDataUrl}
            alt={`QR code for ${qrcode.title}`}
            style={styles.previewImg}
          />
        ) : (
          <div className="skeleton" style={{ width: 120, height: 120 }} />
        )}
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
          onClick={() => onDownload(qrcode)}
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
    padding: '16px',
    background: 'rgba(255,255,255,0.02)',
    borderRadius: '12px',
  },
  previewImg: {
    width: '120px',
    height: '120px',
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
