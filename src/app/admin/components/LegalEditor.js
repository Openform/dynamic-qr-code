"use client"

import {
  useDeferredValue,
  useLayoutEffect,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore
} from "react"
import Link from "next/link"
import LegalDocument from "@/app/components/LegalDocument"
import { MAX_LEGAL_CONTENT_LENGTH, formatLegalDate } from "@/lib/legal"
import {
  toggleWrap,
  toggleLinePrefix,
  insertLink,
  normalizeLinkInput,
  continueList
} from "@/lib/markdownEditing"
import { useScrollSync } from "./useScrollSync"
import styles from "./LegalEditor.module.css"

/** Toolbar buttons, in groups. */
const TOOL_GROUPS = [
  [
    { id: "h2", label: "Heading", hint: "Section heading" },
    { id: "h3", label: "Subheading", hint: "Smaller heading" }
  ],
  [
    { id: "bold", label: "Bold", hint: "Bold (Ctrl/⌘ + B)", className: "toolBold" },
    { id: "italic", label: "Italic", hint: "Italic (Ctrl/⌘ + I)", className: "toolItalic" }
  ],
  [
    { id: "bullet", label: "• List", hint: "Bullet list" },
    { id: "number", label: "1. List", hint: "Numbered list" }
  ],
  [{ id: "link", label: "Link", hint: "Link (Ctrl/⌘ + K)" }]
]

/** Today's date in the admin's own time zone, as "YYYY-MM-DD". */
function todayLocal() {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, "0")
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** "2026-10-29 12:03:52" (UTC) → "29 Oct 2026, 14:03" in the admin's time zone. */
function formatSavedAt(value) {
  if (!value) return ""
  const date = new Date(`${String(value).replace(" ", "T")}Z`)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  })
}

// True once running in the browser, so local times don't mismatch the server render.
const noopSubscribe = () => () => {}
function useInBrowser() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false)
}

function draftFrom(page) {
  return { content: page.content, lastUpdated: page.lastUpdated, dateTouched: false }
}

function isDirty(draft, page) {
  return draft.content !== page.content || draft.lastUpdated !== page.lastUpdated
}

