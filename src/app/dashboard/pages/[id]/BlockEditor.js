"use client"

import { useEffect, useId, useRef, useState } from "react"
import { ArrowDownIcon, ArrowUpIcon, ChevronDownIcon, EyeIcon, EyeOffIcon, MoreIcon, PlusIcon, TrashIcon } from "@/app/components/icons"
import { BUTTON_KINDS, DETAIL_ICONS, PAGE_LIMITS } from "@/lib/campaignPages"
import { BLOCK_LABELS, BUTTON_DEFAULT_LABELS, BUTTON_FIELDS, isoToLocalInput, localInputToIso, move, newButton } from "@/lib/pageEditing"
import { LOGO_MAX_SIDE, PHOTO_MAX_SIDE } from "@/lib/imageResize"
import { dayHoursText } from "@/lib/openingHours"
import { IconButton, ImageField, SubItemHead, TextField } from "./fields"
import { BlockIcon } from "./blockIcons"
import HoursFields from "./HoursFields"
import { FaqFields, GalleryFields, PricesFields } from "./ListBlockFields"
import styles from "../pages.module.css"

/**
 * One block in the page editor: a row with its icon, name and summary,
 * arrows to move it, hide and delete buttons (in a "⋯" menu on a phone), and
 * when it's open, its fields and a way to add a block below it.
 *
 * `errorFor(path)` gives the message for a field from the page checks
 * (lib/campaignPages.js), whose paths look like "blocks.3.items.0.label";
 * `path` is this block's own ("blocks.3").
 */
export default function BlockEditor({
  block,
  path,
  content,
  open,
  hasError,
  canMoveUp,
  canMoveDown,
  onToggle,
  onChange,
  onMove,
  onRemove,
  onAddBelow,
  errorFor,
  images,
  onUpload
}) {
  const isHeader = block.type === "header"
  const label = BLOCK_LABELS[block.type] ?? block.type
  const set = (key) => (value) => onChange({ ...block, [key]: value })
  const bodyId = `${block.id}-fields`

  const actions = isHeader
    ? []
    : [
        // `label` is for the menu; `name` is for the icon on its own.
        { label: "Move up", name: `Move ${label} up`, Icon: ArrowUpIcon, onClick: () => onMove(-1), disabled: !canMoveUp },
        { label: "Move down", name: `Move ${label} down`, Icon: ArrowDownIcon, onClick: () => onMove(1), disabled: !canMoveDown },
        block.hidden
          ? { label: "Show on the page", name: `Show ${label}`, Icon: EyeOffIcon, onClick: () => onChange({ ...block, hidden: false }) }
          : { label: "Hide from the page", name: `Hide ${label}`, Icon: EyeIcon, onClick: () => onChange({ ...block, hidden: true }) },
        { label: "Delete", name: `Delete ${label}`, Icon: TrashIcon, onClick: onRemove, danger: true }
      ]

  return (
    <li id={`block-${block.id}`} className={`${styles.block}${open ? ` ${styles.blockOpen}` : ""}${hasError ? ` ${styles.blockError}` : ""}`}>
      <div className={styles.blockHead}>
        <button type="button" className={styles.blockToggle} onClick={onToggle} aria-expanded={open} aria-controls={bodyId}>
          <span className={styles.blockIcon} aria-hidden="true">
            <BlockIcon type={block.type} size={18} />
          </span>
          <span className={styles.blockText}>
            <span className={styles.blockType}>
              {label}
              {block.hidden && <span className={styles.hiddenTag}>Hidden</span>}
            </span>
            <span className={styles.blockSummary}>{summaryOf(block) || "Not filled in yet"}</span>
          </span>
        </button>
        {actions.length > 0 && (
          <>
            <div className={styles.blockTools}>
              {actions.map((action) => (
                <IconButton key={action.label} label={action.name} onClick={action.onClick} disabled={action.disabled}>
                  <action.Icon size={17} />
                </IconButton>
              ))}
            </div>
            <BlockMenu label={label} actions={actions} />
          </>
        )}
        <IconButton label={open ? `Close ${label}` : `Edit ${label}`} onClick={onToggle}>
          <ChevronDownIcon size={18} style={{ transform: open ? "rotate(180deg)" : undefined }} />
        </IconButton>
      </div>

      {open && (
        <div id={bodyId} className={styles.blockBody}>
          {errorFor(path) && <p className={styles.fieldError}>{errorFor(path)}</p>}
          <Fields block={block} path={path} content={content} set={set} onChange={onChange} errorFor={errorFor} images={images} onUpload={onUpload} />
          {onAddBelow && (
            <div className={styles.blockFoot}>
              <button type="button" className={styles.textButton} onClick={onAddBelow}>
                <PlusIcon size={16} />
                Add a block below this one
              </button>
            </div>
          )}
        </div>
      )}
    </li>
  )
}

