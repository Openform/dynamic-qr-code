"use client"

import { useEffect, useState } from "react"
import { CheckIcon, CopyIcon } from "@/app/components/icons"

/**
 * Copies an offer's promo code. The only part of a campaign page that needs
 * JavaScript; without it the code is still there to read and select.
 */
export default function CopyCodeButton({ code, className }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return undefined
    const timer = setTimeout(() => setCopied(false), 2500)
    return () => clearTimeout(timer)
  }, [copied])

  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
    } catch {
      // No clipboard access (an old in-app browser, say): the code can still
      // be selected by hand, and the box selects it all on one tap.
      setCopied(false)
    }
  }

  return (
    <button type="button" className={className} onClick={copy}>
      {copied ? <CheckIcon size={18} /> : <CopyIcon size={18} />}
      <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
    </button>
  )
}
