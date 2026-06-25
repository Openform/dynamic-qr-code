"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import Avatar from "../components/Avatar"

import { Style, avatar } from "@dicebear/core"
import lorelei from "@dicebear/styles/lorelei.json" with { type: "json" }

// Preset avatars served as static SVGs from /public/avatars.
// Pick any seeds (names) you like!
const seeds = [
  "Felix",
  "Aneka",
  "Jude",
  "Miya",
  "Milo",
  "Luna",
  "Sophie",
  "mqq401q4",
  "rlnap45o"
]

const PRESET_AVATARS = seeds.map((seed) => ({
  id: seed,
  name: seed,
  // Change "notionists" to whatever DiceBear style you prefer (e.g., "avataaars", "bottts")
  url: `https://api.dicebear.com/10.x/lorelei/svg?seed=${seed}`
}))

// const PRESET_AVATARS = [
//   "/avatars/avatar1.jpg",
//   "/avatars/ocean.svg",
//   "/avatars/sunset.svg",
//   "/avatars/forest.svg",
//   "/avatars/ember.svg",
//   "/avatars/grape.svg"
// ]

// Uploaded images are downscaled to this square size before being stored as a
// data URL, keeping the payload small (must stay under the server's cap).
const AVATAR_SIZE = 256

function Message({ msg }) {
  if (!msg) return null
  const isError = msg.type === "error"
  return (
    <div
      role="status"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "12px 16px",
        borderRadius: "var(--radius-md)",
        fontSize: "0.9rem",
        marginBottom: "18px",
        background: isError ? "rgba(239,68,68,0.1)" : "rgba(16,185,129,0.1)",
        border: `1px solid ${isError ? "rgba(239,68,68,0.25)" : "rgba(16,185,129,0.25)"}`,
        color: isError ? "var(--error)" : "var(--success)"
      }}
    >
      <span>{isError ? "⚠" : "✓"}</span> {msg.text}
    </div>
  )
}

