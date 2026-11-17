"use client"

import { campaignFontClasses } from "@/app/components/campaign/fonts"
import { BODY_FONTS, FONTS, HEADING_SIZES, TEXT_SIZES } from "@/lib/campaignPages"
import { fontStack, THEME_FONTS } from "@/lib/pageTheme"
import styles from "../pages.module.css"

const FONT_NAMES = Object.fromEntries(FONTS.map((font) => [font.id, font.name]))

/**
 * The Look card's type settings: the fonts for headings and for text, each
 * shown in its own font, and the text and heading sizes. `onChange(fields)`
 * gets the content fields that changed (lib/campaignPages.js).
 */
export default function TypeFields({ content, onChange }) {
  const themeFont = THEME_FONTS[content.theme] ?? "inter"
  return (
    <>
      <FontChoices
        id="heading-font"
        label="Heading font"
        fonts={FONTS.map((font) => font.id)}
        // Choosing the theme's own font saves no font, so it follows the theme if that changes.
        defaultFont={themeFont}
        defaultCaption="Theme’s font"
        value={content.font}
        onChange={(font) => onChange({ font })}
      />
      <FontChoices
        id="body-font"
        label="Text font"
        hint="Only fonts that stay easy to read in paragraphs on a phone."
        fonts={BODY_FONTS.map((font) => font.id)}
        defaultFont="inter"
        defaultCaption="Default"
        value={content.bodyFont}
        onChange={(bodyFont) => onChange({ bodyFont })}
      />
      <div className={styles.fieldRow}>
        <SizeChoices id="text-size" label="Text size" sizes={TEXT_SIZES} value={content.textSize ?? "standard"} onChange={(textSize) => onChange({ textSize })} />
        <SizeChoices id="heading-size" label="Heading size" sizes={HEADING_SIZES} value={content.headingSize ?? "standard"} onChange={(headingSize) => onChange({ headingSize })} />
      </div>
      <p className={styles.hint} style={{ marginTop: -8 }}>
        Sizes grow from each visitor’s own browser setting, so people who need bigger text still get it.
      </p>
    </>
  )
}

/**
 * Fonts to pick from, each name written in its own font. `defaultFont` is
 * the one used when none is chosen: picking it gives `onChange(null)`, and
 * it's marked with `defaultCaption`.
 */
function FontChoices({ id, label, hint, fonts, defaultFont, defaultCaption, value, onChange }) {
  const current = value ?? defaultFont
  return (
    <div className={styles.field}>
      <span id={`${id}-label`} className={styles.fieldLabel}>
        {label}
      </span>
      {/* The fonts' CSS variables, so each name can be shown in its font. */}
      <div className={`${styles.fonts} ${campaignFontClasses}`} role="group" aria-labelledby={`${id}-label`}>
        {fonts.map((font) => {
          const on = font === current
          const isDefault = font === defaultFont
          return (
            <button
              key={font}
              type="button"
              aria-pressed={on}
              className={`${styles.font}${on ? ` ${styles.fontOn}` : ""}`}
              onClick={() => onChange(isDefault ? null : font)}
            >
              <span className={styles.fontSample} style={{ fontFamily: fontStack(font) }}>
                {FONT_NAMES[font]}
              </span>
              {isDefault && <span className={styles.fontCaption}>{defaultCaption}</span>}
            </button>
          )
        })}
      </div>
      {hint && <p className={styles.hint}>{hint}</p>}
    </div>
  )
}

/** A few size steps, side by side. */
function SizeChoices({ id, label, sizes, value, onChange }) {
  return (
    <div className={styles.field}>
      <span id={`${id}-label`} className={styles.fieldLabel}>
        {label}
      </span>
      <div className={styles.segmented} role="group" aria-labelledby={`${id}-label`}>
        {sizes.map((size) => (
          <button key={size.id} type="button" aria-pressed={size.id === value} className={size.id === value ? styles.segmentOn : undefined} onClick={() => onChange(size.id)}>
            {size.name}
          </button>
        ))}
      </div>
    </div>
  )
}
