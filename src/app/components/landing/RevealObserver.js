"use client"

import { useEffect } from "react"

/**
 * Fades sections in as they scroll into view.
 *
 * Elements opt in with a `data-reveal` attribute; this marks each one with
 * `data-shown` the first time it comes on screen, and the page's CSS animates
 * that change. Content stays visible if JavaScript never runs, and anything
 * already on screen when the page loads is shown straight away.
 */
export default function RevealObserver() {
  useEffect(() => {
    const root = document.documentElement
    const els = Array.from(document.querySelectorAll("[data-reveal]"))
    const show = (el) => el.setAttribute("data-shown", "")

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      els.forEach(show)
      return
    }

    // Show what is already visible before hiding the rest, so nothing on
    // screen blinks out.
    const pending = []
    for (const el of els) {
      const { top, bottom } = el.getBoundingClientRect()
      if (top < window.innerHeight && bottom > 0) show(el)
      else pending.push(el)
    }
    root.setAttribute("data-reveal", "")

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          show(entry.target)
          io.unobserve(entry.target)
        }
      },
      { rootMargin: "0px 0px -12% 0px" }
    )
    pending.forEach((el) => io.observe(el))

    return () => {
      io.disconnect()
      root.removeAttribute("data-reveal")
    }
  }, [])

  return null
}
