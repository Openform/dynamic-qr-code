"use client"

import { useState } from "react"
import {
  CONTENT_TYPES,
  LIMITS,
  WIFI_SECURITY,
  getContentType
} from "@/lib/contentTypes"
import { ContentTypeIcon, EyeIcon, EyeOffIcon, LockIcon } from "@/app/components/icons"
import fieldStyles from "./ContentFields.module.css"

/**
 * The form fields for what a code does (lib/contentTypes.js): the type
 * picker shown when a code is created, and each type's fields. Website codes
 * keep their own URL field in CreateEditModal.
 */

/** Empty fields for each type, for a new code. */
export const EMPTY_CONTENT = {
  email: { to: "", subject: "", body: "" },
  phone: { number: "" },
  sms: { number: "", message: "" },
  whatsapp: { number: "", message: "" },
  location: { query: "" },
  wifi: { ssid: "", security: "WPA", password: "", hidden: false }
}

/** What each type does, under the picker. */
const TYPE_HINTS = {
  url: "Opens a web page. You can change the link at any time, even after the code is printed.",
  email:
    "Opens a new email to you, with the subject and message filled in. You can change them at any time.",
  phone: "Asks to call your number. You can change the number at any time.",
  sms: "Opens a new text message to you, with the message filled in. You can change them at any time.",
  whatsapp: "Opens a WhatsApp chat with you, with the message filled in. You can change them at any time.",
  location: "Shows a place in Google Maps. You can change the place at any time.",
  wifi:
    "Lets people join your Wi-Fi network without typing the password. The details are saved in the code itself, so they can’t be changed after it’s created, and scans aren’t counted."
}

export function ContentTypePicker({ value, onChange }) {
  return (
    <div className="input-group">
      <span className="input-label" id="qr-content-type-label">
        What should this code do?
      </span>
      <div
        className={fieldStyles.typeGrid}
        role="radiogroup"
        aria-labelledby="qr-content-type-label"
      >
        {CONTENT_TYPES.map((t) => {
          const active = t.id === value
          return (
            <button
              key={t.id}
              id={`qr-content-type-${t.id}`}
              type="button"
              role="radio"
              aria-checked={active}
              className={`${fieldStyles.typeOption}${active ? ` ${fieldStyles.typeOptionActive}` : ""}`}
              onClick={() => onChange(t.id)}
            >
              <ContentTypeIcon type={t.id} size={18} />
              <span>{t.label}</span>
            </button>
          )
        })}
      </div>
      <p className={fieldStyles.hint}>{TYPE_HINTS[value]}</p>
    </div>
  )
}

/** The type of an existing code, which can't be changed. */
export function ContentTypeLabel({ type }) {
  const t = getContentType(type)
  return (
    <div className="input-group">
      <span className="input-label">Type</span>
      <span className={fieldStyles.typeBadge}>
        <ContentTypeIcon type={t.id} size={16} /> {t.label}
      </span>
    </div>
  )
}

/**
 * The fields for a type other than Website. `error` is `{ field, error }`
 * from parseContent(); `locked` shows a static code's saved details (they
 * can't change).
 */
export function ContentFields({ type, content, onChange, error, locked = false }) {
  const c = content ?? EMPTY_CONTENT[type] ?? {}
  const set = (key) => (value) => onChange({ ...c, [key]: value })
  const errorFor = (field) => (error && error.field === field ? error.error : "")

  switch (type) {
    case "email":
      return (
        <>
          <TextField
            id="qr-email-to"
            label="Email address"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="hello@yourbusiness.co.za"
            value={c.to}
            onChange={set("to")}
            maxLength={LIMITS.email}
            error={errorFor("to")}
            required
          />
          <TextField
            id="qr-email-subject"
            label="Subject (optional)"
            placeholder="Enquiry"
            value={c.subject}
            onChange={set("subject")}
            maxLength={LIMITS.subject}
            error={errorFor("subject")}
          />
          <TextArea
            id="qr-email-body"
            label="Message (optional)"
            placeholder="Hi, I’d like to know more about…"
            value={c.body}
            onChange={set("body")}
            maxLength={LIMITS.emailBody}
            error={errorFor("body")}
            hint="People can change the subject and message before they send it."
          />
        </>
      )

    case "phone":
      return (
        <TextField
          id="qr-phone-number"
          label="Phone number"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="+27 82 123 4567"
          value={c.number}
          onChange={set("number")}
          maxLength={32}
          error={errorFor("number")}
          hint="Include the country code if people in other countries might scan it."
          required
        />
      )

    case "sms":
      return (
        <>
          <TextField
            id="qr-sms-number"
            label="Phone number"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+27 82 123 4567"
            value={c.number}
            onChange={set("number")}
            maxLength={32}
            error={errorFor("number")}
            required
          />
          <TextArea
            id="qr-sms-message"
            label="Message (optional)"
            placeholder="INFO"
            value={c.message}
            onChange={set("message")}
            maxLength={LIMITS.smsBody}
            error={errorFor("message")}
            hint="People can change the message before they send it. Normal SMS rates apply to them."
          />
        </>
      )

    case "whatsapp":
      return (
        <>
          <TextField
            id="qr-whatsapp-number"
            label="WhatsApp number"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+27 82 123 4567"
            value={c.number}
            onChange={set("number")}
            maxLength={32}
            error={errorFor("number")}
            hint="With the country code, like +27 for South Africa."
            required
          />
          <TextArea
            id="qr-whatsapp-message"
            label="Message (optional)"
            placeholder="Hi! I’d like to make a booking."
            value={c.message}
            onChange={set("message")}
            maxLength={LIMITS.whatsappMessage}
            error={errorFor("message")}
            hint="People can change the message before they send it."
          />
        </>
      )

    case "location":
      return (
        <TextField
          id="qr-location-query"
          label="Address or place"
          placeholder="1 Long Street, Cape Town"
          value={c.query}
          onChange={set("query")}
          maxLength={LIMITS.location}
          error={errorFor("query")}
          hint="An address, a place name, or coordinates like -33.9249, 18.4241."
          required
        />
      )

    case "wifi":
      return <WifiFields content={c} set={set} errorFor={errorFor} locked={locked} />

    default:
      return null
  }
}

