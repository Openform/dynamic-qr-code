"use client"

import { TrashIcon } from "@/app/components/icons"
import { PAGE_LIMITS } from "@/lib/campaignPages"
import { DAY_NAMES } from "@/lib/openingHours"
import { localTimeZone } from "@/lib/pageEditing"
import { IconButton, TextField } from "./fields"
import styles from "../pages.module.css"

/**
 * The fields of an Opening hours block: a row for each day with whether
 * it's open and its times (up to two, for a break), the heading, a note,
 * and whether to show "Open now". Paths in `errorFor` follow
 * lib/campaignPages.js, e.g. "blocks.3.days.0.periods.1.close".
 */
export default function HoursFields({ block, path, onChange, errorFor }) {
  const days = block.days ?? []
  const setDay = (index, periods) => onChange({ ...block, days: days.map((day, i) => (i === index ? { periods } : day)) })
  const id = (key) => `${block.id}-${key}`
  const myZone = localTimeZone()

  // Opening a closed day starts it with the hours of the nearest open day before it.
  function open(index) {
    const before = days.slice(0, index).reverse().find((day) => day.periods?.length)
    setDay(index, before ? before.periods.map((p) => ({ ...p })) : [{ open: "09:00", close: "17:00" }])
  }

  // A break splits the day at lunch when it runs through it; otherwise it adds an evening.
  function addBreak(index) {
    const [first] = days[index].periods
    if (first.open < "12:00" && first.close > "13:00") {
      setDay(index, [{ open: first.open, close: "12:00" }, { open: "13:00", close: first.close }])
    } else {
      setDay(index, [first, { open: "18:00", close: "22:00" }])
    }
  }

  function copyMonday() {
    const monday = days[0]?.periods ?? []
    onChange({ ...block, days: days.map((day, i) => (i >= 1 && i <= 4 ? { periods: monday.map((p) => ({ ...p })) } : day)) })
  }

  return (
    <>
      <TextField id={id("title")} label="Heading (optional)" value={block.title} onChange={(title) => onChange({ ...block, title })} max={PAGE_LIMITS.blockTitle} placeholder="Opening hours" error={errorFor(`${path}.title`)} />

      <div className={styles.field}>
        <span className={styles.fieldLabel}>Hours</span>
        {errorFor(`${path}.days`) && <p className={styles.fieldError}>{errorFor(`${path}.days`)}</p>}
        <div className={styles.hoursGrid}>
          {DAY_NAMES.map((name, index) => {
            const periods = days[index]?.periods ?? []
            const dayPath = `${path}.days.${index}`
            const isOpen = periods.length > 0
            const errors = [errorFor(dayPath), ...periods.flatMap((_, p) => [errorFor(`${dayPath}.periods.${p}.open`), errorFor(`${dayPath}.periods.${p}.close`)])].filter(Boolean)
            return (
              <div key={name} className={styles.hoursDay}>
                <label className={styles.hoursDayName}>
                  <input type="checkbox" checked={isOpen} onChange={(e) => (e.target.checked ? open(index) : setDay(index, []))} />
                  {name}
                </label>
                <div className={styles.hoursTimes}>
                  {!isOpen && <span className={styles.hint}>Closed</span>}
                  {periods.map((period, p) => (
                    <div key={p} className={styles.hoursPeriod}>
                      <input
                        type="time"
                        className="input-field"
                        aria-label={`${name}${periods.length > 1 ? `, time ${p + 1},` : ""} opens`}
                        value={period.open}
                        onChange={(e) => setDay(index, periods.map((x, i) => (i === p ? { ...x, open: e.target.value } : x)))}
                      />
                      <span aria-hidden="true">to</span>
                      <input
                        type="time"
                        className="input-field"
                        aria-label={`${name}${periods.length > 1 ? `, time ${p + 1},` : ""} closes`}
                        value={period.close}
                        onChange={(e) => setDay(index, periods.map((x, i) => (i === p ? { ...x, close: e.target.value } : x)))}
                      />
                      {p > 0 && (
                        <IconButton label={`Remove ${name}’s second time`} onClick={() => setDay(index, periods.slice(0, 1))}>
                          <TrashIcon size={16} />
                        </IconButton>
                      )}
                    </div>
                  ))}
                  {isOpen && periods.length < PAGE_LIMITS.hoursPeriods && (
                    <button type="button" className={styles.textButton} onClick={() => addBreak(index)}>
                      + Add a break
                    </button>
                  )}
                </div>
                {errors.length > 0 && <p className={styles.fieldError}>{errors[0]}</p>}
              </div>
            )
          })}
        </div>
        <p className={styles.hint}>
          A closing time before the opening time runs past midnight, and the same time for both means open all day.
        </p>
      </div>

      <div className={styles.rowActions}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={copyMonday}>
          Copy Monday to Tuesday – Friday
        </button>
      </div>

      <TextField id={id("note")} label="Note (optional)" value={block.note} onChange={(note) => onChange({ ...block, note })} max={PAGE_LIMITS.hoursNote} placeholder="Closed on public holidays" error={errorFor(`${path}.note`)} />

      <label className={styles.checkbox}>
        <input type="checkbox" checked={block.showStatus !== false} onChange={(e) => onChange({ ...block, showStatus: e.target.checked })} />
        Show whether it’s open now, like “Open now · closes 17:00”
      </label>

      <p className={styles.hint}>
        The times are on the clock in {block.timeZone?.replace(/_/g, " ")}.
        {block.timeZone !== myZone && (
          <>
            {" "}
            <button type="button" className={styles.textButton} onClick={() => onChange({ ...block, timeZone: myZone })}>
              Use my time zone ({myZone.replace(/_/g, " ")})
            </button>
          </>
        )}
      </p>
      {errorFor(`${path}.timeZone`) && <p className={styles.fieldError}>{errorFor(`${path}.timeZone`)}</p>}
    </>
  )
}
