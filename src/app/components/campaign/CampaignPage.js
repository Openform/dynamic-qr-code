import FormattedText from "@/app/components/FormattedText"
import {
  CalendarIcon,
  CalendarPlusIcon,
  ChatIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ClockIcon,
  FlagIcon,
  InfoIcon,
  LinkIcon,
  MailIcon,
  MapPinIcon,
  PhoneIcon,
  TagIcon,
  UserIcon
} from "@/app/components/icons"
import { buttonFile, buttonLink } from "@/lib/campaignPages"
import { hoursRows, hoursStatus } from "@/lib/openingHours"
import { pageLook } from "@/lib/pageTheme"
import { SITE_URL } from "@/lib/site"
import CopyCodeButton from "./CopyCodeButton"
import styles from "./CampaignPage.module.css"

/**
 * A campaign page as visitors see it, drawn from its stored content
 * (lib/campaignPages.js) in its theme (lib/pageTheme.js). Used by the public
 * page (/r/[shortId]/p/[pageId]) and the owner's preview, so what the owner
 * previews is exactly what scanners get.
 *
 * Nothing here is ever treated as HTML: text is rendered as text, Text blocks
 * through FormattedText (which builds React elements from lib/markdown.js),
 * and every button's link is rebuilt from its checked fields by buttonLink().
 * A block or button that doesn't pass is left out rather than shown wrong.
 * Nothing needs JavaScript except the Copy button: questions open with the
 * browser's own <details> (one at a time, sliding where the browser can), and
 * the gallery is a row that scrolls sideways.
 *
 * Props:
 *   content    the page's stored content
 *   view       what to show now, from pageView() in lib/campaignPages.js
 *              (its `nowMs` is the time opening hours are shown for)
 *   images     { [imageId]: { src, width, height } } for the page's images;
 *              blocks whose image isn't there are drawn without it
 *   fileHref   (buttonId, type) → where a calendar or contact button's file
 *              downloads from ('ics' or 'vcf'); without it those buttons
 *              are left out
 *   className  extra classes for the root (the theme fonts' variables)
 *   reportHref where "Report this page" goes; left out when not given
 *   editing    only in the editor's preview: { openId, onPick(blockId) }.
 *              Each block can then be clicked to edit it (links don't open),
 *              and the one open in the editor is outlined.
 */
export default function CampaignPage({ content, view, images = {}, fileHref = null, className, reportHref = null, editing = null }) {
  const look = pageLook(content)
  return (
    <div className={className ? `${styles.page} ${className}` : styles.page} style={look.style}>
      <main className={styles.column}>
        <Editable editing={editing} id={view.header?.id ?? "header"} header>
          <Header header={view.header} images={images} showTagline={!view.ended} />
        </Editable>
        <div className={styles.blocks}>
          {view.ended ? (
            <Ended keptButton={view.keptButton} fileHref={fileHref} />
          ) : (
            view.blocks.map((block) => (
              <Editable key={block.id} editing={editing} id={block.id}>
                <Block block={block} images={images} fileHref={fileHref} nowMs={view.nowMs} />
              </Editable>
            ))
          )}
        </div>
        <footer className={styles.footer}>
          {reportHref && (
            <a href={reportHref}>
              <FlagIcon size={14} />
              Report this page
            </a>
          )}
          <a href={SITE_URL}>Made with QR Go</a>
        </footer>
      </main>
    </div>
  )
}

/**
 * In the editor's preview, a block that opens in the editor when clicked.
 * Links inside don't open, so a click never leaves the editor; questions
 * still open and the Copy button still copies. Elsewhere, just the block.
 */
function Editable({ editing, id, header = false, children }) {
  if (!editing) return children
  const classes = [styles.editable, header && styles.editableHeader, editing.openId === id && styles.editableOn].filter(Boolean)
  return (
    <div
      className={classes.join(" ")}
      data-block-id={id}
      onClickCapture={(e) => {
        if (e.target.closest("a")) e.preventDefault()
        editing.onPick(id)
      }}
    >
      {children}
    </div>
  )
}

/** An image of the page, or null when it isn't there (yet). */
function imageOf(images, id) {
  return id ? images[id] ?? null : null
}

