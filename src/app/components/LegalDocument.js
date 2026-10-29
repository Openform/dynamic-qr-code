import FormattedText from "./FormattedText"
import { formatLegalDate } from "@/lib/legal"
import styles from "./LegalDocument.module.css"

/**
 * A legal page's heading, "Last updated" date and text. Used by /privacy,
 * /terms and the admin editor's preview, so the preview matches the site.
 * `preview` renders the title as a paragraph so the admin page keeps one h1.
 */
export default function LegalDocument({ title, lastUpdated, content, preview = false }) {
  const Title = preview ? "p" : "h1"
  const date = formatLegalDate(lastUpdated)

  return (
    <>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Legal</p>
        <Title className={styles.title}>{title}</Title>
        {date && <p className={styles.updated}>Last updated: {date}</p>}
      </header>
      <FormattedText content={content} />
    </>
  )
}
