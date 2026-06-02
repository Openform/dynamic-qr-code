'use client';

import { useState } from 'react';

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Registration failed');
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
        className="gradient-orb gradient-orb-purple"
        style={{
          width: '400px',
          height: '400px',
          top: '-120px',
          right: '-80px',
          position: 'absolute',
        }}
      />
      <div
        className="gradient-orb gradient-orb-pink"
        style={{
          width: '350px',
          height: '350px',
          bottom: '-100px',
          left: '-100px',
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
          <p style={styles.subtitle}>Create your free account</p>
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
            <label htmlFor="register-name" className="input-label">
              Full Name
            </label>
            <input
              id="register-name"
              type="text"
              className="input-field"
              placeholder="John Doe"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="name"
            />
          </div>

          <div className="input-group">
            <label htmlFor="register-email" className="input-label">
              Email Address
            </label>
            <input
              id="register-email"
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
            <label htmlFor="register-password" className="input-label">
              Password
            </label>
            <input
              id="register-password"
              type="password"
              className="input-field"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
            />
          </div>

          <button
            id="register-submit"
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ width: '100%', marginTop: '8px', padding: '14px' }}
          >
            {loading ? (
              <>
                <span className="spinner" /> Creating account…
              </>
            ) : (
              'Create Account'
            )}
          </button>
        </form>

        {/* Link to login */}
        <p style={styles.footerText}>
          Already have an account?{' '}
          <a href="/login" style={styles.link}>
            Sign in
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