function Header({ header, images, showTagline }) {
  const cover = imageOf(images, header?.cover)
  const logo = imageOf(images, header?.logo)
  return (
    <header>
      {cover ? (
        // Plain <img>: images are already resized when they're uploaded, and
        // Next's image optimiser would need a native library the host can't run.
        // eslint-disable-next-line @next/next/no-img-element
        <img className={styles.cover} src={cover.src} width={cover.width} height={cover.height} alt="" />
      ) : (
        <div className={styles.coverBand} aria-hidden="true" />
      )}
      <div className={logo ? `${styles.headerText} ${styles.withLogo}` : styles.headerText}>
        {logo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className={styles.logo} src={logo.src} width={72} height={72} alt="" />
        )}
        <h1 className={styles.title}>{header?.title}</h1>
        {showTagline && header?.tagline && <p className={styles.tagline}>{header.tagline}</p>}
      </div>
    </header>
  )
}

function Block({ block, images, fileHref, nowMs }) {
  switch (block.type) {
    case "text":
      return (
        <section>
          <FormattedText content={block.text} className={styles.prose} />
        </section>
      )
    case "image":
      return <ImageBlock block={block} images={images} />
    case "buttons":
      return <Buttons items={block.items} fileHref={fileHref} />
    case "details":
      return <Details rows={block.rows} />
    case "offer":
      return <Offer block={block} />
    case "faq":
      return <Faq block={block} />
    case "hours":
      return <Hours block={block} nowMs={nowMs} />
    case "prices":
      return <Prices block={block} />
    case "gallery":
      return <Gallery block={block} images={images} />
    default:
      return null
  }
}

function ImageBlock({ block, images }) {
  const image = imageOf(images, block.image)
  if (!image) return null
  // eslint-disable-next-line @next/next/no-img-element
  const img = <img className={styles.image} src={image.src} width={image.width} height={image.height} alt={block.alt} loading="lazy" />
  return (
    <figure className={styles.figure}>
      {block.link ? <a href={block.link}>{img}</a> : img}
      {block.caption && <figcaption className={styles.caption}>{block.caption}</figcaption>}
    </figure>
  )
}

const BUTTON_ICONS = {
  link: LinkIcon,
  call: PhoneIcon,
  email: MailIcon,
  whatsapp: ChatIcon,
  directions: MapPinIcon,
  calendar: CalendarPlusIcon,
  contact: UserIcon
}

/** Where a button goes: its link, or for calendar and contact buttons, its file. */
function hrefOf(button, fileHref) {
  const link = buttonLink(button)
  if (link) return link
  const file = fileHref ? buttonFile(button) : null
  return file ? fileHref(button.id, file.type) : null
}

/** A stack of buttons; the first one in a block stands out as the main one. */
function Buttons({ items, fileHref }) {
  const buttons = (Array.isArray(items) ? items : [])
    .map((button) => ({ ...button, href: hrefOf(button, fileHref) }))
    .filter((button) => button.href)
  if (buttons.length === 0) return null
  return (
    <div className={styles.buttons}>
      {buttons.map((button, index) => {
        const Icon = BUTTON_ICONS[button.kind] ?? LinkIcon
        return (
          <a key={button.id} href={button.href} className={index === 0 ? styles.primary : styles.button}>
            <Icon size={20} />
            <span>{button.label}</span>
          </a>
        )
      })}
    </div>
  )
}

const DETAIL_ICONS = {
  calendar: CalendarIcon,
  clock: ClockIcon,
  pin: MapPinIcon,
  info: InfoIcon,
  tag: TagIcon
}

function Details({ rows }) {
  if (!Array.isArray(rows) || rows.length === 0) return null
  return (
    <dl className={styles.details}>
      {rows.map((row, index) => {
        const Icon = DETAIL_ICONS[row.icon]
        return (
          <div key={index} className={styles.detail}>
            {Icon && <Icon size={22} className={styles.detailIcon} />}
            <div className={styles.detailText}>
              {row.label && <dt className={styles.detailLabel}>{row.label}</dt>}
              <dd className={styles.detailValue}>{row.value}</dd>
            </div>
          </div>
        )
      })}
    </dl>
  )
}

function Offer({ block }) {
  return (
    <section className={styles.offer}>
      {block.label && <p className={styles.offerLabel}>{block.label}</p>}
      <h2 className={styles.offerHeadline}>{block.headline}</h2>
      {block.text && <p className={styles.offerText}>{block.text}</p>}
      {block.code && (
        <div className={styles.codeRow}>
          <span className={styles.code}>{block.code}</span>
          {block.copyButton && <CopyCodeButton code={block.code} className={styles.copy} />}
        </div>
      )}
    </section>
  )
}

