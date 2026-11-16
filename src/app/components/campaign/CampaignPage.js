import FormattedText from "@/app/components/FormattedText"
import {
  CalendarIcon,
  ChatIcon,
  CheckCircleIcon,
  ClockIcon,
  FlagIcon,
  InfoIcon,
  LinkIcon,
  MailIcon,
  MapPinIcon,
  PhoneIcon,
  TagIcon
} from "@/app/components/icons"
import { buttonLink } from "@/lib/campaignPages"
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
 *
 * Props:
 *   content    the page's stored content
 *   view       what to show now, from pageView() in lib/campaignPages.js
 *   images     { [imageId]: { src, width, height } } for the page's images;
 *              blocks whose image isn't there are drawn without it
 *   className  extra classes for the root (the theme fonts' variables)
 *   reportHref where "Report this page" goes; left out when not given
 */
export default function CampaignPage({ content, view, images = {}, className, reportHref = null }) {
  const look = pageLook(content)
  return (
    <div className={className ? `${styles.page} ${className}` : styles.page} style={look.style}>
      <main className={styles.column}>
        <Header header={view.header} images={images} showTagline={!view.ended} />
        <div className={styles.blocks}>
          {view.ended ? (
            <Ended keptButton={view.keptButton} />
          ) : (
            view.blocks.map((block) => <Block key={block.id} block={block} images={images} />)
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

function Block({ block, images }) {
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
      return <Buttons items={block.items} />
    case "details":
      return <Details rows={block.rows} />
    case "offer":
      return <Offer block={block} />
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
  directions: MapPinIcon
}

/** A stack of buttons; the first one in a block stands out as the main one. */
function Buttons({ items }) {
  const buttons = (Array.isArray(items) ? items : [])
    .map((button) => ({ ...button, href: buttonLink(button) }))
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

function Ended({ keptButton }) {
  return (
    <>
      <section className={styles.ended}>
        <CheckCircleIcon size={28} className={styles.endedIcon} />
        <h2 className={styles.endedTitle}>This campaign has ended</h2>
        <p className={styles.endedText}>Thanks for stopping by.</p>
      </section>
      {keptButton && <Buttons items={[keptButton]} />}
    </>
  )
}
