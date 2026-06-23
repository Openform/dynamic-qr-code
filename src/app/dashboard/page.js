"use client"

import { useState, useEffect, useCallback } from "react"
import StatsCards from "./components/StatsCards"
import QRCodeCard from "./components/QRCodeCard"
import CreateEditModal from "./components/CreateEditModal"
import CollectionsBar from "./components/CollectionsBar"
import CollectionModal from "./components/CollectionModal"
import Avatar from "./components/Avatar"
import Link from "next/link"

export default function DashboardPage() {
  const [user, setUser] = useState(null)
  const [qrcodes, setQrcodes] = useState([])
  const [collections, setCollections] = useState([])
  // "all" | "default" | <collectionId number>
  const [activeCollection, setActiveCollection] = useState("all")
  const [totalScans, setTotalScans] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [editingQR, setEditingQR] = useState(null) // null = create, object = edit
  // Collection create/rename modal: { mode: "create" | "rename", collection }
  const [collectionModal, setCollectionModal] = useState(null)

  // ---- Fetch user & QR codes on mount ----
  useEffect(() => {
    async function loadData() {
      try {
        const [userRes, qrRes, statsRes, collectionsRes] = await Promise.all([
          fetch("/api/auth/me"),
          fetch("/api/qrcodes"),
          fetch("/api/user/stats"),
          fetch("/api/collections")
        ])

        if (!userRes.ok) {
          window.location.href = "/login"
          return
        }

        const userData = await userRes.json()
        setUser(userData.user ?? userData)

        if (qrRes.ok) {
          const qrData = await qrRes.json()
          setQrcodes(qrData.qrcodes ?? qrData ?? [])
        }

        if (statsRes.ok) {
          const statsData = await statsRes.json()
          setTotalScans(statsData.totalScans ?? 0)
        }

        if (collectionsRes.ok) {
          const colData = await collectionsRes.json()
          setCollections(colData.collections ?? [])
        }
      } catch (error) {
        console.error("Failed to load dashboard data:", error)
        window.location.href = "/login"
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  // ---- Handlers ----
  function handleCreate() {
    setEditingQR(null)
    setModalOpen(true)
  }

  function handleEdit(qr) {
    setEditingQR(qr)
    setModalOpen(true)
  }

  async function handleDelete(qr) {
    if (!confirm(`Delete "${qr.title}"? This cannot be undone.`)) return

    try {
      const res = await fetch(`/api/qrcodes/${qr.id}`, { method: "DELETE" })
      if (res.ok) {
        setQrcodes((prev) => prev.filter((q) => q.id !== qr.id))
        setTotalScans((prev) => prev - (qr.scanCount ?? 0))
      }
    } catch (error) {
      console.error("Failed to delete QR code:", error)
    }
  }

  const handleSave = useCallback(
    async (formData) => {
      if (editingQR) {
        // Update existing
        const res = await fetch(`/api/qrcodes/${editingQR.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData)
        })
        if (res.ok) {
          const data = await res.json()
          const updated = data.qrcode ?? data
          setQrcodes((prev) =>
            prev.map((q) => (q.id === editingQR.id ? { ...q, ...updated } : q))
          )
          setModalOpen(false)
        }
      } else {
        // Create new
        const res = await fetch("/api/qrcodes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData)
        })
        if (res.ok) {
          const data = await res.json()
          const newQR = data.qrcode ?? data
          setQrcodes((prev) => [newQR, ...prev])
          setModalOpen(false)
        }
      }
    },
    [editingQR]
  )

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" })
    } catch (error) {
      console.error("Logout failed:", error)
    }
    window.location.href = "/"
  }

  // ---- Collection handlers ----

  // Create or rename a collection. Throws on failure so CollectionModal can
  // surface the server's message (e.g. a duplicate name) inline.
  const handleCollectionSubmit = useCallback(
    async (name) => {
      const mode = collectionModal?.mode
      const isRename = mode === "rename"
      const url = isRename
        ? `/api/collections/${collectionModal.collection.id}`
        : "/api/collections"

      const res = await fetch(url, {
        method: isRename ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || "Could not save collection.")
      }

      const saved = data.collection
      if (isRename) {
        setCollections((prev) =>
          prev.map((c) => (c.id === saved.id ? { ...c, ...saved } : c))
        )
      } else {
        setCollections((prev) => [saved, ...prev])
        setActiveCollection(saved.id)
      }
      setCollectionModal(null)
    },
    [collectionModal]
  )

  async function handleDeleteCollection(collection) {
    if (
      !confirm(
        `Delete the "${collection.name}" collection? Its codes won't be deleted — they'll move to the Default collection.`
      )
    )
      return

    try {
      const res = await fetch(`/api/collections/${collection.id}`, {
        method: "DELETE"
      })
      if (res.ok) {
        setCollections((prev) => prev.filter((c) => c.id !== collection.id))
        // Codes in the deleted collection revert to Default (collectionId null).
        setQrcodes((prev) =>
          prev.map((q) =>
            q.collectionId === collection.id ? { ...q, collectionId: null } : q
          )
        )
        setActiveCollection((cur) => (cur === collection.id ? "all" : cur))
      }
    } catch (error) {
      console.error("Failed to delete collection:", error)
    }
  }

  // Assign a single code to a collection (null = Default) from its card.
  async function handleAssignCollection(qr, collectionId) {
    const previous = qr.collectionId ?? null
    if (previous === collectionId) return

    // Optimistic update — revert if the request fails.
    setQrcodes((prev) =>
      prev.map((q) => (q.id === qr.id ? { ...q, collectionId } : q))
    )
    try {
      const res = await fetch(`/api/qrcodes/${qr.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collectionId })
      })
      if (!res.ok) throw new Error("assign failed")
    } catch (error) {
      console.error("Failed to assign collection:", error)
      setQrcodes((prev) =>
        prev.map((q) => (q.id === qr.id ? { ...q, collectionId: previous } : q))
      )
    }
  }

  // ---- Derived data ----

  // Live counts for the collection pills, derived from the loaded codes so they
  // stay accurate as codes are created, moved, or deleted client-side.
  function countFor(key) {
    if (key === "all") return qrcodes.length
    if (key === "default")
      return qrcodes.filter((q) => q.collectionId == null).length
    return qrcodes.filter((q) => q.collectionId === key).length
  }

  const filteredQRCodes = qrcodes.filter((qr) => {
    const matchesSearch = qr.title
      ?.toLowerCase()
      .includes(search.toLowerCase())
    let matchesCollection = true
    if (activeCollection === "default") {
      matchesCollection = qr.collectionId == null
    } else if (activeCollection !== "all") {
      matchesCollection = qr.collectionId === activeCollection
    }
    return matchesSearch && matchesCollection
  })

  // New codes default into whichever collection is currently being viewed.
  const newCodeCollectionId =
    typeof activeCollection === "number" ? activeCollection : null

  // ---- Loading state ----
  if (loading) {
    return (
      <div style={styles.loadingPage}>
        <div className="spinner spinner-lg" />
        <p style={{ color: "var(--text-secondary)", marginTop: "16px" }}>
          Loading your dashboard…
        </p>
      </div>
    )
  }

  return (
    <div className="page-wrapper">
      {/* ---- Header ---- */}
      <header style={styles.header}>
        <div className="container" style={styles.headerInner}>
          <div style={styles.headerLeft}>
            <Link href="/dashboard">
              <span className="gradient-text" style={styles.logo}>
                QRFlow
              </span>
            </Link>
          </div>
          <div style={styles.headerRight}>
            <Link
              href="/dashboard/settings"
              id="profile-settings-link"
              style={styles.profileLink}
              title="Profile settings"
            >
              <Avatar src={user?.avatar} name={user?.name} size={34} />
              <span style={styles.greeting}>{user?.name || "User"}</span>
            </Link>
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
      <main
        className="container"
        style={{ paddingTop: "32px", paddingBottom: "64px" }}
      >
        {/* Stats */}
        <div className="animate-fadeIn">
          <StatsCards totalQRCodes={qrcodes.length} totalScans={totalScans} />
        </div>

        {/* Collections */}
        <CollectionsBar
          collections={collections}
          activeCollection={activeCollection}
          countFor={countFor}
          onSelect={setActiveCollection}
          onNew={() => setCollectionModal({ mode: "create", collection: null })}
          onRename={(collection) =>
            setCollectionModal({ mode: "rename", collection })
          }
          onDelete={handleDeleteCollection}
        />

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
              style={{ paddingLeft: "40px" }}
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
            <div style={{ fontSize: "3rem", marginBottom: "16px" }}>📭</div>
            <h3 style={{ fontWeight: 600, marginBottom: "8px" }}>
              {search
                ? "No QR codes found"
                : activeCollection !== "all"
                  ? "No codes in this collection yet"
                  : "Create your first QR code"}
            </h3>
            <p style={{ color: "var(--text-secondary)", marginBottom: "24px" }}>
              {search
                ? "Try a different search term."
                : activeCollection !== "all"
                  ? "Create a code here, or assign existing ones to this collection from their cards."
                  : "Get started by creating a dynamic QR code that you can update anytime."}
            </p>
            {!search && (
              <button className="btn btn-primary" onClick={handleCreate}>
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
                collections={collections}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onAssignCollection={handleAssignCollection}
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
        collections={collections}
        defaultCollectionId={newCodeCollectionId}
      />

      {/* ---- Collection Create / Rename Modal ---- */}
      {collectionModal && (
        <CollectionModal
          key={`${collectionModal.mode}-${collectionModal.collection?.id ?? "new"}`}
          title={
            collectionModal.mode === "rename"
              ? "Rename Collection"
              : "New Collection"
          }
          submitLabel={
            collectionModal.mode === "rename"
              ? "Save Changes"
              : "Create Collection"
          }
          initialName={collectionModal.collection?.name || ""}
          onClose={() => setCollectionModal(null)}
          onSubmit={handleCollectionSubmit}
        />
      )}
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
  headerLeft: {
    display: "flex",
    alignItems: "center"
  },
  logo: {
    fontSize: "1.4rem",
    fontWeight: 700,
    letterSpacing: "-0.02em"
  },
  headerRight: {
    display: "flex",
    alignItems: "center",
    gap: "16px"
  },
  greeting: {
    fontSize: "0.9rem",
    color: "var(--text-secondary)"
  },
  profileLink: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "4px 12px 4px 4px",
    borderRadius: "9999px",
    border: "1px solid var(--glass-border)"
  },
  actionBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "16px",
    marginBottom: "28px",
    flexWrap: "wrap"
  },
  searchWrap: {
    position: "relative",
    flex: "1 1 260px",
    maxWidth: "400px"
  },
  searchIcon: {
    position: "absolute",
    left: "14px",
    top: "50%",
    transform: "translateY(-50%)",
    fontSize: "0.9rem",
    pointerEvents: "none"
  },
  emptyState: {
    textAlign: "center",
    padding: "80px 24px",
    background: "rgba(255,255,255,0.02)",
    borderRadius: "24px",
    border: "1px dashed rgba(255,255,255,0.08)"
  }
}