/**
 * Questions that open to show their answers, with the browser's own
 * <details>, so no script. Sharing a `name` makes them an accordion: opening
 * one closes the others in the block. The answer slides open and shut where
 * the browser supports it (CampaignPage.module.css), and just appears where
 * it doesn't.
 */
function Faq({ block }) {
  const items = Array.isArray(block.items) ? block.items : []
  if (items.length === 0) return null
  return (
    <section className={styles.listBlock}>
      {block.title && <h2 className={styles.blockTitle}>{block.title}</h2>}
      <div className={styles.faq}>
        {items.map((item, index) => (
          <details key={index} className={styles.faqItem} name={`faq-${block.id}`}>
            <summary className={styles.faqQuestion}>
              <span>{item.question}</span>
              <ChevronDownIcon size={20} className={styles.faqChevron} />
            </summary>
            {/* The row that slides open, and the part it clips while it does. */}
            <div className={styles.faqBody}>
              <div className={styles.faqClip}>
                <FormattedText content={item.answer} className={`${styles.prose} ${styles.faqAnswer}`} />
              </div>
            </div>
          </details>
        ))}
      </div>
    </section>
  )
}

function Hours({ block, nowMs }) {
  const status = block.showStatus === false ? null : hoursStatus(block, nowMs)
  const rows = hoursRows(block, nowMs)
  return (
    <section className={styles.hours}>
      <div className={styles.hoursHead}>
        <ClockIcon size={22} className={styles.detailIcon} />
        <div className={styles.detailText}>
          <h2 className={styles.hoursTitle}>{block.title || "Opening hours"}</h2>
          {status && (
            <p className={styles.hoursStatus}>
              <span className={status.open ? styles.dotOpen : styles.dotClosed} aria-hidden="true" />
              {status.text}
            </p>
          )}
        </div>
      </div>
      <table className={styles.hoursTable}>
        <tbody>
          {rows.map((row) => (
            <tr key={row.days} className={row.today ? styles.today : undefined} aria-current={row.today ? "date" : undefined}>
              <th scope="row">{row.days}</th>
              <td>{row.hours}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {block.note && <p className={styles.hoursNote}>{block.note}</p>}
    </section>
  )
}

function Prices({ block }) {
  const items = Array.isArray(block.items) ? block.items : []
  if (items.length === 0) return null
  return (
    <section className={styles.listBlock}>
      {block.title && <h2 className={styles.blockTitle}>{block.title}</h2>}
      <ul className={styles.prices}>
        {items.map((item, index) => (
          <li key={index} className={styles.priceItem}>
            <div className={styles.priceRow}>
              <span className={styles.priceName}>
                {item.name}
                {item.tag && <span className={styles.priceTag}>{item.tag}</span>}
              </span>
              {item.price && <span className={styles.price}>{item.price}</span>}
            </div>
            {item.description && <p className={styles.priceDescription}>{item.description}</p>}
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Photos in a row that scrolls sideways, each snapping into place; the next one peeks in. */
function Gallery({ block, images }) {
  const photos = (Array.isArray(block.items) ? block.items : [])
    .map((item) => ({ alt: item.alt, image: imageOf(images, item.image) }))
    .filter((photo) => photo.image)
  if (photos.length === 0) return null
  if (photos.length === 1) {
    const [{ alt, image }] = photos
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={styles.image} src={image.src} width={image.width} height={image.height} alt={alt} loading="lazy" />
  }
  return (
    <section className={styles.gallery} tabIndex={0} aria-label={`${photos.length} photos. Scroll sideways to see them all.`}>
      {photos.map(({ alt, image }, index) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={index}
          className={styles.galleryPhoto}
          src={image.src}
          width={image.width}
          height={image.height}
          alt={alt}
          loading={index < 2 ? undefined : "lazy"}
        />
      ))}
    </section>
  )
}

function Ended({ keptButton, fileHref }) {
  return (
    <>
      <section className={styles.ended}>
        <CheckCircleIcon size={28} className={styles.endedIcon} />
        <h2 className={styles.endedTitle}>This campaign has ended</h2>
        <p className={styles.endedText}>Thanks for stopping by.</p>
      </section>
      {keptButton && <Buttons items={[keptButton]} fileHref={fileHref} />}
    </>
  )
}
