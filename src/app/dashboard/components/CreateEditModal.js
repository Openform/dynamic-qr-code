'use client';

import { useState, useEffect } from 'react';
import QRCode from 'qrcode';

export default function CreateEditModal({ isOpen, onClose, onSave, qrcode }) {
  const isEdit = Boolean(qrcode);

  const [title, setTitle] = useState('');
  const [destinationUrl, setDestinationUrl] = useState('');
  const [fgColor, setFgColor] = useState('#000000');
  const [bgColor, setBgColor] = useState('#ffffff');
  const [loading, setSaving] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');

  // Pre-fill when editing
  useEffect(() => {
    if (qrcode) {
      setTitle(qrcode.title || '');
      setDestinationUrl(qrcode.destinationUrl || '');
      setFgColor(qrcode.fgColor || '#000000');
      setBgColor(qrcode.bgColor || '#ffffff');
    } else {
      setTitle('');
      setDestinationUrl('');
      setFgColor('#000000');
      setBgColor('#ffffff');
    }
  }, [qrcode, isOpen]);

  // Live QR preview
  useEffect(() => {
    let text = 'https://example.com';
    if (qrcode && typeof window !== 'undefined') {
      text = `${window.location.origin}/r/${qrcode.shortId}`;
    } else if (destinationUrl) {
      text = destinationUrl;
    }

    QRCode.toDataURL(text, {
      width: 180,
      margin: 2,
      color: {
        dark: fgColor,
        light: bgColor,
      },
    })
      .then(setPreviewUrl)
      .catch(() => setPreviewUrl(''));
  }, [destinationUrl, fgColor, bgColor, qrcode]);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        title,
        destinationUrl,
        fgColor,
        bgColor,
      });
    } finally {
      setSaving(false);
    }
  }

  // Close on Escape
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    if (isOpen) {
      document.addEventListener('keydown', onKey);
      return () => document.removeEventListener('keydown', onKey);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-card">
        {/* Header */}
        <div className="modal-header">
          <h2 className="modal-title">
            {isEdit ? 'Edit QR Code' : 'Create QR Code'}
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
          {/* Title */}
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

          {/* Destination URL */}
          <div className="input-group">
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
              required
            />
          </div>

          {/* Colors */}
          <div style={styles.colorRow}>
            <div style={styles.colorGroup}>
              <label htmlFor="qr-fg-color" className="input-label">
                Foreground
              </label>
              <div style={styles.colorPickerWrap}>
                <input
                  id="qr-fg-color"
                  type="color"
                  value={fgColor}
                  onChange={(e) => setFgColor(e.target.value)}
                  style={styles.colorInput}
                />
                <span style={styles.colorHex}>{fgColor}</span>
              </div>
            </div>
            <div style={styles.colorGroup}>
              <label htmlFor="qr-bg-color" className="input-label">
                Background
              </label>
              <div style={styles.colorPickerWrap}>
                <input
                  id="qr-bg-color"
                  type="color"
                  value={bgColor}
                  onChange={(e) => setBgColor(e.target.value)}
                  style={styles.colorInput}
                />
                <span style={styles.colorHex}>{bgColor}</span>
              </div>
            </div>
          </div>

          {/* Live Preview */}
          <div style={styles.previewSection}>
            <p className="input-label" style={{ marginBottom: '12px' }}>
              Preview
            </p>
            <div style={styles.previewCard}>
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="QR code preview"
                  style={styles.previewImg}
                />
              ) : (
                <div className="skeleton" style={{ width: 140, height: 140 }} />
              )}
            </div>
          </div>

          {/* Footer Buttons */}
          <div className="modal-footer">
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
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="spinner" /> Saving…
                </>
              ) : isEdit ? (
                'Save Changes'
              ) : (
                'Create QR Code'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const styles = {
  colorRow: {
    display: 'flex',
    gap: '20px',
    marginBottom: '24px',
  },
  colorGroup: {
    flex: 1,
  },
  colorPickerWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--glass-border)',
    borderRadius: 'var(--radius-md)',
    padding: '8px 12px',
  },
  colorInput: {
    width: '32px',
    height: '32px',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    background: 'transparent',
    padding: 0,
  },
  colorHex: {
    fontSize: '0.85rem',
    color: 'var(--text-secondary)',
    fontFamily: 'monospace',
  },
  previewSection: {
    marginBottom: '8px',
  },
  previewCard: {
    display: 'flex',
    justifyContent: 'center',
    padding: '20px',
    background: 'rgba(255,255,255,0.02)',
    borderRadius: '12px',
    border: '1px solid var(--glass-border)',
  },
  previewImg: {
    width: '140px',
    height: '140px',
    borderRadius: '8px',
  },
};