export default function LegalEditor({ initialPages }) {
  const order = initialPages.map((page) => page.slug)
  const [saved, setSaved] = useState(() =>
    Object.fromEntries(initialPages.map((page) => [page.slug, page]))
  )
  const [drafts, setDrafts] = useState(() =>
    Object.fromEntries(initialPages.map((page) => [page.slug, draftFrom(page)]))
  )
  const [activeSlug, setActiveSlug] = useState(order[0])
  const [savingSlug, setSavingSlug] = useState(null)
  const [notice, setNotice] = useState(null)
  const [syncScroll, setSyncScroll] = useState(true)
  const textareaRef = useRef(null)
  const previewRef = useRef(null)
  const pendingSelection = useRef(null)
  const inBrowser = useInBrowser()

  const page = saved[activeSlug]
  const draft = drafts[activeSlug]
  const dirty = isDirty(draft, page)
  const anyDirty = order.some((slug) => isDirty(drafts[slug], saved[slug]))
  const tooLong = draft.content.length > MAX_LEGAL_CONTENT_LENGTH
  const isEmpty = !draft.content.trim()
  const saving = savingSlug !== null
  const canSave = (dirty || page.isDefault) && !tooLong && !isEmpty && Boolean(draft.lastUpdated) && !saving
  const previewContent = useDeferredValue(draft.content)

  useScrollSync(textareaRef, previewRef, { enabled: syncScroll, content: previewContent })

  // Start each page at the top when switching between them.
  useLayoutEffect(() => {
    if (textareaRef.current) textareaRef.current.scrollTop = 0
    if (previewRef.current) previewRef.current.scrollTop = 0
  }, [activeSlug])

  // Warn before closing the tab or reloading with unsaved changes.
  useEffect(() => {
    if (!anyDirty) return
    const warn = (event) => {
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [anyDirty])

  // Restore the selection after a toolbar change that had to go through state.
  useLayoutEffect(() => {
    const selection = pendingSelection.current
    if (!selection || !textareaRef.current) return
    pendingSelection.current = null
    textareaRef.current.setSelectionRange(selection[0], selection[1])
  }, [draft.content])

  /** Update the text. Until the date is changed by hand, it follows the text:
   *  today once the text differs from what's saved, the saved date if not. */
  function setContent(slug, content) {
    setDrafts((previous) => {
      const current = previous[slug]
      const base = saved[slug]
      const lastUpdated = current.dateTouched
        ? current.lastUpdated
        : content === base.content
          ? base.lastUpdated
          : todayLocal()
      return { ...previous, [slug]: { ...current, content, lastUpdated } }
    })
  }

  function setDate(slug, lastUpdated) {
    setDrafts((previous) => ({
      ...previous,
      [slug]: { ...previous[slug], lastUpdated, dateTouched: true }
    }))
  }

  /**
   * Apply a change from lib/markdownEditing. Goes through the browser's own
   * editing so Ctrl/⌘ + Z still undoes it; falls back to setting the text.
   */
  function applyChange(change) {
    const textarea = textareaRef.current
    if (!textarea || !change) return
    const before = textarea.value
    const expected = before.slice(0, change.from) + change.insert + before.slice(change.to)

    textarea.focus()
    textarea.setSelectionRange(change.from, change.to)
    if (expected !== before) {
      try {
        if (change.insert) {
          document.execCommand("insertText", false, change.insert)
        } else {
          document.execCommand("delete", false)
        }
      } catch {
        // Handled below.
      }
    }

    if (textarea.value === expected) {
      textarea.setSelectionRange(change.selectionStart, change.selectionEnd)
    } else {
      pendingSelection.current = [change.selectionStart, change.selectionEnd]
      setContent(activeSlug, expected)
    }
  }

  function runTool(id) {
    const textarea = textareaRef.current
    if (!textarea) return
    const { value, selectionStart: start, selectionEnd: end } = textarea

    if (id === "bold") return applyChange(toggleWrap(value, start, end, "**", "bold text"))
    if (id === "italic") return applyChange(toggleWrap(value, start, end, "*", "italic text"))
    if (id === "link") {
      const selected = value.slice(start, end).trim()
      const answer = window.prompt(
        "Link to: a web address, an email address, or a page on this site (e.g. /terms)",
        normalizeLinkInput(selected) ? selected : ""
      )
      if (answer === null) {
        textarea.focus()
        return
      }
      const href = normalizeLinkInput(answer)
      if (!href) {
        setNotice({
          type: "error",
          text: "That doesn't look like a link. Use a web address (https://…), an email address, or a page like /terms."
        })
        textarea.focus()
        return
      }
      return applyChange(insertLink(value, start, end, href))
    }
    applyChange(toggleLinePrefix(value, start, end, id))
  }

  function handleTextareaKeyDown(event) {
    const mod = event.metaKey || event.ctrlKey
    if (mod && !event.shiftKey && !event.altKey) {
      const tool = { b: "bold", i: "italic", k: "link" }[event.key.toLowerCase()]
      if (tool) {
        event.preventDefault()
        runTool(tool)
      }
      return
    }
    if (event.key === "Enter" && !event.shiftKey && !event.altKey && !event.nativeEvent.isComposing) {
      const { value, selectionStart, selectionEnd } = event.currentTarget
      const change = continueList(value, selectionStart, selectionEnd)
      if (change) {
        event.preventDefault()
        applyChange(change)
      }
    }
  }

  // Ctrl/⌘ + S saves from anywhere in the editor.
  function handleKeyDown(event) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault()
      save()
    }
  }

  async function save() {
    if (!canSave) return
    const slug = activeSlug
    const sent = drafts[slug]
    setSavingSlug(slug)
    setNotice(null)
    try {
      const res = await fetch(`/api/admin/legal/${slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: sent.content, lastUpdated: sent.lastUpdated })
      })
      if (res.status === 401) {
        window.location.href = "/login"
        return
      }
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setNotice({ type: "error", text: data.error || "Couldn't save the page. Please try again." })
        return
      }

      const updated = data.page
      setSaved((previous) => ({ ...previous, [slug]: updated }))
      setDrafts((previous) => {
        const current = previous[slug]
        // Keep anything typed while the save was in progress.
        if (current.content !== sent.content || current.lastUpdated !== sent.lastUpdated) {
          return previous
        }
        return { ...previous, [slug]: draftFrom(updated) }
      })
      setNotice({ type: "success", text: `${updated.title} saved. The changes are live.`, href: updated.path })
    } catch {
      setNotice({ type: "error", text: "Couldn't reach the server. Check your connection and try again." })
    } finally {
      setSavingSlug(null)
    }
  }

  function discard() {
    if (!window.confirm(`Discard your unsaved changes to the ${page.title}?`)) return
    setDrafts((previous) => ({ ...previous, [activeSlug]: draftFrom(page) }))
    setNotice(null)
  }

  function confirmLeave(event) {
    if (anyDirty && !window.confirm("You have unsaved changes. Leave without saving them?")) {
      event.preventDefault()
    }
  }

  const savedAt = inBrowser ? formatSavedAt(page.updatedAt) : ""
  const dateFollowsText = !draft.dateTouched && draft.lastUpdated !== page.lastUpdated

  return (
    // Not .page-wrapper: its overflow: hidden would stop the header and
    // toolbar from sticking.
    <div className={styles.page} onKeyDown={handleKeyDown}>
      {/* ---- Header ---- */}
      <header className={styles.header}>
        <div className={`container ${styles.headerInner}`}>
          <div className={styles.headerGroup}>
            <Link href="/admin" onClick={confirmLeave}>
              <span className={`gradient-text ${styles.logo}`}>QR Go</span>
            </Link>
            <span className={`badge badge-purple ${styles.adminBadge}`}>Admin</span>
          </div>
          <Link href="/admin" className="btn btn-ghost btn-sm" onClick={confirmLeave}>
            ← Back to Accounts
          </Link>
        </div>
      </header>

      <main className={`container ${styles.main}`}>
        <h1 className={styles.pageTitle}>Legal pages</h1>
        <p className={styles.pageSubtitle}>
          Edit the Privacy Policy and Terms &amp; Conditions shown on the website.
          Use the toolbar to format the text, and check the preview before you
          save. Changes go live as soon as you save.
        </p>

        {notice && (
          <div
            role="status"
            className={`${styles.notice} ${notice.type === "error" ? styles.noticeError : styles.noticeSuccess}`}
          >
            <span aria-hidden="true">{notice.type === "error" ? "⚠" : "✓"}</span>
            <span className={styles.noticeText}>{notice.text}</span>
            {notice.href && (
              <a href={notice.href} target="_blank" rel="noopener noreferrer" className={styles.noticeLink}>
                View page ↗
              </a>
            )}
            <button
              type="button"
              onClick={() => setNotice(null)}
              aria-label="Dismiss"
              className={styles.noticeClose}
            >
              ✕
            </button>
          </div>
        )}

        {/* ---- Page picker and status ---- */}
        <div className={styles.tabsRow}>
          <div className={`qr-tabs ${styles.tabs}`} role="tablist" aria-label="Legal pages">
            {order.map((slug) => (
              <button
                key={slug}
                type="button"
                role="tab"
                aria-selected={slug === activeSlug}
                className={`qr-tab ${slug === activeSlug ? "qr-tab-active" : ""}`}
                onClick={() => setActiveSlug(slug)}
              >
                {saved[slug].title}
                {isDirty(drafts[slug], saved[slug]) && (
                  <span className={styles.dirtyDot} title="Unsaved changes" aria-label="(unsaved changes)" />
                )}
              </button>
            ))}
          </div>
          <div className={styles.status}>
            {page.isDefault ? (
              <span>Not saved yet. The site is showing this placeholder text.</span>
            ) : (
              <span>
                Last saved{savedAt && ` ${savedAt}`}
                {page.updatedByName && ` by ${page.updatedByName}`}
              </span>
            )}
            <a href={page.path} target="_blank" rel="noopener noreferrer" className={styles.viewLink}>
              View live page ↗
            </a>
          </div>
        </div>

        {/* ---- Editor and preview ---- */}
        <div className={styles.workspace}>
          <section className={`glass-card-static ${styles.panel}`} aria-label="Editor">
            <div className={`${styles.panelHeader} ${styles.toolbarHeader}`}>
              <div className={styles.toolbar} role="toolbar" aria-label="Formatting">
                {TOOL_GROUPS.map((group, index) => (
                  <div key={index} className={styles.toolGroup}>
                    {group.map((tool) => (
                      <button
                        key={tool.id}
                        type="button"
                        title={tool.hint}
                        className={`${styles.toolButton} ${tool.className ? styles[tool.className] : ""}`}
                        // Keep the text box's selection while clicking.
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => runTool(tool.id)}
                      >
                        {tool.label}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>
            <textarea
              ref={textareaRef}
              className={styles.textarea}
              value={draft.content}
              onChange={(event) => setContent(activeSlug, event.target.value)}
              onKeyDown={handleTextareaKeyDown}
              spellCheck
              aria-label={`${page.title} text`}
            />
            {(tooLong || isEmpty) && (
              <p className={styles.fieldError} role="alert">
                {isEmpty
                  ? "The page text can't be empty."
                  : `This is ${draft.content.length.toLocaleString("en-ZA")} characters; the limit is ${MAX_LEGAL_CONTENT_LENGTH.toLocaleString("en-ZA")}.`}
              </p>
            )}
          </section>

          <section className={`glass-card-static ${styles.panel}`} aria-label="Preview">
            <div className={styles.panelHeader}>
              <span className={styles.panelLabel}>Preview</span>
              <label
                className={`qr-toggle ${styles.syncToggle}`}
                title="Scroll the editor and preview together, so both show the same part of the page"
              >
                <input
                  type="checkbox"
                  checked={syncScroll}
                  onChange={(event) => setSyncScroll(event.target.checked)}
                />
                Scroll together
              </label>
            </div>
            {/* Links are shown but don't navigate away from unsaved work. */}
            <div
              ref={previewRef}
              className={styles.preview}
              onClickCapture={(event) => {
                if (event.target.closest("a")) event.preventDefault()
              }}
            >
              <LegalDocument
                title={page.title}
                lastUpdated={draft.lastUpdated}
                content={previewContent}
                preview
              />
            </div>
          </section>
        </div>

        {/* ---- Date and save ---- */}
        <div className={styles.actions}>
          <div className={styles.dateField}>
            <label htmlFor="legal-last-updated" className="input-label">
              &ldquo;Last updated&rdquo; date shown on the page
            </label>
            <input
              id="legal-last-updated"
              type="date"
              className={`input-field ${styles.dateInput}`}
              value={draft.lastUpdated}
              onChange={(event) => setDate(activeSlug, event.target.value)}
              required
            />
            {dateFollowsText && (
              <p className={styles.dateHint}>
                Set to today because you changed the text. For small fixes like typos you can{" "}
                <button
                  type="button"
                  className={styles.inlineButton}
                  onClick={() => setDate(activeSlug, page.lastUpdated)}
                >
                  keep {formatLegalDate(page.lastUpdated)}
                </button>
                .
              </p>
            )}
          </div>
          <div className={styles.actionButtons}>
            {dirty && (
              <button type="button" className="btn btn-secondary" onClick={discard} disabled={saving}>
                Discard changes
              </button>
            )}
            <button type="button" className="btn btn-primary" onClick={save} disabled={!canSave}>
              {savingSlug === activeSlug ? "Saving…" : `Save ${page.title}`}
            </button>
          </div>
        </div>

        {/* ---- Help ---- */}
        <details className={`glass-card-static ${styles.guide}`}>
          <summary className={styles.guideSummary}>Formatting guide</summary>
          <div className={styles.guideBody}>
            <table className={styles.guideTable}>
              <thead>
                <tr>
                  <th scope="col">Type this</th>
                  <th scope="col">To get</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><code>## 1. Section title</code></td>
                  <td>A section heading</td>
                </tr>
                <tr>
                  <td><code>### Smaller title</code></td>
                  <td>A subheading</td>
                </tr>
                <tr>
                  <td><code>**important words**</code></td>
                  <td><strong>Bold text</strong></td>
                </tr>
                <tr>
                  <td><code>*a phrase*</code></td>
                  <td><em>Italic text</em></td>
                </tr>
                <tr>
                  <td><code>- An item</code></td>
                  <td>A bullet point</td>
                </tr>
                <tr>
                  <td><code>1. An item</code></td>
                  <td>A numbered item</td>
                </tr>
                <tr>
                  <td><code>[our Terms](/terms)</code></td>
                  <td>A link. Works with web addresses, <code>mailto:</code> emails and pages on this site</td>
                </tr>
                <tr>
                  <td>An empty line</td>
                  <td>Starts a new paragraph</td>
                </tr>
              </tbody>
            </table>
            <ul className={styles.guideTips}>
              <li>Select text and click a toolbar button to format it. Click it again to remove the formatting.</li>
              <li>In a list, press Enter to add the next item. Press Enter on an empty item to end the list.</li>
              <li>Text pasted from Word or a website keeps its words but not its formatting.</li>
              <li>Shortcuts: Ctrl/⌘ + B bold, Ctrl/⌘ + I italic, Ctrl/⌘ + K link, Ctrl/⌘ + S save, Ctrl/⌘ + Z undo.</li>
            </ul>
          </div>
        </details>
      </main>
    </div>
  )
}
