"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import CampaignPage from "@/app/components/campaign/CampaignPage"
import { EyeIcon, LayersIcon, PaletteIcon, SettingsIcon } from "@/app/components/icons"
import { campaignFontClasses } from "@/app/components/campaign/fonts"
import { AFTER_END, PAGE_LIMITS, THEMES, pageView, parsePageInput } from "@/lib/campaignPages"
import { pageLook } from "@/lib/pageTheme"
import { ADDABLE_BLOCKS, allButtons, editorTabFor, examplesLeft, isoToLocalInput, localInputToIso, move, newBlock, pageStatus } from "@/lib/pageEditing"
import { imagesFor, ownerFilePath, pagePreviewPath } from "@/lib/pageReference"
import { prepareImage } from "@/lib/imageResize"
import { formatChangeTime } from "../../components/scheduledChanges"
import PagesHeader from "../PagesHeader"
import BlockEditor from "./BlockEditor"
import { TextField } from "./fields"
import TypeFields from "./TypeFields"
import styles from "../pages.module.css"

const BRAND_SWATCHES = [
  { hex: "#1F6F4A", name: "Green" },
  { hex: "#2B59C3", name: "Blue" },
  { hex: "#7C3AED", name: "Purple" },
  { hex: "#8A3B1F", name: "Terracotta" },
  { hex: "#F4B860", name: "Amber" },
  { hex: "#111418", name: "Black" }
]

const TABS = [
  { id: "content", label: "Content", Icon: LayersIcon },
  { id: "design", label: "Design", Icon: PaletteIcon },
  { id: "settings", label: "Settings", Icon: SettingsIcon }
]
const PREVIEW_TAB = { id: "preview", label: "Preview", Icon: EyeIcon }

// Narrower than this, the preview doesn't fit beside the form, so it gets a
// tab of its own (the same width as in pages.module.css).
const NARROW = "(max-width: 960px)"

function watchNarrow(callback) {
  const query = window.matchMedia(NARROW)
  query.addEventListener("change", callback)
  return () => query.removeEventListener("change", callback)
}

/** Whether the screen is too narrow for the preview beside the form. */
function useNarrow() {
  return useSyncExternalStore(
    watchNarrow,
    () => window.matchMedia(NARROW).matches,
    () => false
  )
}

/** What the editor's form holds for a page from the API. */
function draftFrom(page) {
  return {
    name: page.name,
    endsAt: isoToLocalInput(page.endsAt),
    afterEnd: page.afterEnd,
    keptButton: page.keptButton ?? "",
    content: page.content
  }
}

/** The request body the form saves as (a kept button that's gone is dropped). */
function requestFrom(draft) {
  const keptButton = allButtons(draft.content).some((b) => b.id === draft.keptButton) ? draft.keptButton : null
  return {
    name: draft.name,
    content: draft.content,
    endsAt: localInputToIso(draft.endsAt),
    afterEnd: draft.afterEnd,
    keptButton: draft.afterEnd === "ended" ? keptButton : null
  }
}

async function fetchPage(pageId) {
  const res = await fetch(`/api/pages/${pageId}`)
  if (res.status === 401) return { signedOut: true }
  const body = await res.json().catch(() => ({}))
  if (res.status === 404) return { error: "This page doesn’t exist, or it isn’t yours." }
  return res.ok ? { data: body } : { error: body.error || "The page couldn’t be loaded." }
}

/**
 * The campaign page editor, at /dashboard/pages/[id]: tabs for the page's
 * blocks (Content), its look (Design) and its settings on the left, and a
 * live preview on the right drawn by the same component visitors get. On a
 * narrow screen the preview is a fourth tab instead. The bar with Save stays
 * at the top while scrolling. Saving checks the page with the same rules as
 * the server (parsePageInput in lib/campaignPages.js) and publishes it
 * straight away; a problem opens the tab, and the block, it's in.
 */