function WifiFields({ content: c, set, errorFor, locked }) {
  const [showPassword, setShowPassword] = useState(false)
  const needsPassword = c.security !== "nopass"

  return (
    <>
      <TextField
        id="qr-wifi-ssid"
        label="Network name"
        placeholder="Cafe Guest"
        value={c.ssid}
        onChange={set("ssid")}
        error={errorFor("ssid")}
        hint={locked ? undefined : "Exactly as it appears in the list of Wi-Fi networks, including capitals."}
        readOnly={locked}
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        required
      />
      <div className="input-group">
        <label htmlFor="qr-wifi-security" className="input-label">
          Security
        </label>
        <select
          id="qr-wifi-security"
          className="input-field"
          value={c.security}
          onChange={(e) => set("security")(e.target.value)}
          disabled={locked}
        >
          {WIFI_SECURITY.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      {needsPassword && (
        <div className="input-group">
          <label htmlFor="qr-wifi-password" className="input-label">
            Password
          </label>
          <div className="input-wrapper">
            <input
              id="qr-wifi-password"
              // Hidden by default, so it isn't shown to anyone looking at the screen.
              type={showPassword ? "text" : "password"}
              className="input-field"
              value={c.password}
              onChange={(e) => set("password")(e.target.value)}
              readOnly={locked}
              // A Wi-Fi password isn't this site's password: keep the
              // browser and password managers from saving or filling it.
              autoComplete="off"
              data-1p-ignore="true"
              data-lpignore="true"
              data-bwignore="true"
              spellCheck={false}
              autoCapitalize="off"
              maxLength={64}
              aria-invalid={errorFor("password") ? true : undefined}
              aria-describedby="qr-wifi-password-hint"
              required
            />
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ flex: "none" }}
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              aria-controls="qr-wifi-password"
            >
              {showPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
            </button>
          </div>
          {errorFor("password") ? (
            <p id="qr-wifi-password-hint" className={fieldStyles.error}>
              {errorFor("password")}
            </p>
          ) : (
            <p id="qr-wifi-password-hint" className={fieldStyles.hint}>
              <LockIcon size={12} /> Saved encrypted and only shown to you. Anyone who scans the code can join the network.
            </p>
          )}
        </div>
      )}
      <label htmlFor="qr-wifi-hidden" className="qr-toggle">
        <input
          id="qr-wifi-hidden"
          type="checkbox"
          checked={c.hidden === true}
          onChange={(e) => set("hidden")(e.target.checked)}
          disabled={locked}
        />
        <span>Hidden network (it doesn’t appear in the list of networks)</span>
      </label>
    </>
  )
}

function TextField({ id, label, error, hint, onChange, value, ...rest }) {
  return (
    <div className="input-group">
      <label htmlFor={id} className="input-label">
        {label}
      </label>
      <input
        id={id}
        type="text"
        className="input-field"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${id}-hint` : undefined}
        {...rest}
      />
      {error ? (
        <p id={`${id}-hint`} className={fieldStyles.error}>
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className={fieldStyles.hint}>
            {hint}
          </p>
        )
      )}
    </div>
  )
}

function TextArea({ id, label, error, hint, onChange, value, maxLength, ...rest }) {
  const length = (value ?? "").length
  return (
    <div className="input-group">
      <label htmlFor={id} className="input-label">
        {label}
      </label>
      <textarea
        id={id}
        className={`input-field ${fieldStyles.textarea}`}
        rows={3}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        maxLength={maxLength}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-hint`}
        {...rest}
      />
      <div className={fieldStyles.underField}>
        {error ? (
          <p id={`${id}-hint`} className={fieldStyles.error}>
            {error}
          </p>
        ) : (
          <p id={`${id}-hint`} className={fieldStyles.hint}>
            {hint}
          </p>
        )}
        {maxLength && length > maxLength * 0.8 && (
          <span className={fieldStyles.counter}>
            {length}/{maxLength}
          </span>
        )}
      </div>
    </div>
  )
}