export default function SettingsPage() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // Profile form
  const [name, setName] = useState("")
  const [avatar, setAvatar] = useState(null)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileMsg, setProfileMsg] = useState(null)

  // Password form
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [pwSaving, setPwSaving] = useState(false)
  const [pwMsg, setPwMsg] = useState(null)

  const fileRef = useRef(null)

  // ---- Load current user ----
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/auth/me")
        if (!res.ok) {
          window.location.href = "/login"
          return
        }
        const data = await res.json()
        const u = data.user ?? data
        setUser(u)
        setName(u.name || "")
        setAvatar(u.avatar ?? null)
      } catch {
        window.location.href = "/login"
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // ---- Resize an uploaded file to a square data URL ----
  function processFile(file) {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith("image/")) {
        reject(new Error("Please choose an image file"))
        return
      }
      const reader = new FileReader()
      reader.onerror = () => reject(new Error("Could not read that file"))
      reader.onload = () => {
        const img = new window.Image()
        img.onerror = () => reject(new Error("Could not load that image"))
        img.onload = () => {
          const canvas = document.createElement("canvas")
          canvas.width = AVATAR_SIZE
          canvas.height = AVATAR_SIZE
          const ctx = canvas.getContext("2d")
          // Cover-crop: scale so the shorter side fills, then center.
          const scale = Math.max(
            AVATAR_SIZE / img.width,
            AVATAR_SIZE / img.height
          )
          const w = img.width * scale
          const h = img.height * scale
          ctx.drawImage(img, (AVATAR_SIZE - w) / 2, (AVATAR_SIZE - h) / 2, w, h)
          resolve(canvas.toDataURL("image/jpeg", 0.85))
        }
        img.src = reader.result
      }
      reader.readAsDataURL(file)
    })
  }

  async function handleFile(e) {
    const file = e.target.files?.[0]
    e.target.value = "" // allow re-selecting the same file later
    if (!file) return
    setProfileMsg(null)
    try {
      const dataUrl = await processFile(file)
      setAvatar(dataUrl)
    } catch (err) {
      setProfileMsg({ type: "error", text: err.message })
    }
  }

  async function handleSaveProfile(e) {
    e.preventDefault()
    setProfileMsg(null)
    setProfileSaving(true)
    try {
      const res = await fetch("/api/user/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, avatar })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to save profile")
      setUser(data)
      setName(data.name || "")
      setAvatar(data.avatar ?? null)
      setProfileMsg({ type: "success", text: "Profile updated" })
    } catch (err) {
      setProfileMsg({ type: "error", text: err.message })
    } finally {
      setProfileSaving(false)
    }
  }

  async function handleSavePassword(e) {
    e.preventDefault()
    setPwMsg(null)

    if (newPassword.length < 6) {
      setPwMsg({
        type: "error",
        text: "New password must be at least 6 characters"
      })
      return
    }
    if (newPassword !== confirmPassword) {
      setPwMsg({ type: "error", text: "New passwords do not match" })
      return
    }

    setPwSaving(true)
    try {
      const res = await fetch("/api/user/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to update password")
      setPwMsg({ type: "success", text: "Password updated" })
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
    } catch (err) {
      setPwMsg({ type: "error", text: err.message })
    } finally {
      setPwSaving(false)
    }
  }

  // ---- Loading state ----
  if (loading) {
    return (
      <div style={styles.loadingPage}>
        <div className="spinner spinner-lg" />
        <p style={{ color: "var(--text-secondary)", marginTop: "16px" }}>
          Loading your settings…
        </p>
      </div>
    )
  }

  return (
    <div className="page-wrapper">
      {/* ---- Header ---- */}
      <header style={styles.header}>
        <div className="container" style={styles.headerInner}>
          <Link href="/dashboard">
            <span className="gradient-text" style={styles.logo}>
              QR Flow
            </span>
          </Link>
          <Link href="/dashboard" className="btn btn-ghost btn-sm">
            ← Back to Dashboard
          </Link>
        </div>
      </header>

      {/* ---- Main ---- */}
      <main className="container" style={styles.main}>
        <h1 style={styles.pageTitle}>Profile Settings</h1>
        <p style={styles.pageSubtitle}>
          Manage your profile picture, display name, and password.
        </p>

        <div style={{ display: "flex", gap: "24px" }}>
          {/* ---- Profile card ---- */}
          <section
            className="glass-card-static animate-fadeIn"
            style={styles.card}
          >
            <h2 style={styles.cardTitle}>Profile</h2>
            <form onSubmit={handleSaveProfile}>
              <Message msg={profileMsg} />

              {/* Avatar preview + upload */}
              <div style={styles.avatarRow}>
                <Avatar src={avatar} name={name} size={96} />
                <div style={{ flex: 1, minWidth: "200px" }}>
                  <p style={styles.help}>
                    Pick a preset below or upload your own. Square images look
                    best.
                  </p>
                  <div style={styles.avatarActions}>
                    <button
                      type="button"
                      id="upload-avatar-btn"
                      className="btn btn-secondary btn-sm"
                      onClick={() => fileRef.current?.click()}
                    >
                      Upload image
                    </button>
                    {avatar && (
                      <button
                        type="button"
                        id="remove-avatar-btn"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setAvatar(null)}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFile}
                    style={{ display: "none" }}
                  />
                </div>
              </div>

              {/* Preset grid */}
              <p className="input-label" style={{ marginTop: "24px" }}>
                Preset avatars
              </p>
              <div style={styles.presetGrid}>
                {PRESET_AVATARS.map((preset) => {
                  // Check if this preset URL matches the currently selected avatar
                  const isSelected = avatar === preset.url

                  return (
                    <button
                      type="button"
                      key={preset.id}
                      onClick={() => setAvatar(preset.url)}
                      aria-label={`Select ${preset.name} avatar`}
                      aria-pressed={isSelected}
                      style={{
                        ...styles.presetBtn,
                        ...(isSelected ? styles.presetSelected : {})
                      }}
                    >
                      {/* Pass the clean API URL directly to your UI component */}
                      <Avatar src={preset.url} name="" size={56} />
                    </button>
                  )
                })}
              </div>
              {/* <div style={styles.presetGrid}>
                {PRESET_AVATARS.map((preset) => {
                  const selected = avatar === preset
                  return (
                    <button
                      type="button"
                      key={preset}
                      onClick={() => setAvatar(preset)}
                      aria-label={`Select ${preset.split("/").pop().replace(".svg", "")} avatar`}
                      aria-pressed={selected}
                      style={{
                        ...styles.presetBtn,
                        ...(selected ? styles.presetSelected : {})
                      }}
                    >
                      <Avatar src={preset} name="" size={56} />
                    </button>
                  )
                })}
              </div> */}

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "24px",
                  flexWrap: "wrap",
                  marginTop: "28px"
                }}
              >
                {/* Display name */}
                <div
                  className="input-group"
                  style={{ width: "calc(50% - 12px)" }}
                >
                  <label htmlFor="profile-name" className="input-label">
                    Display Name
                  </label>
                  <input
                    id="profile-name"
                    type="text"
                    className="input-field"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    maxLength={255}
                    autoComplete="name"
                  />
                </div>

                {/* Email (read-only) */}
                <div
                  className="input-group"
                  style={{ width: "calc(50% - 12px)" }}
                >
                  <label htmlFor="profile-email" className="input-label">
                    Email
                  </label>
                  <input
                    id="profile-email"
                    type="email"
                    className="input-field"
                    value={user?.email || ""}
                    disabled
                    style={{ opacity: 0.6, cursor: "not-allowed" }}
                  />
                </div>
              </div>

              <div style={styles.cardFooter}>
                <button
                  id="save-profile-btn"
                  type="submit"
                  className="btn btn-primary"
                  disabled={profileSaving}
                >
                  {profileSaving ? (
                    <>
                      <span className="spinner" /> Saving…
                    </>
                  ) : (
                    "Save Profile"
                  )}
                </button>
              </div>
            </form>
          </section>

          {/* ---- Password card ---- */}
          <section
            className="glass-card-static animate-fadeIn"
            style={styles.card2}
          >
            <h2 style={styles.cardTitle}>Change Password</h2>
            <form onSubmit={handleSavePassword}>
              <Message msg={pwMsg} />

              <div className="input-group">
                <label htmlFor="current-password" className="input-label">
                  Current Password
                </label>
                <input
                  id="current-password"
                  type="password"
                  className="input-field"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>

              <div className="input-group">
                <label htmlFor="new-password" className="input-label">
                  New Password
                </label>
                <input
                  id="new-password"
                  type="password"
                  className="input-field"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete="new-password"
                />
              </div>

              <div className="input-group">
                <label htmlFor="confirm-password" className="input-label">
                  Confirm New Password
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  className="input-field"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete="new-password"
                />
              </div>

              <div style={styles.cardFooter}>
                <button
                  id="save-password-btn"
                  type="submit"
                  className="btn btn-primary"
                  disabled={pwSaving}
                >
                  {pwSaving ? (
                    <>
                      <span className="spinner" /> Updating…
                    </>
                  ) : (
                    "Update Password"
                  )}
                </button>
              </div>
            </form>
          </section>
        </div>
      </main>
    </div>
  )
}