export default function PageEditor({ pageId }) {
  const router = useRouter()
  const [saved, setSaved] = useState(null) // the page as last loaded or saved
  const [draft, setDraft] = useState(null)
  const [usedBy, setUsedBy] = useState([])
  const [images, setImages] = useState([]) // the page's uploaded images, with the owner's address
  const [canEdit, setCanEdit] = useState(false)
  const [loadError, setLoadError] = useState("")
  const [problem, setProblem] = useState(null) // { path, error, draft } from the checks, and the draft they were for
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [openId, setOpenId] = useState("header")
  const [previewEnded, setPreviewEnded] = useState(false)
  const [tab, setTab] = useState("content")
  const [previewOpen, setPreviewOpen] = useState(false) // the Preview tab, on a narrow screen
  const narrow = useNarrow()
  const view = narrow && previewOpen ? "preview" : tab
  const scrolls = useRef({}) // where each tab was scrolled to, to go back there

  const apply = useCallback(
    (result) => {
      if (result.signedOut) {
        router.push("/login")
        return
      }
      if (result.error) {
        setLoadError(result.error)
        return
      }
      setSaved(result.data.page)
      setDraft(draftFrom(result.data.page))
      setUsedBy(result.data.usedBy ?? [])
      setImages(result.data.images ?? [])
      setCanEdit(Boolean(result.data.canEdit))
    },
    [router]
  )

  useEffect(() => {
    let active = true
    fetchPage(pageId).then((result) => {
      if (active) apply(result)
    })
    return () => {
      active = false
    }
  }, [pageId, apply])

  const dirty = Boolean(saved && draft) && JSON.stringify(requestFrom(draft)) !== JSON.stringify(requestFrom(draftFrom(saved)))

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return undefined
    const warn = (e) => {
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])

  // Back to where this tab was scrolled to (the top, the first time).
  useLayoutEffect(() => {
    window.scrollTo({ top: scrolls.current[view] ?? 0, behavior: "instant" })
  }, [view])

  // Bring a problem from saving into view: its field, or else the message.
  useEffect(() => {
    if (!problem) return
    const target =
      [...document.querySelectorAll(`.${styles.fieldError}`)].find((el) => el.textContent === problem.error) ??
      document.getElementById("save-problem")
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    target?.scrollIntoView({ block: "center", behavior: still ? "auto" : "smooth" })
  }, [problem])

  if (loadError) {
    return (
      <div className={styles.wrapper}>
        <PagesHeader current="pages" />
        <main className={`container ${styles.main}`}>
          <p className={styles.errorBox}>{loadError}</p>
          <p style={{ marginTop: 16 }}>
            <Link href="/dashboard/pages" className="btn btn-secondary btn-sm">
              Back to pages
            </Link>
          </p>
        </main>
      </div>
    )
  }

  if (!draft) {
    return (
      <div className={styles.wrapper}>
        <PagesHeader current="pages" />
        <main className={`container ${styles.main}`}>
          <p className={styles.subtitle}>Loading…</p>
        </main>
      </div>
    )
  }

  const { content } = draft
  const blocks = content.blocks
  const status = pageStatus(saved)
  const problemBlock = problem?.path?.match(/^blocks\.(\d+)/)?.[1]
  const errorFor = (path) => (problem?.path === path ? problem.error : null)
  const examples = examplesLeft(content)
  const buttons = allButtons(content)
  const imageMap = imagesFor(images, (image) => image.src)

  // Resize a photo in the browser, upload it, and give back its id.
  async function uploadImage(file, maxSide) {
    const { blob } = await prepareImage(file, { maxSide })
    const form = new FormData()
    form.append("file", blob, blob.type === "image/webp" ? "photo.webp" : "photo.jpg")
    const res = await fetch(`/api/pages/${pageId}/images`, { method: "POST", body: form })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || "That photo couldn’t be uploaded.")
    setImages((list) => [...list, data.image])
    return data.image.id
  }

  const change = (key, value) => {
    setDraft((d) => ({ ...d, [key]: value }))
    setJustSaved(false)
  }
  const changeContent = (next) => change("content", { ...content, ...next })
  const setBlocks = (next) => changeContent({ blocks: next })

  function addBlock(type) {
    const block = newBlock(content, type)
    setBlocks([...blocks, block])
    setOpenId(block.id)
  }

  function removeBlock(index) {
    const block = blocks[index]
    if (!confirm(`Delete this ${block.type} block?`)) return
    setBlocks(blocks.filter((_, i) => i !== index))
  }

  async function save() {
    const body = requestFrom(draft)
    const checked = parsePageInput(body, { imageIds: new Set(images.map((image) => image.id)) })
    if (!checked.ok) {
      showProblem(checked)
      return
    }
    setSaving(true)
    setProblem(null)
    try {
      const res = await fetch(`/api/pages/${pageId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        showProblem({ path: data.path ?? null, error: data.error || "The page couldn’t be saved. Please try again." })
        return
      }
      setSaved(data.page)
      setDraft(draftFrom(data.page))
      setImages(data.images ?? images)
      setJustSaved(true)
    } finally {
      setSaving(false)
    }
  }

  function showProblem(checked) {
    setProblem({ path: checked.path, error: checked.error, draft })
    setJustSaved(false)
    const where = editorTabFor(checked.path)
    if (where) show(where)
    const index = checked.path?.match(/^blocks\.(\d+)/)?.[1]
    if (index !== undefined && blocks[Number(index)]) setOpenId(blocks[Number(index)].id)
  }

  // Switch tabs (or open the Preview tab), remembering where this one was scrolled to.
  function show(next) {
    if (next === view) return
    scrolls.current[view] = window.scrollY
    if (next === "preview") {
      setPreviewOpen(true)
    } else {
      setTab(next)
      setPreviewOpen(false)
    }
  }

  const tabs = narrow ? [...TABS, PREVIEW_TAB] : TABS

  // Arrow keys, Home and End move between the tabs.
  function onTabKey(e) {
    const ids = tabs.map((t) => t.id)
    const at = { ArrowRight: ids.indexOf(view) + 1, ArrowLeft: ids.indexOf(view) - 1, Home: 0, End: ids.length - 1 }[e.key]
    if (at === undefined) return
    e.preventDefault()
    const next = ids[(at + ids.length) % ids.length]
    show(next)
    document.getElementById(`tab-${next}`)?.focus()
  }

  async function setPublished(published) {
    setBusy(true)
    try {
      const res = await fetch(`/api/pages/${pageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ published })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "That didn’t work.")
      setSaved((s) => ({ ...s, published: data.page.published }))
    } catch (err) {
      alert(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    const warning =
      usedBy.length > 0
        ? `\n\n${new Set(usedBy.map((u) => u.codeId)).size} of your codes send scans to this page. They’ll show “not found” until you change where they go.`
        : ""
    if (!confirm(`Delete “${saved.name}”? This can’t be undone.${warning}`)) return
    setBusy(true)
    const res = await fetch(`/api/pages/${pageId}`, { method: "DELETE" })
    if (res.ok) {
      router.push("/dashboard/pages")
    } else {
      setBusy(false)
      alert((await res.json().catch(() => ({}))).error || "The page couldn’t be deleted.")
    }
  }

  // The preview: the live page, or what it shows once the end date passes.
  const showEnded = previewEnded && Boolean(draft.endsAt)
  const previewPage = { ...requestFrom(draft), endsAt: showEnded ? "1970-01-01T00:00:00Z" : null }
  if (showEnded) previewPage.afterEnd = "ended"

  const saveNote = saving
    ? { text: "Saving…" }
    : problem?.draft === draft
      ? { text: "Not saved: there’s a problem to fix", tone: styles.noteProblem }
      : dirty
        ? { text: "Unsaved changes", tone: styles.noteDirty }
        : justSaved
          ? { text: "Saved. Scanners see the new version now.", tone: styles.noteSaved }
          : { text: "Changes go live when you save" }

  return (
    <div className={styles.wrapper}>
      <PagesHeader current="pages" sticky={false} />

      <div className={styles.top}>
        <div className={`container ${styles.bar}`}>
          <Link href="/dashboard/pages" className={`btn btn-ghost btn-sm ${styles.back}`} aria-label="Back to pages">
            <span aria-hidden="true">←</span>
            <span className={styles.backText}>Pages</span>
          </Link>
          <div className={styles.barName}>
            <div className={styles.barTitle}>
              <h1>{saved.name}</h1>
              <span className={`${styles.status} ${styles[`status-${status.id}`]}`}>{status.label}</span>
            </div>
            <span className={`${styles.barNote}${saveNote.tone ? ` ${saveNote.tone}` : ""}`} role="status">
              {saveNote.text}
            </span>
          </div>
          <a href={pagePreviewPath(pageId)} target="_blank" rel="noopener noreferrer" className={`btn btn-ghost btn-sm ${styles.openPreview}`}>
            Open preview
          </a>
          <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={!canEdit || !dirty || saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
        <div className={`container ${styles.tabs}`} role="tablist" aria-label="Edit the page" onKeyDown={onTabKey}>
          {tabs.map(({ id, label, Icon }) => {
            const on = view === id
            return (
              <button
                key={id}
                id={`tab-${id}`}
                type="button"
                role="tab"
                aria-selected={on}
                aria-controls={on ? `panel-${id}` : undefined}
                tabIndex={on ? 0 : -1}
                className={`${styles.tab}${on ? ` ${styles.tabOn}` : ""}${id === "preview" ? ` ${styles.tabPreview}` : ""}`}
                onClick={() => show(id)}
              >
                <Icon size={16} />
                {label}
              </button>
            )
          })}
        </div>
      </div>

      <main className={`container ${styles.layout}`}>
        {view !== "preview" && (
          <div className={styles.editorColumn}>
            {!canEdit && (
              <p className={styles.notice}>
                Campaign pages are available on the Business package and up, so this page can’t be edited. It keeps showing,
                and you can still switch it off or delete it.
              </p>
            )}
            {saved.takenDown && (
              <p className={styles.errorBox}>QR Go has taken this page down, so scanners can’t see it. Contact us if you think that’s a mistake.</p>
            )}
            {problem && (
              <p id="save-problem" className={styles.errorBox} role="alert">
                {problem.error}
              </p>
            )}

            <div id={`panel-${view}`} role="tabpanel" aria-labelledby={`tab-${view}`} className={styles.panel}>
              {view === "content" && (
                <>
                  {examples.length > 0 && (
                    <div className={styles.notice}>
                      Before you share the page, put in your own details. These still have the template’s examples, or words in
                      [square brackets]:{" "}
                      {examples.map((example, i) => (
                        <span key={`${example.blockId}-${i}`}>
                          {i > 0 && ", "}
                          <button type="button" className={styles.textButton} onClick={() => setOpenId(example.blockId)}>
                            {example.label}
                          </button>
                        </span>
                      ))}
                      .
                    </div>
                  )}
                  <fieldset disabled={!canEdit} className={styles.fieldset}>
                    <section className={`glass-card-static ${styles.card}`} aria-labelledby="blocks-card-title">
                      <h2 id="blocks-card-title" className={styles.cardTitle}>
                        Blocks
                      </h2>
                      <p className={styles.hint} style={{ marginTop: -8 }}>
                        Top to bottom, as they appear on the page.
                      </p>
                      <ul className={styles.list}>
                        {blocks.map((block, index) => (
                          <BlockEditor
                            key={block.id}
                            block={block}
                            path={`blocks.${index}`}
                            content={content}
                            open={openId === block.id}
                            hasError={problemBlock === String(index)}
                            canMoveUp={index > 1}
                            canMoveDown={index > 0 && index < blocks.length - 1}
                            onToggle={() => setOpenId(openId === block.id ? null : block.id)}
                            onChange={(next) => setBlocks(blocks.map((b, i) => (i === index ? next : b)))}
                            onMove={(step) => setBlocks(move(blocks, index, step))}
                            onRemove={() => removeBlock(index)}
                            errorFor={errorFor}
                            images={imageMap}
                            onUpload={uploadImage}
                          />
                        ))}
                      </ul>
                      {blocks.length < PAGE_LIMITS.blocks ? (
                        <div className={styles.addRow}>
                          <span className={styles.addLabel}>Add a block</span>
                          {ADDABLE_BLOCKS.map(({ type, label }) => (
                            <button key={type} type="button" className="btn btn-secondary btn-sm" onClick={() => addBlock(type)}>
                              + {label}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className={styles.hint}>A page can have up to {PAGE_LIMITS.blocks} blocks.</p>
                      )}
                    </section>
                  </fieldset>
                </>
              )}

              {view === "design" && (
                <fieldset disabled={!canEdit} className={styles.fieldset}>
                  <section className={`glass-card-static ${styles.card}`} aria-labelledby="colour-card-title">
                    <h2 id="colour-card-title" className={styles.cardTitle}>
                      Theme and colour
                    </h2>
                    <div>
                      <span className={styles.fieldLabel}>Theme</span>
                      <div className={styles.themes}>
                        {THEMES.map((theme) => {
                          const { colors } = pageLook({ theme: theme.id, brand: content.brand })
                          const on = content.theme === theme.id
                          return (
                            <button key={theme.id} type="button" className={`${styles.theme}${on ? ` ${styles.themeOn}` : ""}`} aria-pressed={on} onClick={() => changeContent({ theme: theme.id })}>
                              <span className={styles.mini} style={{ background: colors.bg }} aria-hidden="true">
                                <span className={styles.miniCover} style={{ background: colors.cover }} />
                                <span className={styles.miniBody}>
                                  <span className={styles.miniLine} style={{ background: colors.text }} />
                                  <span className={styles.miniButton} style={{ background: colors.btnBg }} />
                                  <span className={styles.miniButton} style={{ border: colors.btn2Border }} />
                                </span>
                              </span>
                              <span className={styles.themeName}>{theme.name}</span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                    <div className={styles.field}>
                      <span id="brand-label" className={styles.fieldLabel}>
                        Brand colour
                      </span>
                      <div className={styles.colorRow} role="group" aria-labelledby="brand-label">
                        {BRAND_SWATCHES.map((swatch) => (
                          <button
                            key={swatch.hex}
                            type="button"
                            className={`${styles.swatch}${content.brand === swatch.hex ? ` ${styles.swatchOn}` : ""}`}
                            aria-label={swatch.name}
                            aria-pressed={content.brand === swatch.hex}
                            onClick={() => changeContent({ brand: swatch.hex })}
                          >
                            <span style={{ background: swatch.hex }} />
                          </button>
                        ))}
                        <input type="color" className={styles.colorInput} aria-label="Pick any colour" value={content.brand.toLowerCase()} onChange={(e) => changeContent({ brand: e.target.value.toUpperCase() })} />
                        <BrandHexInput value={content.brand} onChange={(brand) => changeContent({ brand })} />
                      </div>
                      <p className={styles.hint}>Text on buttons switches between light and dark by itself, so it always stays readable.</p>
                    </div>
                  </section>
                  <section className={`glass-card-static ${styles.card}`} aria-labelledby="type-card-title">
                    <h2 id="type-card-title" className={styles.cardTitle}>
                      Fonts and sizes
                    </h2>
                    <TypeFields content={content} onChange={changeContent} />
                  </section>
                </fieldset>
              )}

              {view === "settings" && (
                <>
                  <fieldset disabled={!canEdit} className={styles.fieldset}>
                    <section className={`glass-card-static ${styles.card}`} aria-labelledby="page-card-title">
                      <h2 id="page-card-title" className={styles.cardTitle}>
                        Page
                      </h2>
                      <TextField id="page-name" label="Name (only you see this)" value={draft.name} onChange={(v) => change("name", v)} max={PAGE_LIMITS.name} error={errorFor("name")} />
                      <div className={styles.fieldRow}>
                        <div className={styles.field}>
                          <label htmlFor="page-ends" className={styles.fieldLabel}>
                            Campaign ends (optional)
                          </label>
                          <input
                            id="page-ends"
                            type="datetime-local"
                            className={`input-field${errorFor("endsAt") ? " input-error" : ""}`}
                            value={draft.endsAt}
                            onChange={(e) => change("endsAt", e.target.value)}
                          />
                          {errorFor("endsAt") ? <p className={styles.fieldError}>{errorFor("endsAt")}</p> : <p className={styles.hint}>In your time zone. Leave it empty for no end.</p>}
                        </div>
                        <div className={styles.field}>
                          <label htmlFor="page-after" className={styles.fieldLabel}>
                            After it ends
                          </label>
                          <select id="page-after" className="input-field" value={draft.afterEnd} onChange={(e) => change("afterEnd", e.target.value)} disabled={!draft.endsAt}>
                            {AFTER_END.map((id) => (
                              <option key={id} value={id}>
                                {id === "ended" ? "Show “This campaign has ended”" : "Keep showing the page"}
                              </option>
                            ))}
                          </select>
                          {errorFor("afterEnd") && <p className={styles.fieldError}>{errorFor("afterEnd")}</p>}
                        </div>
                      </div>
                      {draft.endsAt && draft.afterEnd === "ended" && (
                        <div className={styles.field}>
                          <label htmlFor="page-kept" className={styles.fieldLabel}>
                            Button to keep after it ends
                          </label>
                          <select id="page-kept" className="input-field" value={draft.keptButton} onChange={(e) => change("keptButton", e.target.value)}>
                            <option value="">No button</option>
                            {buttons.map((button) => (
                              <option key={button.id} value={button.id}>
                                {button.label || "Unnamed button"}
                              </option>
                            ))}
                          </select>
                          {errorFor("keptButton") && <p className={styles.fieldError}>{errorFor("keptButton")}</p>}
                        </div>
                      )}
                    </section>
                  </fieldset>

                  <section className={`glass-card-static ${styles.card}`} aria-labelledby="used-card-title">
                    <h2 id="used-card-title" className={styles.cardTitle}>
                      Codes that send scans here
                    </h2>
                    {usedBy.length > 0 ? (
                      <div className={styles.chips}>
                        {usedBy.map((use, i) => (
                          <span key={i} className={styles.chip}>
                            <strong>{use.title}</strong>
                            {use.via === "main" ? " · now" : use.via === "change" ? ` · from ${formatChangeTime(use.startsAt)}` : ` · schedule “${use.label}”`}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className={styles.hint} style={{ marginTop: 0 }}>
                        None yet. To use this page, edit a code and choose Campaign page as its destination, or add a schedule that
                        sends scans here.
                      </p>
                    )}
                  </section>

                  <section className={`glass-card-static ${styles.card}`} aria-labelledby="status-card-title">
                    <h2 id="status-card-title" className={styles.cardTitle}>
                      Online or off
                    </h2>
                    <p className={styles.hint} style={{ marginTop: -8 }}>
                      {saved.published
                        ? "Scanners can see this page. Switch it off to take it offline without deleting it."
                        : "This page is switched off, so codes that send scans here show “not found”."}
                    </p>
                    <div className={styles.rowActions}>
                      {!saved.takenDown && (
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPublished(!saved.published)} disabled={busy}>
                          {saved.published ? "Switch off" : "Switch on"}
                        </button>
                      )}
                      <button type="button" className="btn btn-danger btn-sm" onClick={remove} disabled={busy}>
                        Delete page
                      </button>
                    </div>
                  </section>
                </>
              )}
            </div>
          </div>
        )}

        {(!narrow || view === "preview") && (
          <aside
            className={styles.previewColumn}
            {...(view === "preview" ? { id: "panel-preview", role: "tabpanel", "aria-labelledby": "tab-preview" } : { "aria-label": "Preview" })}
          >
            {draft.endsAt && (
              <div className={styles.previewSwitch} role="group" aria-label="What the preview shows">
                <button type="button" className={showEnded ? undefined : styles.switchOn} aria-pressed={!showEnded} onClick={() => setPreviewEnded(false)}>
                  Live
                </button>
                <button type="button" className={showEnded ? styles.switchOn : undefined} aria-pressed={showEnded} onClick={() => setPreviewEnded(true)}>
                  After it ends
                </button>
              </div>
            )}
            <div className={styles.phone}>
              <div className={styles.screen}>
                <CampaignPage
                  content={content}
                  view={pageView(previewPage)}
                  images={imageMap}
                  fileHref={(buttonId, type) => ownerFilePath(pageId, buttonId, type)}
                  className={campaignFontClasses}
                />
              </div>
            </div>
            <p className={styles.previewNote}>
              The preview is drawn by the same code as the real page, including what you haven’t saved yet. Calendar and contact
              buttons download what you last saved.
            </p>
          </aside>
        )}
      </main>
    </div>
  )
}

/** The brand colour as a hex code, applied once it's a whole #RRGGBB. */
function BrandHexInput({ value, onChange }) {
  const [text, setText] = useState(value)
  const [last, setLast] = useState(value)
  // Follow changes made elsewhere (a swatch or the colour picker).
  if (value !== last) {
    setLast(value)
    setText(value)
  }
  return (
    <input
      type="text"
      className={`input-field ${styles.hexInput}`}
      aria-label="Brand colour as a hex code"
      value={text}
      maxLength={7}
      onChange={(e) => {
        const next = e.target.value.trim()
        setText(next)
        if (/^#[0-9A-Fa-f]{6}$/.test(next)) onChange(next.toUpperCase())
      }}
      onBlur={() => setText(value)}
    />
  )
}
