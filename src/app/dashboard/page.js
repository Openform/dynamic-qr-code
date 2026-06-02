'use client';

import { useState, useEffect, useCallback } from 'react';
import StatsCards from './components/StatsCards';
import QRCodeCard from './components/QRCodeCard';
import CreateEditModal from './components/CreateEditModal';

export default function DashboardPage() {
  const [user, setUser] = useState(null);
  const [qrcodes, setQrcodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingQR, setEditingQR] = useState(null); // null = create, object = edit

  // ---- Fetch user & QR codes on mount ----
  useEffect(() => {
    async function loadData() {
      try {
        const [userRes, qrRes] = await Promise.all([
          fetch('/api/auth/me'),
          fetch('/api/qrcodes'),
        ]);

        if (!userRes.ok) {
          window.location.href = '/login';
          return;
        }

        const userData = await userRes.json();
        setUser(userData.user ?? userData);

        if (qrRes.ok) {
          const qrData = await qrRes.json();
          setQrcodes(qrData.qrcodes ?? qrData ?? []);
        }
      } catch {
        window.location.href = '/login';
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  // ---- Handlers ----
  function handleCreate() {
    setEditingQR(null);
    setModalOpen(true);
  }

  function handleEdit(qr) {
    setEditingQR(qr);
    setModalOpen(true);
  }

  async function handleDelete(qr) {
    if (!confirm(`Delete "${qr.title}"? This cannot be undone.`)) return;

    try {
      const res = await fetch(`/api/qrcodes/${qr.id}`, { method: 'DELETE' });
      if (res.ok) {
        setQrcodes((prev) => prev.filter((q) => q.id !== qr.id));
      }
    } catch {
      // silently fail
    }
  }

  async function handleDownload(qr) {
    try {
      const res = await fetch(`/api/qrcodes/${qr.id}/image`);
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${qr.title || 'qrcode'}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // fallback: silently fail
    }
  }

  const handleSave = useCallback(
    async (formData) => {
      if (editingQR) {
        // Update existing
        const res = await fetch(`/api/qrcodes/${editingQR.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });
        if (res.ok) {
          const data = await res.json();
          const updated = data.qrcode ?? data;
          setQrcodes((prev) =>
            prev.map((q) => (q.id === editingQR.id ? { ...q, ...updated } : q))
          );
          setModalOpen(false);
        }
      } else {
        // Create new
        const res = await fetch('/api/qrcodes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });
        if (res.ok) {
          const data = await res.json();
          const newQR = data.qrcode ?? data;
          setQrcodes((prev) => [newQR, ...prev]);
          setModalOpen(false);
        }
      }
    },
    [editingQR]
  );

  async function handleLogout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    window.location.href = '/';
  }

  // ---- Derived data ----
  const filteredQRCodes = qrcodes.filter((qr) =>
    qr.title?.toLowerCase().includes(search.toLowerCase())
  );

  const totalScans = qrcodes.reduce(
    (sum, qr) => sum + (qr.scanCount ?? 0),
    0
  );

  // ---- Loading state ----
  if (loading) {
    return (
      <div style={styles.loadingPage}>
        <div className="spinner spinner-lg" />
        <p style={{ color: 'var(--text-secondary)', marginTop: '16px' }}>
          Loading your dashboard…
        </p>
      </div>
    );
  }

  return (
    <div className="page-wrapper">
      {/* ---- Header ---- */}
      <header style={styles.header}>
        <div className="container" style={styles.headerInner}>
          <div style={styles.headerLeft}>
            <a href="/dashboard">
              <span className="gradient-text" style={styles.logo}>
                QRFlow
              </span>
            </a>
          </div>
          <div style={styles.headerRight}>
            <span style={styles.greeting}>
              👋 {user?.name || 'User'}
            </span>
            <button
              id="logout-btn"
              className="btn btn-ghost btn-sm"
              onClick={handleLogout}
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      {/* ---- Main Content ---- */}
      <main className="container" style={{ paddingTop: '32px', paddingBottom: '64px' }}>
        {/* Stats */}
        <div className="animate-fadeIn">
          <StatsCards
            totalQRCodes={qrcodes.length}
            totalScans={totalScans}
          />
        </div>

        {/* Action Bar */}
        <div style={styles.actionBar} className="animate-fadeIn">
          <div style={styles.searchWrap}>
            <span style={styles.searchIcon}>🔍</span>
            <input
              id="search-qrcodes"
              type="text"
              className="input-field"
              placeholder="Search QR codes…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: '40px' }}
            />
          </div>
          <button
            id="create-qr-btn"
            className="btn btn-primary"
            onClick={handleCreate}
          >
            + Create New QR Code
          </button>
        </div>

        {/* QR Codes Grid */}
        {filteredQRCodes.length === 0 && !loading ? (
          <div style={styles.emptyState} className="animate-fadeIn">
            <div style={{ fontSize: '3rem', marginBottom: '16px' }}>📭</div>
            <h3 style={{ fontWeight: 600, marginBottom: '8px' }}>
              {search ? 'No QR codes found' : 'Create your first QR code'}
            </h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
              {search
                ? 'Try a different search term.'
                : 'Get started by creating a dynamic QR code that you can update anytime.'}
            </p>
            {!search && (
              <button
                className="btn btn-primary"
                onClick={handleCreate}
              >
                + Create QR Code
              </button>
            )}
          </div>
        ) : (
          <div className="grid-responsive animate-fadeIn">
            {filteredQRCodes.map((qr) => (
              <QRCodeCard
                key={qr.id}
                qrcode={qr}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onDownload={handleDownload}
              />
            ))}
          </div>
        )}
      </main>

      {/* ---- Create / Edit Modal ---- */}
      <CreateEditModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        qrcode={editingQR}
      />
    </div>
  );
}

const styles = {
  loadingPage: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
  },
  header: {
    position: 'sticky',
    top: 0,
    zIndex: 50,
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    background: 'rgba(10, 10, 26, 0.85)',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  headerInner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: '64px',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
  },
  logo: {
    fontSize: '1.4rem',
    fontWeight: 700,
    letterSpacing: '-0.02em',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  greeting: {
    fontSize: '0.9rem',
    color: 'var(--text-secondary)',
  },
  actionBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '16px',
    marginBottom: '28px',
    flexWrap: 'wrap',
  },
  searchWrap: {
    position: 'relative',
    flex: '1 1 260px',
    maxWidth: '400px',
  },
  searchIcon: {
    position: 'absolute',
    left: '14px',
    top: '50%',
    transform: 'translateY(-50%)',
    fontSize: '0.9rem',
    pointerEvents: 'none',
  },
  emptyState: {
    textAlign: 'center',
    padding: '80px 24px',
    background: 'rgba(255,255,255,0.02)',
    borderRadius: '24px',
    border: '1px dashed rgba(255,255,255,0.08)',
  },
};
