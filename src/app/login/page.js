'use client';

import { useState } from 'react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Invalid email or password');
      }

      window.location.href = '/dashboard';
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.page}>
      {/* Gradient Orbs */}
      <div
        className="gradient-orb gradient-orb-cyan"
        style={{
          width: '400px',
          height: '400px',
          top: '-100px',
          left: '-100px',
          position: 'absolute',
        }}
      />
      <div
        className="gradient-orb gradient-orb-purple"
        style={{
          width: '350px',
          height: '350px',
          bottom: '-80px',
          right: '-80px',
          position: 'absolute',
        }}
      />

      <div className="animate-slideUp" style={styles.card}>
        {/* Logo */}
        <div style={styles.header}>
          <a href="/">
            <span className="gradient-text" style={styles.logo}>
              QRFlow
            </span>
          </a>
          <p style={styles.subtitle}>Welcome back — sign in to your account</p>
        </div>

        {/* Error */}
        {error && (
          <div className="error-message" role="alert" style={{ marginBottom: '20px' }}>
            <span>⚠</span> {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label htmlFor="login-email" className="input-label">
              Email Address
            </label>
            <input
              id="login-email"
              type="email"
              className="input-field"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className="input-group">
            <label htmlFor="login-password" className="input-label">
              Password
            </label>
            <input
              id="login-password"
              type="password"
              className="input-field"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          <button
            id="login-submit"
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ width: '100%', marginTop: '8px', padding: '14px' }}
          >
            {loading ? (
              <>
                <span className="spinner" /> Signing in…
              </>
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        {/* Link to register */}
        <p style={styles.footerText}>
          Don&apos;t have an account?{' '}
          <a href="/register" style={styles.link}>
            Create one
          </a>
        </p>
      </div>
    </div>
  );
}

const styles = {
  page: {
    position: 'relative',
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    overflow: 'hidden',
  },
  card: {
    position: 'relative',
    zIndex: 1,
    width: '100%',
    maxWidth: '420px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    borderRadius: '24px',
    padding: '40px 32px',
  },
  header: {
    textAlign: 'center',
    marginBottom: '32px',
  },
  logo: {
    fontSize: '2rem',
    fontWeight: 700,
    letterSpacing: '-0.02em',
  },
  subtitle: {
    color: 'var(--text-secondary)',
    fontSize: '0.95rem',
    marginTop: '8px',
  },
  footerText: {
    textAlign: 'center',
    color: 'var(--text-secondary)',
    fontSize: '0.9rem',
    marginTop: '24px',
  },
  link: {
    color: 'var(--cyan)',
    fontWeight: 500,
    textDecoration: 'none',
  },
};
