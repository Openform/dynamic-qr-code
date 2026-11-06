"use client"

import { useState, useEffect, useCallback } from "react"
import StatsCards from "./components/StatsCards"
import QRCodeCard from "./components/QRCodeCard"
import CreateEditModal from "./components/CreateEditModal"
import BulkCreateModal from "./components/BulkCreateModal"
import UndoToast from "./components/UndoToast"
import SelectionBar from "./components/SelectionBar"
import TrashedCodeCard from "./components/TrashedCodeCard"
import { downloadCodesCsv } from "./components/downloadCsv"
import ConfirmActionModal from "@/app/components/ConfirmActionModal"
import CollectionsBar from "./components/CollectionsBar"
import CollectionModal from "./components/CollectionModal"
import Avatar from "./components/Avatar"
import { SearchIcon, InboxIcon, TrashIcon } from "@/app/components/icons"
import { remainingCodes } from "@/lib/bulk"
import { MAX_TRASH_IDS, TRASH_RETENTION_DAYS } from "@/lib/trash"
import Link from "next/link"

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

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
  const [bulkOpen, setBulkOpen] = useState(false)
  // The popup at the bottom with a one-click Undo for the latest bulk
  // creation or move to Trash (props for <UndoToast>), or null.
  const [toast, setToast] = useState(null)
  // Selecting codes for a bulk action. `selected` holds ids; only the ones in
  // the current view count (see selectedIds).
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState(() => new Set())
  const [lastSelectedId, setLastSelectedId] = useState(null)
  // Confirm dialog before moving codes to Trash: { codes, fromEditModal }
  const [trashConfirm, setTrashConfirm] = useState(null)
  // Trash: codes deleted but still restorable. `trashCount` is known from the
  // start (it labels the pill); the list itself is fetched when Trash is opened.
  const [trashed, setTrashed] = useState([])
  const [trashStatus, setTrashStatus] = useState("idle") // idle | loading | error
  const [trashCount, setTrashCount] = useState(0)
  const [trashBusy, setTrashBusy] = useState(false) // a restore is in flight
  const [trashNotice, setTrashNotice] = useState(null) // { text, error }
  // Typed-confirmation dialog for deleting from Trash for good:
  // { ids, codes, all, count }
  const [purgeConfirm, setPurgeConfirm] = useState(null)

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
          setTrashCount(statsData.trashedQRCodes ?? 0)
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

  // Escape leaves select mode — unless a dialog is open, which closes itself.
  const inTrash = activeCollection === "trash"
  const anyModalOpen =
    modalOpen ||
    bulkOpen ||
    Boolean(collectionModal) ||
    Boolean(trashConfirm) ||
    Boolean(purgeConfirm)
  useEffect(() => {
    if ((!selectMode && !inTrash) || anyModalOpen) return
    function onKey(e) {
      if (e.key === "Escape") {
        // The Trash view is always selectable, so Escape just clears the selection.
        if (!inTrash) setSelectMode(false)
        setSelected(new Set())
        setLastSelectedId(null)
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [selectMode, inTrash, anyModalOpen])

  // ---- Package limit ----
  // `limit` is null on unlimited packages. The server enforces this too; the
  // check here just stops the user filling in a code they can't save.
  const codeLimit = user?.package?.limit ?? null
  const atCodeLimit = codeLimit !== null && qrcodes.length >= codeLimit
  const codesRemaining = remainingCodes(codeLimit, qrcodes.length)

  // ---- Handlers ----
  function handleCreate() {
    if (atCodeLimit) return
    setEditingQR(null)
    setModalOpen(true)
  }

  function handleBulkOpen() {
    if (atCodeLimit) return
    setBulkOpen(true)
  }

  // Reload the code list and scan total from the server — used when the
  // browser can't be sure what the server did (a dropped connection, a partial
  // undo) so the dashboard never shows a guess.
  const refreshCodes = useCallback(async () => {
    try {
      const [qrRes, statsRes] = await Promise.all([
        fetch("/api/qrcodes"),
        fetch("/api/user/stats")
      ])
      if (qrRes.ok) {
        const qrData = await qrRes.json()
        setQrcodes(qrData.qrcodes ?? [])
      }
      if (statsRes.ok) {
        const statsData = await statsRes.json()
        setTotalScans(statsData.totalScans ?? 0)
        setTrashCount(statsData.trashedQRCodes ?? 0)
      }
    } catch (error) {
      console.error("Failed to refresh dashboard data:", error)
    }
  }, [])

  // Load the Trash list (the server also deletes anything past its 30 days
  // first). `quiet` keeps the list on screen while it reloads.
  const loadTrash = useCallback(async (quiet = false) => {
    if (!quiet) setTrashStatus("loading")
    try {
      const res = await fetch("/api/qrcodes/trash")
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const list = data.qrcodes ?? []
      setTrashed(list)
      setTrashCount(list.length)
      setTrashStatus("idle")
    } catch (error) {
      console.error("Failed to load Trash:", error)
      if (!quiet) setTrashStatus("error")
    }
  }, [])

  function handleBulkCreated({ qrcodes: created, collectionId, collectionName }) {
    // The server returns the batch in row order, but the list is newest first,
    // so a reload would show it reversed — match that.
    setQrcodes((prev) => [...[...created].reverse(), ...prev])
    setBulkOpen(false)
    setSearch("")
    // Make sure the new codes are on screen: show the collection they went
    // into, or Default when the user was looking at some other collection.
    if (typeof collectionId === "number") setActiveCollection(collectionId)
    else if (typeof activeCollection === "number") setActiveCollection("default")
    // Undo moves the whole batch to Trash, so it stays recoverable.
    setToast({
      id: Date.now(),
      title: `Created ${plural(created.length, "QR code", "QR codes")}`,
      subtitle: collectionName ? `in ${collectionName}` : "",
      actions: [
        {
          id: "bulk-download-csv",
          label: "Download CSV",
          title: "Download the new codes’ links as a spreadsheet",
          onClick: () => downloadCodesCsv(created)
        }
      ],
      autoDismissMs: 10 * 60_000,
      onUndo: () => trashIds(created.map((q) => q.id)),
      doneMessage: (r) =>
        `Undone — ${plural(r.trashed, "QR code", "QR codes")} moved to Trash.` +
        (r.skipped > 0 ? ` ${r.skipped} couldn’t be moved (already gone).` : "")
    })
  }

  // POST a list of ids to one of the bulk endpoints. Resolves to the parsed
  // response, or throws an Error with a user-facing message.
  async function postIds(endpoint, ids, fallbackMessage) {
    let res
    try {
      res = await fetch(`/api/qrcodes/bulk/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids })
      })
    } catch {
      throw new Error("Couldn’t reach the server. Check your connection and try again.")
    }
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || fallbackMessage)
    return data
  }

  // Move codes to Trash. The list is reloaded afterwards so anything the server
  // skipped stays visible.
  async function trashIds(ids) {
    const data = await postIds("trash", ids, "Couldn’t move the codes to Trash. Please try again.")
    await refreshCodes()
    return data
  }

  // Bring codes back from Trash. The server refuses (with a message saying how
  // many fit) when that would take the account past its package limit.
  async function restoreIds(ids) {
    let data
    try {
      data = await postIds("restore", ids, "Couldn’t restore the codes. Please try again.")
    } catch (error) {
      // Most often the package limit: the account has changed since this page
      // loaded (say, codes created in another tab), so catch the list up.
      await refreshCodes()
      throw error
    }
    await refreshCodes()
    return data
  }

  function handleEdit(qr) {
    setEditingQR(qr)
    setModalOpen(true)
  }

  // Delete (on the edit screen) moves the code to Trash, after confirming.
  function handleDelete(qr) {
    setTrashConfirm({ codes: [qr], fromEditModal: true })
  }

  // Run from the confirm dialog. Throws (so the dialog shows the message) when
  // the move fails; on success the dialog is closed here.
  async function confirmTrash() {
    const { codes, fromEditModal } = trashConfirm
    const ids = codes.map((q) => q.id)
    const data = await postIds("trash", ids, "Couldn’t move the codes to Trash. Please try again.")

    if (data.skipped > 0) {
      // Some were already gone: take the server's word for what's left.
      await refreshCodes()
    } else {
      const gone = new Set(ids)
      setQrcodes((prev) => prev.filter((q) => !gone.has(q.id)))
      setTotalScans((prev) => prev - codes.reduce((n, q) => n + (q.scanCount ?? 0), 0))
    }

    setTrashCount((count) => count + data.trashed)
    exitSelectMode()
    if (fromEditModal) setModalOpen(false)
    setTrashConfirm(null)

    const only = codes.length === 1 ? codes[0] : null
    setToast({
      id: Date.now(),
      title: only
        ? `Moved “${only.title}” to Trash`
        : `Moved ${plural(data.trashed, "QR code", "QR codes")} to Trash`,
      subtitle: "",
      autoDismissMs: 30_000,
      onUndo: () => restoreIds(ids),
      doneMessage: (r) => `Restored ${plural(r.restored, "QR code", "QR codes")}.`
    })
  }

  // Switch the collection pill / Trash. Selecting stays on while moving between
  // collections, but not into or out of Trash (those are different kinds of
  // code, with different actions).
  function handleSelectView(key) {
    if (key === "trash" || inTrash) exitSelectMode()
    setTrashNotice(null)
    setActiveCollection(key)
    if (key === "trash") loadTrash()
  }

  // ---- Trash actions ----

  // Restore codes from Trash (one card, or the selection). Refused as a whole
  // when they wouldn't fit the package limit; the message says how many do.
  async function restoreFromTrash(ids) {
    setTrashBusy(true)
    setTrashNotice(null)
    try {
      const data = await postIds("restore", ids, "Couldn’t restore the codes. Please try again.")
      setSelected(new Set())
      setTrashNotice({
        text: `Restored ${plural(data.restored, "QR code", "QR codes")}.`,
        error: false
      })
    } catch (error) {
      setTrashNotice({ text: error.message, error: true })
    } finally {
      // Either way, take the server's word for what's where now.
      await Promise.all([loadTrash(true), refreshCodes()])
      setTrashBusy(false)
    }
  }

  // Run from the typed-confirmation dialog: delete from Trash for good. Throws
  // (so the dialog shows the message) on failure.
  async function confirmPurge() {
    const { ids, all } = purgeConfirm
    let res
    try {
      res = await fetch("/api/qrcodes/bulk/purge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(all ? { all: true } : { ids })
      })
    } catch {
      throw new Error("Couldn’t reach the server. Check your connection and try again.")
    }
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || "Couldn’t delete the codes. Please try again.")

    setPurgeConfirm(null)
    setSelected(new Set())
    setTrashNotice({
      text: `Deleted ${plural(data.deleted, "QR code", "QR codes")} forever.`,
      error: false
    })
    await loadTrash(true)
  }

  // ---- Selection ----
  function enterSelectMode() {
    setSelectMode(true)
  }

  function exitSelectMode() {
    setSelectMode(false)
    setSelected(new Set())
    setLastSelectedId(null)
  }

  function toggleSelect(qr, extendRange = false) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (extendRange && lastSelectedId !== null) {
        // Shift-click selects everything between the last click and this one.
        const a = viewCodes.findIndex((q) => q.id === lastSelectedId)
        const b = viewCodes.findIndex((q) => q.id === qr.id)
        if (a !== -1 && b !== -1) {
          const [from, to] = a < b ? [a, b] : [b, a]
          for (let i = from; i <= to && next.size < MAX_TRASH_IDS; i++) {
            next.add(viewCodes[i].id)
          }
          return next
        }
      }
      if (next.has(qr.id)) next.delete(qr.id)
      else if (next.size < MAX_TRASH_IDS) next.add(qr.id)
      return next
    })
    setLastSelectedId(qr.id)
  }

  function selectAllInView() {
    setSelected(new Set(viewCodes.slice(0, MAX_TRASH_IDS).map((q) => q.id)))
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
        } else {
          // e.g. the package limit was reached from another tab or device.
          const data = await res.json().catch(() => ({}))
          alert(data.error || "Could not create the QR code. Please try again.")
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

  // The Trash view lists trashed codes (search applies there too).
  const filteredTrashed = trashed.filter((qr) =>
    qr.title?.toLowerCase().includes(search.toLowerCase())
  )

  // Whatever list is on screen, selectable. Only codes in the current view count
  // as selected: filtering or searching never leaves hidden codes selected, so
  // an action can't touch what the user can't see.
  const viewCodes = inTrash ? filteredTrashed : filteredQRCodes
  const selectedVisible = viewCodes.filter((q) => selected.has(q.id))
  const showSelectionBar =
    selectMode || (inTrash && selectedVisible.length > 0)

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
                QR Go
              </span>
            </Link>
          </div>
          <div style={styles.headerRight}>
            <Link
              href="/dashboard/analytics"
              id="analytics-link"
              className="btn btn-ghost btn-sm"
            >
              Analytics
            </Link>
            {user?.isAdmin && (
              <Link
                href="/admin"
                id="admin-link"
                className="btn btn-ghost btn-sm"
              >
                Admin
              </Link>
            )}
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
        // Extra room at the bottom while selecting, so the fixed selection bar
        // never covers the last row of codes.
        style={{ paddingTop: "32px", paddingBottom: showSelectionBar ? "140px" : "64px" }}
      >
        {/* Stats */}
        <div className="animate-fadeIn">
          <StatsCards
            totalQRCodes={qrcodes.length}
            totalScans={totalScans}
            plan={user?.package}
          />
        </div>

        {atCodeLimit && (
          <div
            id="package-limit-notice"
            role="status"
            style={styles.limitNotice}
            className="animate-fadeIn"
          >
            <span>⚠</span>
            <span>
              {qrcodes.length > codeLimit
                ? `You have ${qrcodes.length} QR codes, more than the ${codeLimit} your ${user.package.name} package allows. Your existing codes keep working.`
                : `You've used all ${codeLimit} QR codes on your ${user.package.name} package.`}{" "}
              To create more, delete codes you no longer need or contact us to
              upgrade your package.
            </span>
          </div>
        )}

        {/* Collections */}
        <CollectionsBar
          collections={collections}
          activeCollection={activeCollection}
          countFor={countFor}
          trashCount={trashCount}
          onSelect={handleSelectView}
          onNew={() => setCollectionModal({ mode: "create", collection: null })}
          onRename={(collection) =>
            setCollectionModal({ mode: "rename", collection })
          }
          onDelete={handleDeleteCollection}
        />

        {/* Action Bar */}
        <div style={styles.actionBar} className="animate-fadeIn">
          <div style={styles.searchWrap}>
            <span style={styles.searchIcon} aria-hidden="true">
              <SearchIcon size={16} />
            </span>
            <input
              id="search-qrcodes"
              type="text"
              className="input-field"
              placeholder={inTrash ? "Search Trash…" : "Search QR codes…"}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: "40px" }}
            />
          </div>
          {inTrash ? (
            <div style={styles.actionButtons}>
              <button
                id="empty-trash-btn"
                className="btn btn-danger"
                onClick={() =>
                  setPurgeConfirm({ ids: [], codes: [], all: true, count: trashCount })
                }
                disabled={trashCount === 0 || trashBusy}
                title="Delete everything in Trash for good"
              >
                <TrashIcon size={16} /> Empty Trash
              </button>
            </div>
          ) : (
          <div style={styles.actionButtons}>
            <button
              id="select-mode-btn"
              className="btn btn-secondary"
              onClick={selectMode ? exitSelectMode : enterSelectMode}
              disabled={qrcodes.length === 0}
              aria-pressed={selectMode}
              title="Select several codes to move to Trash"
            >
              {selectMode ? "Cancel selection" : "Select"}
            </button>
            <button
              id="bulk-create-btn"
              className="btn btn-secondary"
              onClick={handleBulkOpen}
              disabled={atCodeLimit}
              title={
                atCodeLimit
                  ? "Package limit reached"
                  : "Create many QR codes at once from a list or CSV"
              }
            >
              Bulk create
            </button>
            <button
              id="create-qr-btn"
              className="btn btn-primary"
              onClick={handleCreate}
              disabled={atCodeLimit}
              title={atCodeLimit ? "Package limit reached" : undefined}
            >
              + Create New QR Code
            </button>
          </div>
          )}
        </div>

        {/* Trash, or the QR Codes Grid */}
        {inTrash ? (
          <>
            <p id="trash-intro" style={styles.trashIntro}>
              Codes in Trash don’t work: anyone who scans one sees a “not
              found” page. They’re deleted permanently after{" "}
              {TRASH_RETENTION_DAYS} days.
            </p>

            {trashNotice && (
              <div
                id="trash-notice"
                role={trashNotice.error ? "alert" : "status"}
                style={{
                  ...styles.trashNotice,
                  ...(trashNotice.error ? styles.trashNoticeError : null)
                }}
              >
                {trashNotice.text}
              </div>
            )}

            {trashStatus === "loading" ? (
              <div style={styles.trashLoading}>
                <div className="spinner spinner-lg" />
              </div>
            ) : trashStatus === "error" ? (
              <div style={styles.emptyState} className="animate-fadeIn">
                <h3 style={{ fontWeight: 600, marginBottom: "8px" }}>
                  Couldn’t load Trash
                </h3>
                <p style={{ color: "var(--text-secondary)", marginBottom: "24px" }}>
                  Check your connection and try again.
                </p>
                <button className="btn btn-secondary" onClick={() => loadTrash()}>
                  Try again
                </button>
              </div>
            ) : filteredTrashed.length === 0 ? (
              <div id="trash-empty" style={styles.emptyState} className="animate-fadeIn">
                <div style={styles.emptyIcon}>
                  <TrashIcon size={44} strokeWidth={1.5} />
                </div>
                <h3 style={{ fontWeight: 600, marginBottom: "8px" }}>
                  {search ? "No codes in Trash match" : "Trash is empty"}
                </h3>
                <p style={{ color: "var(--text-secondary)" }}>
                  {search
                    ? "Try a different search term."
                    : `Codes you delete appear here for ${TRASH_RETENTION_DAYS} days, so you can restore them.`}
                </p>
              </div>
            ) : (
              <div className="grid-responsive animate-fadeIn">
                {filteredTrashed.map((qr) => (
                  <TrashedCodeCard
                    key={qr.id}
                    qrcode={qr}
                    selected={selected.has(qr.id)}
                    onToggleSelect={toggleSelect}
                    onRestore={(code) => restoreFromTrash([code.id])}
                    onPurge={(code) =>
                      setPurgeConfirm({ ids: [code.id], codes: [code], all: false, count: 1 })
                    }
                    disabled={trashBusy}
                  />
                ))}
              </div>
            )}
          </>
        ) : filteredQRCodes.length === 0 && !loading ? (
          <div style={styles.emptyState} className="animate-fadeIn">
            <div style={styles.emptyIcon}>
              <InboxIcon size={44} strokeWidth={1.5} />
            </div>
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
              <button
                className="btn btn-primary"
                onClick={handleCreate}
                disabled={atCodeLimit}
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
                collections={collections}
                onEdit={handleEdit}
                onAssignCollection={handleAssignCollection}
                selectable={selectMode}
                selected={selected.has(qr.id)}
                onToggleSelect={toggleSelect}
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
        onDelete={handleDelete}
        qrcode={editingQR}
        collections={collections}
        defaultCollectionId={newCodeCollectionId}
      />

      {/* ---- Bulk Create Modal ---- */}
      <BulkCreateModal
        isOpen={bulkOpen}
        onClose={() => setBulkOpen(false)}
        onCreated={handleBulkCreated}
        onRefresh={refreshCodes}
        collections={collections}
        defaultCollectionId={newCodeCollectionId}
        remaining={codesRemaining}
        planName={user?.package?.name ?? ""}
        limit={codeLimit}
        usedCount={qrcodes.length}
      />

      {/* ---- Undo popup for the latest bulk creation / move to Trash ---- */}
      {/* Hidden while a dialog or the selection bar is up; it comes back after. */}
      {toast && !selectMode && !inTrash && !anyModalOpen && (
        <UndoToast key={toast.id} {...toast} onDismiss={() => setToast(null)} />
      )}

      {/* ---- Selection bar ---- */}
      {showSelectionBar && !anyModalOpen && (
        <SelectionBar
          count={selectedVisible.length}
          selectAllCount={Math.min(viewCodes.length, MAX_TRASH_IDS)}
          capped={viewCodes.length > MAX_TRASH_IDS}
          onSelectAll={selectAllInView}
          onClear={() => setSelected(new Set())}
          actions={
            inTrash
              ? [
                  {
                    id: "restore-selected-btn",
                    label: "Restore",
                    onClick: () => restoreFromTrash(selectedVisible.map((q) => q.id))
                  },
                  {
                    id: "purge-selected-btn",
                    label: "Delete forever",
                    danger: true,
                    onClick: () =>
                      setPurgeConfirm({
                        ids: selectedVisible.map((q) => q.id),
                        codes: selectedVisible,
                        all: false,
                        count: selectedVisible.length
                      })
                  }
                ]
              : [
                  {
                    id: "trash-selected-btn",
                    label: "Move to Trash",
                    danger: true,
                    onClick: () =>
                      setTrashConfirm({ codes: selectedVisible, fromEditModal: false })
                  }
                ]
          }
          onDone={inTrash ? null : exitSelectMode}
        />
      )}

      {/* ---- Confirm: move to Trash ---- */}
      {trashConfirm && (
        <ConfirmActionModal
          title={
            trashConfirm.codes.length === 1
              ? "Move this QR code to Trash?"
              : `Move ${trashConfirm.codes.length} QR codes to Trash?`
          }
          confirmLabel={
            trashConfirm.codes.length === 1
              ? "Move to Trash"
              : `Move ${trashConfirm.codes.length} to Trash`
          }
          busyLabel="Moving…"
          danger
          onConfirm={confirmTrash}
          onClose={() => setTrashConfirm(null)}
        >
          <ul id="trash-confirm-list" style={styles.confirmList}>
            {trashConfirm.codes.slice(0, 5).map((q) => (
              <li key={q.id} className="truncate">
                {q.title}
              </li>
            ))}
            {trashConfirm.codes.length > 5 && (
              <li>…and {trashConfirm.codes.length - 5} more</li>
            )}
          </ul>
          <p style={{ margin: 0 }}>
            {trashConfirm.codes.length === 1 ? "It stops" : "They stop"} working
            straight away: anyone who scans{" "}
            {trashConfirm.codes.length === 1 ? "it" : "one"} will see a “not
            found” page. You can restore{" "}
            {trashConfirm.codes.length === 1 ? "it" : "them"} from Trash for{" "}
            {TRASH_RETENTION_DAYS} days.
          </p>
        </ConfirmActionModal>
      )}

      {/* ---- Confirm: delete from Trash for good (typed) ---- */}
      {purgeConfirm && (
        <ConfirmActionModal
          title={
            purgeConfirm.all
              ? "Empty Trash?"
              : purgeConfirm.count === 1
                ? "Delete this QR code forever?"
                : `Delete ${purgeConfirm.count} QR codes forever?`
          }
          confirmLabel={
            purgeConfirm.all || purgeConfirm.count !== 1
              ? `Delete ${purgeConfirm.count} forever`
              : "Delete forever"
          }
          busyLabel="Deleting…"
          danger
          requireText="delete"
          onConfirm={confirmPurge}
          onClose={() => setPurgeConfirm(null)}
        >
          {!purgeConfirm.all && (
            <ul id="purge-confirm-list" style={styles.confirmList}>
              {purgeConfirm.codes.slice(0, 5).map((q) => (
                <li key={q.id} className="truncate">
                  {q.title}
                </li>
              ))}
              {purgeConfirm.codes.length > 5 && (
                <li>…and {purgeConfirm.codes.length - 5} more</li>
              )}
            </ul>
          )}
          <p style={{ margin: 0 }}>
            This can’t be undone.{" "}
            {purgeConfirm.all
              ? `All ${purgeConfirm.count} codes in Trash`
              : purgeConfirm.count === 1
                ? "This code"
                : "These codes"}{" "}
            will be deleted for good, along with{" "}
            {!purgeConfirm.all && purgeConfirm.count === 1 ? "its" : "their"}{" "}
            scan history.{" "}
            {!purgeConfirm.all && purgeConfirm.count === 1
              ? "Its link"
              : "Their links"}{" "}
            will stop working permanently.
          </p>
        </ConfirmActionModal>
      )}

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
  trashIntro: {
    margin: "0 0 16px",
    fontSize: "0.88rem",
    color: "var(--text-secondary)"
  },
  trashNotice: {
    margin: "0 0 16px",
    padding: "12px 16px",
    borderRadius: "var(--radius-md)",
    fontSize: "0.9rem",
    background: "rgba(16,185,129,0.1)",
    border: "1px solid rgba(16,185,129,0.25)",
    color: "var(--success)"
  },
  trashNoticeError: {
    background: "rgba(239,68,68,0.1)",
    border: "1px solid rgba(239,68,68,0.3)",
    color: "var(--error)"
  },
  trashLoading: {
    display: "flex",
    justifyContent: "center",
    padding: "64px 0"
  },
  confirmList: {
    margin: "0 0 12px",
    paddingLeft: "20px",
    listStyle: "disc",
    color: "var(--text-primary)"
  },
  actionButtons: {
    display: "flex",
    gap: "12px",
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
    display: "flex",
    color: "var(--text-tertiary)",
    pointerEvents: "none"
  },
  emptyIcon: {
    display: "flex",
    justifyContent: "center",
    color: "var(--text-tertiary)",
    marginBottom: "16px"
  },
  limitNotice: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "12px 16px",
    marginBottom: "24px",
    borderRadius: "var(--radius-md)",
    fontSize: "0.9rem",
    background: "rgba(245,158,11,0.1)",
    border: "1px solid rgba(245,158,11,0.25)",
    color: "var(--warning)"
  },
  emptyState: {
    textAlign: "center",
    padding: "80px 24px",
    background: "rgba(255,255,255,0.02)",
    borderRadius: "24px",
    border: "1px dashed rgba(255,255,255,0.08)"
  }
}