/**
 * The block's actions behind a "⋯" button, for screens too narrow for a
 * row of icons (pages.module.css shows one or the other). A disclosure: the
 * actions are ordinary buttons, Escape or a click elsewhere closes it.
 */
function BlockMenu({ label, actions }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return undefined
    const away = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener("pointerdown", away)
    return () => document.removeEventListener("pointerdown", away)
  }, [open])

  function close() {
    setOpen(false)
    ref.current?.querySelector("button")?.focus()
  }

  return (
    <div
      ref={ref}
      className={styles.blockMenu}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation()
          close()
        }
      }}
    >
      <IconButton label={`More for ${label}`} onClick={() => setOpen(!open)} expanded={open} controls={menuId}>
        <MoreIcon size={18} />
      </IconButton>
      {open && (
        <div id={menuId} className={styles.menuList}>
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              className={`${styles.menuItem}${action.danger ? ` ${styles.menuDanger}` : ""}`}
              disabled={action.disabled}
              onClick={() => {
                close()
                action.onClick()
              }}
            >
              <action.Icon size={16} />
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Fields({ block, path, content, set, onChange, errorFor, images, onUpload }) {
  const id = (key) => `${block.id}-${key}`
  switch (block.type) {
    case "header":
      return (
        <>
          <TextField id={id("title")} label="Title" value={block.title} onChange={set("title")} max={PAGE_LIMITS.title} error={errorFor(`${path}.title`)} />
          <TextField id={id("tagline")} label="Tagline (optional)" value={block.tagline} onChange={set("tagline")} max={PAGE_LIMITS.tagline} error={errorFor(`${path}.tagline`)} />
          <div className={styles.fieldRow}>
            <ImageField id={id("cover")} label="Cover photo (optional)" value={block.cover} images={images} onChange={set("cover")} onUpload={onUpload} maxSide={PHOTO_MAX_SIDE} error={errorFor(`${path}.cover`)} hint="Shown across the top, cropped to a wide shape." />
            <ImageField id={id("logo")} label="Logo (optional)" value={block.logo} images={images} onChange={set("logo")} onUpload={onUpload} maxSide={LOGO_MAX_SIDE} round error={errorFor(`${path}.logo`)} hint="Shown in a circle, so a square logo works best." />
          </div>
        </>
      )
    case "text":
      return (
        <TextField
          id={id("text")}
          label="Text"
          value={block.text}
          onChange={set("text")}
          max={PAGE_LIMITS.text}
          multiline
          rows={6}
          error={errorFor(`${path}.text`)}
          hint="**bold**, *italic*, a line starting with - for a list, and [link text](https://example.com) for a link."
        />
      )
    case "image":
      return (
        <>
          <ImageField id={id("image")} label="Photo" value={block.image} images={images} onChange={set("image")} onUpload={onUpload} maxSide={PHOTO_MAX_SIDE} error={errorFor(`${path}.image`)} hint="Until a photo is chosen, this block isn’t shown on the page." />
          <TextField id={id("alt")} label="What the photo shows (for screen readers)" value={block.alt} onChange={set("alt")} max={PAGE_LIMITS.imageAlt} error={errorFor(`${path}.alt`)} />
          <TextField id={id("caption")} label="Caption (optional)" value={block.caption} onChange={set("caption")} max={PAGE_LIMITS.imageCaption} error={errorFor(`${path}.caption`)} />
          <TextField id={id("link")} label="Link when tapped (optional)" value={block.link} onChange={set("link")} placeholder="example.com" error={errorFor(`${path}.link`)} />
        </>
      )
    case "buttons":
      return <ButtonsFields block={block} path={path} content={content} onChange={onChange} errorFor={errorFor} />
    case "details":
      return <DetailsFields block={block} path={path} onChange={onChange} errorFor={errorFor} />
    case "faq":
      return <FaqFields block={block} path={path} onChange={onChange} errorFor={errorFor} />
    case "hours":
      return <HoursFields block={block} path={path} onChange={onChange} errorFor={errorFor} />
    case "prices":
      return <PricesFields block={block} path={path} onChange={onChange} errorFor={errorFor} />
    case "gallery":
      return <GalleryFields block={block} path={path} onChange={onChange} errorFor={errorFor} images={images} onUpload={onUpload} />
    case "offer":
      return (
        <>
          <div className={styles.fieldRow}>
            <TextField id={id("label")} label="Small label (optional)" value={block.label} onChange={set("label")} max={PAGE_LIMITS.offerLabel} placeholder="This weekend only" error={errorFor(`${path}.label`)} />
            <TextField id={id("headline")} label="Headline" value={block.headline} onChange={set("headline")} max={PAGE_LIMITS.offerHeadline} placeholder="20% off all whole cakes" error={errorFor(`${path}.headline`)} />
          </div>
          <TextField id={id("text")} label="Text (optional)" value={block.text} onChange={set("text")} max={PAGE_LIMITS.offerText} multiline rows={3} error={errorFor(`${path}.text`)} />
          <div className={styles.fieldRow}>
            <TextField id={id("code")} label="Promo code (optional)" value={block.code} onChange={set("code")} max={PAGE_LIMITS.promoCode} placeholder="FRIDAY20" error={errorFor(`${path}.code`)} />
            <label className={styles.checkbox} style={{ flex: "1 1 200px", alignSelf: "flex-end" }}>
              <input type="checkbox" checked={block.copyButton !== false} onChange={(e) => set("copyButton")(e.target.checked)} />
              Show a Copy button next to the code
            </label>
          </div>
        </>
      )
    default:
      return null
  }
}

function ButtonsFields({ block, path, content, onChange, errorFor }) {
  const items = block.items ?? []
  const setItems = (next) => onChange({ ...block, items: next })
  const setItem = (index, next) => setItems(items.map((item, i) => (i === index ? next : item)))

  function changeKind(index, kind) {
    const item = items[index]
    // Keep a label the owner wrote; swap a default one for the new kind's.
    const label = item.label === BUTTON_DEFAULT_LABELS[item.kind] || !item.label ? BUTTON_DEFAULT_LABELS[kind] : item.label
    const fields = Object.fromEntries((BUTTON_FIELDS[kind] ?? []).map((f) => [f.key, item.fields?.[f.key] ?? ""]))
    setItem(index, { ...item, kind, label, fields })
  }

  return (
    <>
      {errorFor(`${path}.items`) && <p className={styles.fieldError}>{errorFor(`${path}.items`)}</p>}
      {items.map((item, index) => {
        const itemPath = `${path}.items.${index}`
        const id = (key) => `${item.id}-${key}`
        return (
          <div key={item.id} className={styles.subItem}>
            <SubItemHead
              title={`Button ${index + 1}${index === 0 ? " · the main one" : ""}`}
              name="button"
              index={index}
              count={items.length}
              onMove={(step) => setItems(move(items, index, step))}
              onRemove={() => setItems(items.filter((_, i) => i !== index))}
            />
            <div className={styles.fieldRow}>
              <div className={styles.field}>
                <label htmlFor={id("kind")} className={styles.fieldLabel}>
                  What it does
                </label>
                <select id={id("kind")} className="input-field" value={item.kind} onChange={(e) => changeKind(index, e.target.value)}>
                  {BUTTON_KINDS.map((kind) => (
                    <option key={kind.id} value={kind.id}>
                      {kindDescription(kind.id)}
                    </option>
                  ))}
                </select>
              </div>
              <TextField id={id("label")} label="Label" value={item.label} onChange={(label) => setItem(index, { ...item, label })} max={PAGE_LIMITS.buttonLabel} error={errorFor(`${itemPath}.label`)} />
            </div>
            {(BUTTON_FIELDS[item.kind] ?? []).map((field) => {
              const stored = item.fields?.[field.key] ?? ""
              return (
                <TextField
                  key={field.key}
                  id={id(field.key)}
                  label={field.label}
                  type={field.type}
                  // Times are stored as ISO and edited in the browser's own time.
                  value={field.time ? isoToLocalInput(stored) : stored}
                  onChange={(value) =>
                    setItem(index, { ...item, fields: { ...item.fields, [field.key]: field.time ? localInputToIso(value) ?? "" : value } })
                  }
                  placeholder={field.placeholder}
                  multiline={field.multiline}
                  rows={2}
                  error={errorFor(`${itemPath}.fields.${field.key}`)}
                  hint={fieldHint(item.kind, field.key)}
                />
              )
            })}
          </div>
        )
      })}
      {items.length < PAGE_LIMITS.buttons && (
        <button type="button" className="btn btn-secondary btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setItems([...items, newButton(content)])}>
          + Add button
        </button>
      )}
    </>
  )
}

const DETAIL_ICON_NAMES = { calendar: "Calendar", clock: "Clock", pin: "Map pin", info: "Info", tag: "Tag" }

function DetailsFields({ block, path, onChange, errorFor }) {
  const rows = block.rows ?? []
  const setRows = (next) => onChange({ ...block, rows: next })
  const setRow = (index, next) => setRows(rows.map((row, i) => (i === index ? next : row)))

  return (
    <>
      {errorFor(`${path}.rows`) && <p className={styles.fieldError}>{errorFor(`${path}.rows`)}</p>}
      {rows.map((row, index) => {
        const rowPath = `${path}.rows.${index}`
        const id = (key) => `${block.id}-row-${index}-${key}`
        return (
          <div key={index} className={styles.subItem}>
            <SubItemHead
              name="detail"
              title={`Detail ${index + 1}`}
              index={index}
              count={rows.length}
              onMove={(step) => setRows(move(rows, index, step))}
              onRemove={() => setRows(rows.filter((_, i) => i !== index))}
            />
            <div className={styles.fieldRow}>
              <div className={styles.field} style={{ flex: "0 1 150px" }}>
                <label htmlFor={id("icon")} className={styles.fieldLabel}>
                  Icon
                </label>
                <select id={id("icon")} className="input-field" value={row.icon ?? ""} onChange={(e) => setRow(index, { ...row, icon: e.target.value || null })}>
                  {DETAIL_ICONS.map((icon) => (
                    <option key={icon} value={icon}>
                      {DETAIL_ICON_NAMES[icon] ?? icon}
                    </option>
                  ))}
                  <option value="">None</option>
                </select>
              </div>
              <TextField id={id("label")} label="Label (optional)" value={row.label} onChange={(label) => setRow(index, { ...row, label })} max={PAGE_LIMITS.detailLabel} placeholder="When" error={errorFor(`${rowPath}.label`)} />
              <TextField id={id("value")} label="Detail" value={row.value} onChange={(value) => setRow(index, { ...row, value })} max={PAGE_LIMITS.detailValue} placeholder="Fri 27 – Mon 30 November" error={errorFor(`${rowPath}.value`)} />
            </div>
          </div>
        )
      })}
      {rows.length < PAGE_LIMITS.detailRows && (
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          style={{ alignSelf: "flex-start" }}
          onClick={() => setRows([...rows, { icon: "info", label: "", value: "" }])}
        >
          + Add detail
        </button>
      )}
    </>
  )
}

function kindDescription(kind) {
  return (
    {
      link: "Open a website",
      call: "Call a number",
      email: "Write an email",
      whatsapp: "Open a WhatsApp chat",
      directions: "Get directions",
      calendar: "Add an event to their calendar",
      contact: "Save a contact to their phone"
    }[kind] ?? kind
  )
}

/** The note under a button's field, where it needs one. */
function fieldHint(kind, key) {
  if (key === "url") return "https:// is added for you."
  if (kind === "calendar" && key === "startsAt") return "In your time zone. Phones show it in theirs."
  if (kind === "calendar" && key === "endsAt") return "Leave it empty for an hour-long event."
  if (kind === "contact" && key === "website") return "Add at least one of the phone number, email address and website."
  return undefined
}

/** A block in a few words, for its row while it's closed. */
function summaryOf(block) {
  switch (block.type) {
    case "header":
      return block.title
    case "text":
      return String(block.text ?? "").replace(/\s+/g, " ").slice(0, 80)
    case "image":
      return block.caption || "No photo yet"
    case "buttons":
      return (block.items ?? []).map((item) => item.label).filter(Boolean).join(", ")
    case "details":
      return (block.rows ?? []).map((row) => row.value).filter(Boolean).join(" · ")
    case "offer":
      return block.headline
    case "faq":
      return (block.items ?? []).map((item) => item.question).filter(Boolean).join(" · ")
    case "hours":
      return `Mon ${dayHoursText(block, 0)} · Sat ${dayHoursText(block, 5)} · Sun ${dayHoursText(block, 6)}`
    case "prices":
      return [block.title, (block.items ?? []).map((item) => item.name).filter(Boolean).join(", ")].filter(Boolean).join(": ")
    case "gallery":
      return block.items?.length ? `${block.items.length} photo${block.items.length === 1 ? "" : "s"}` : "No photos yet"
    default:
      return ""
  }
}
