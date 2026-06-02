'use client';

import { useState, useEffect, useRef } from 'react';
import QRCodeStyling from 'qr-code-styling';

export default function CreateEditModal({ isOpen, onClose, onSave, qrcode }) {
  const isEdit = Boolean(qrcode);

  const [title, setTitle] = useState('');
  const [destinationUrl, setDestinationUrl] = useState('');
  const [fgColor, setFgColor] = useState('#000000');
  const [bgColor, setBgColor] = useState('#ffffff');
  const [logoUrl, setLogoUrl] = useState('');
  const [dotStyle, setDotStyle] = useState('square');
  const [cornerSquareStyle, setCornerSquareStyle] = useState('square');
  const [cornerDotStyle, setCornerDotStyle] = useState('square');
  const [loading, setSaving] = useState(false);

  const qrRef = useRef(null);
  const qrCodeObj = useRef(null);

  // Pre-fill when editing
  useEffect(() => {
    if (qrcode) {
      setTitle(qrcode.title || '');
      setDestinationUrl(qrcode.destinationUrl || '');
      setFgColor(qrcode.fgColor || '#000000');
      setBgColor(qrcode.bgColor || '#ffffff');
      setLogoUrl(qrcode.logoUrl || '');
      setDotStyle(qrcode.dotStyle || 'square');
      setCornerSquareStyle(qrcode.cornerSquareStyle || 'square');
      setCornerDotStyle(qrcode.cornerDotStyle || 'square');
    } else {
      setTitle('');
      setDestinationUrl('');
      setFgColor('#000000');
      setBgColor('#ffffff');
      setLogoUrl('');
      setDotStyle('square');
      setCornerSquareStyle('square');
      setCornerDotStyle('square');
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

    const options = {
      width: 300,
      height: 300,
      type: 'svg',
      data: text,
      image: logoUrl ? `/api/proxy-image?url=${encodeURIComponent(logoUrl)}` : '',
      qrOptions: {
        errorCorrectionLevel: 'H',
      },
      dotsOptions: {
        color: fgColor,
        type: dotStyle,
      },
      backgroundOptions: {
        color: bgColor,
      },
      cornersSquareOptions: {
        type: cornerSquareStyle,
        color: fgColor,
      },
      cornersDotOptions: {
        type: cornerDotStyle,
        color: fgColor,
      },
      imageOptions: {
        crossOrigin: 'anonymous',
        margin: 10,
        imageSize: 0.4,
      },
    };

    if (!qrCodeObj.current) {
      qrCodeObj.current = new QRCodeStyling(options);
    } else {
      qrCodeObj.current.update(options);
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
  }, [destinationUrl, fgColor, bgColor, logoUrl, dotStyle, cornerSquareStyle, cornerDotStyle, qrcode]);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        title,
        destinationUrl,
        fgColor,
        bgColor,
        logoUrl,
        dotStyle,
        cornerSquareStyle,
        cornerDotStyle,
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
      <div className="modal-card" style={{ maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' }}>
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
          <div style={styles.contentGrid}>
            <div style={styles.formSection}>
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

              {/* Logo URL */}
              <div className="input-group">
                <label htmlFor="qr-logo-url" className="input-label">
                  Logo URL (Optional)
                </label>
                <input
                  id="qr-logo-url"
                  type="url"
                  className="input-field"
                  placeholder="https://example.com/logo.png"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                />
              </div>

              {/* Colors */}
              <div style={styles.gridRow}>
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

              {/* Advanced Styles */}
              <div style={styles.gridRow}>
                <div className="input-group" style={{ flex: 1 }}>
                  <label htmlFor="qr-dot-style" className="input-label">Dot Style</label>
                  <select
                    id="qr-dot-style"
                    className="input-field"
                    value={dotStyle}
                    onChange={(e) => setDotStyle(e.target.value)}
                  >
                    <option value="square">Square</option>
                    <option value="dots">Dots</option>
                    <option value="rounded">Rounded</option>
                    <option value="classy">Classy</option>
                    <option value="classy-rounded">Classy Rounded</option>
                    <option value="extra-rounded">Extra Rounded</option>
                  </select>
                </div>
              </div>
              
              <div style={styles.gridRow}>
                <div className="input-group" style={{ flex: 1 }}>
                  <label htmlFor="qr-corner-square" className="input-label">Corner Square</label>
                  <select
                    id="qr-corner-square"
                    className="input-field"
                    value={cornerSquareStyle}
                    onChange={(e) => setCornerSquareStyle(e.target.value)}
                  >
                    <option value="square">Square</option>
                    <option value="dot">Dot</option>
                    <option value="extra-rounded">Extra Rounded</option>
                  </select>
                </div>

                <div className="input-group" style={{ flex: 1 }}>
                  <label htmlFor="qr-corner-dot" className="input-label">Corner Dot</label>
                  <select
                    id="qr-corner-dot"
                    className="input-field"
                    value={cornerDotStyle}
                    onChange={(e) => setCornerDotStyle(e.target.value)}
                  >
                    <option value="square">Square</option>
                    <option value="dot">Dot</option>
                  </select>
                </div>
              </div>

            </div>

            <div style={styles.previewSection}>
              <p className="input-label" style={{ marginBottom: '12px' }}>
                Preview
              </p>
              <div style={styles.previewCard}>
                <div ref={qrRef} style={styles.previewImg} />
              </div>
            </div>
          </div>

          {/* Footer Buttons */}
          <div className="modal-footer" style={{ marginTop: '24px' }}>
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
  contentGrid: {
    display: 'flex',
    gap: '32px',
    flexWrap: 'wrap',
  },
  formSection: {
    flex: '1 1 300px',
  },
  gridRow: {
    display: 'flex',
    gap: '20px',
    marginBottom: '20px',
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
    flex: '0 0 auto',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  previewCard: {
    display: 'flex',
    justifyContent: 'center',
    padding: '24px',
    background: 'rgba(255,255,255,0.02)',
    borderRadius: '16px',
    border: '1px solid var(--glass-border)',
  },
  previewImg: {
    width: '180px',
    height: '180px',
    borderRadius: '8px',
  },
};
