import { useEffect, useState, useSyncExternalStore } from "react"

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)"

function subscribeToMotionPreference(onChange) {
  const mq = window.matchMedia(REDUCED_MOTION)
  mq.addEventListener("change", onChange)
  return () => mq.removeEventListener("change", onChange)
}

/** True when the visitor has asked their device for less motion. */
export function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribeToMotionPreference,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false
  )
}

/**
 * True while the element is on screen, so looping animations can pause when
 * nobody can see them.
 */
export function useInView(ref) {
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([entry]) =>
      setInView(entry.isIntersecting)
    )
    io.observe(el)
    return () => io.disconnect()
  }, [ref])

  return inView
}
