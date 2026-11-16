"use client"

import { ArrowDownIcon, ArrowUpIcon, ChevronDownIcon, EyeIcon, EyeOffIcon, TrashIcon } from "@/app/components/icons"
import { BUTTON_KINDS, DETAIL_ICONS, PAGE_LIMITS } from "@/lib/campaignPages"
import { BLOCK_LABELS, BUTTON_DEFAULT_LABELS, BUTTON_FIELDS, move, newButton } from "@/lib/pageEditing"
import styles from "../pages.module.css"

/**
 * One block in the page editor: a row with its name and summary, arrows to
 * move it, hide and delete buttons, and its fields when it's open.
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
  errorFor
}) {
  const isHeader = block.type === "header"
  const label = BLOCK_LABELS[block.type] ?? block.type
  const set = (key) => (value) => onChange({ ...block, [key]: value })
  const bodyId = `${block.id}-fields`

  return (
    <li className={`${styles.block}${open ? ` ${styles.blockOpen}` : ""}${hasError ? ` ${styles.blockError}` : ""}`}>
      <div className={styles.blockHead}>
        <button type="button" className={styles.blockToggle} onClick={onToggle} aria-expanded={open} aria-controls={bodyId}>
          <span className={styles.blockType}>
            {label}
            {block.hidden && <span className={styles.hiddenTag}>Hidden</span>}
          </span>
          <span className={styles.blockSummary}>{summaryOf(block) || "Not filled in yet"}</span>
        </button>
        {!isHeader && (
          <>
            <IconButton label={`Move ${label} up`} onClick={() => onMove(-1)} disabled={!canMoveUp}>
              <ArrowUpIcon size={17} />
            </IconButton>
            <IconButton label={`Move ${label} down`} onClick={() => onMove(1)} disabled={!canMoveDown}>
              <ArrowDownIcon size={17} />
            </IconButton>
            <IconButton
              label={block.hidden ? `Show ${label}` : `Hide ${label}`}
              onClick={() => onChange({ ...block, hidden: !block.hidden })}
            >
              {block.hidden ? <EyeOffIcon size={17} /> : <EyeIcon size={17} />}
            </IconButton>
            <IconButton label={`Delete ${label}`} onClick={onRemove}>
              <TrashIcon size={17} />
            </IconButton>
          </>
        )}
        <IconButton label={open ? `Close ${label}` : `Edit ${label}`} onClick={onToggle}>
          <ChevronDownIcon size={18} style={{ transform: open ? "rotate(180deg)" : undefined }} />
        </IconButton>
      </div>

      {open && (
        <div id={bodyId} className={styles.blockBody}>
          {errorFor(path) && <p className={styles.fieldError}>{errorFor(path)}</p>}
          <Fields block={block} path={path} content={content} set={set} onChange={onChange} errorFor={errorFor} />
        </div>
      )}
    </li>
  )
}

function Fields({ block, path, content, set, onChange, errorFor }) {
  const id = (key) => `${block.id}-${key}`
  switch (block.type) {
    case "header":
      return (
        <>
          <TextField id={id("title")} label="Title" value={block.title} onChange={set("title")} max={PAGE_LIMITS.title} error={errorFor(`${path}.title`)} />
          <TextField id={id("tagline")} label="Tagline (optional)" value={block.tagline} onChange={set("tagline")} max={PAGE_LIMITS.tagline} error={errorFor(`${path}.tagline`)} />
          <p className={styles.hint}>A cover photo and logo can be added once photo uploads arrive.</p>
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
          <p className={styles.hint}>Photo uploads are coming soon. Until then this block isn’t shown on the page.</p>
          <TextField id={id("alt")} label="What the photo shows (for screen readers)" value={block.alt} onChange={set("alt")} max={PAGE_LIMITS.imageAlt} error={errorFor(`${path}.alt`)} />
          <TextField id={id("caption")} label="Caption (optional)" value={block.caption} onChange={set("caption")} max={PAGE_LIMITS.imageCaption} error={errorFor(`${path}.caption`)} />
          <TextField id={id("link")} label="Link when tapped (optional)" value={block.link} onChange={set("link")} placeholder="example.com" error={errorFor(`${path}.link`)} />
        </>
      )
    case "buttons":
      return <ButtonsFields block={block} path={path} content={content} onChange={onChange} errorFor={errorFor} />
    case "details":
      return <DetailsFields block={block} path={path} onChange={onChange} errorFor={errorFor} />
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
            <div className={styles.subHead}>
              <span className={styles.subTitle}>
                Button {index + 1}
                {index === 0 ? " · the main one" : ""}
              </span>
              <IconButton label={`Move button ${index + 1} up`} onClick={() => setItems(move(items, index, -1))} disabled={index === 0}>
                <ArrowUpIcon size={16} />
              </IconButton>
              <IconButton label={`Move button ${index + 1} down`} onClick={() => setItems(move(items, index, 1))} disabled={index === items.length - 1}>
                <ArrowDownIcon size={16} />
              </IconButton>
              <IconButton label={`Remove button ${index + 1}`} onClick={() => setItems(items.filter((_, i) => i !== index))} disabled={items.length === 1}>
                <TrashIcon size={16} />
              </IconButton>
            </div>
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
            {(BUTTON_FIELDS[item.kind] ?? []).map((field) => (
              <TextField
                key={field.key}
                id={id(field.key)}
                label={field.label}
                type={field.type}
                value={item.fields?.[field.key] ?? ""}
                onChange={(value) => setItem(index, { ...item, fields: { ...item.fields, [field.key]: value } })}
                placeholder={field.placeholder}
                multiline={field.multiline}
                rows={2}
                error={errorFor(`${itemPath}.fields.${field.key}`)}
                hint={field.key === "url" ? "https:// is added for you." : undefined}
              />
            ))}
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
            <div className={styles.subHead}>
              <span className={styles.subTitle}>Detail {index + 1}</span>
              <IconButton label={`Move detail ${index + 1} up`} onClick={() => setRows(move(rows, index, -1))} disabled={index === 0}>
                <ArrowUpIcon size={16} />
              </IconButton>
              <IconButton label={`Move detail ${index + 1} down`} onClick={() => setRows(move(rows, index, 1))} disabled={index === rows.length - 1}>
                <ArrowDownIcon size={16} />
              </IconButton>
              <IconButton label={`Remove detail ${index + 1}`} onClick={() => setRows(rows.filter((_, i) => i !== index))} disabled={rows.length === 1}>
                <TrashIcon size={16} />
              </IconButton>
            </div>
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

/** A labelled text input or textarea, with its error or hint under it. */
export function TextField({ id, label, value, onChange, max, placeholder, type = "text", multiline = false, rows = 3, error, hint }) {
  const className = `input-field${multiline ? ` ${styles.textarea}` : ""}${error ? " input-error" : ""}`
  const common = {
    id,
    className,
    value: value ?? "",
    maxLength: max,
    placeholder,
    onChange: (e) => onChange(e.target.value),
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error || hint ? `${id}-note` : undefined
  }
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.fieldLabel}>
        {label}
      </label>
      {multiline ? <textarea rows={rows} {...common} /> : <input type={type} {...common} />}
      {error ? (
        <p id={`${id}-note`} className={styles.fieldError}>
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-note`} className={styles.hint}>
          {hint}
        </p>
      ) : null}
    </div>
  )
}

function IconButton({ label, onClick, disabled, children }) {
  return (
    <button type="button" className={styles.iconButton} aria-label={label} title={label} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  )
}

function kindDescription(kind) {
  return { link: "Open a website", call: "Call a number", email: "Write an email", whatsapp: "Open a WhatsApp chat", directions: "Get directions" }[kind] ?? kind
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
    default:
      return ""
  }
}