const styles = {
  loadingPage: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh"
  },
  header: {
    position: "sticky",
    top: 0,
    zIndex: 50,
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
    background: "rgba(10, 10, 26, 0.85)",
    borderBottom: "1px solid rgba(255,255,255,0.06)"
  },
  headerInner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    height: "64px"
  },
  logo: {
    fontSize: "1.4rem",
    fontWeight: 700,
    letterSpacing: "-0.02em"
  },
  main: {
    maxWidth: "1440px",
    width: "100%",
    paddingTop: "32px",
    paddingBottom: "64px"
  },
  pageTitle: {
    fontSize: "1.8rem",
    fontWeight: 700,
    letterSpacing: "-0.02em"
  },
  pageSubtitle: {
    color: "var(--text-secondary)",
    marginTop: "6px",
    marginBottom: "28px"
  },
  card: {
    padding: "28px",
    marginBottom: "24px",
    width: "60%"
  },
  card2: {
    padding: "28px",
    marginBottom: "24px",
    width: "40%"
  },
  cardTitle: {
    fontSize: "1.15rem",
    fontWeight: 600,
    marginBottom: "20px"
  },
  avatarRow: {
    display: "flex",
    alignItems: "center",
    gap: "20px",
    flexWrap: "wrap"
  },
  help: {
    color: "var(--text-secondary)",
    fontSize: "0.9rem",
    marginBottom: "12px"
  },
  avatarActions: {
    display: "flex",
    gap: "10px",
    flexWrap: "wrap"
  },
  presetGrid: {
    display: "flex",
    gap: "12px",
    flexWrap: "wrap"
  },
  presetBtn: {
    padding: "4px",
    borderRadius: "50%",
    background: "transparent",
    border: "2px solid transparent",
    transition: "all var(--transition-fast)",
    lineHeight: 0
  },
  presetSelected: {
    border: "2px solid var(--cyan)",
    boxShadow: "0 0 0 3px rgba(0,212,255,0.15)"
  },
  cardFooter: {
    display: "flex",
    justifyContent: "flex-end",
    marginTop: "24px"
  }
}
