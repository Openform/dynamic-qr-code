"use client"

import { createContext, useCallback, useContext, useEffect } from "react"

/**
 * Warnings about unsaved work, for links that live outside the screen with
 * the work in it (the sidebar). AppShell provides a guard; editors add to it
 * with useLeaveWarning, and links check it with useConfirmLeave.
 */
export const LeaveGuardContext = createContext(null)

export const UNSAVED_MESSAGE = "You have unsaved changes. Leave without saving them?"

/** The guard AppShell provides: the screen's warnings, if any. */
export function createLeaveGuard() {
  const warnings = new Set()
  let released = false
  return {
    add: (warning) => warnings.add(warning),
    remove: (warning) => warnings.delete(warning),
    /** True when it's fine to leave: nothing is unsaved, or the person agreed to lose it. */
    confirm() {
      const [warning] = warnings
      return !warning || window.confirm(warning.message)
    },
    /** For a full page load after confirm(): the browser needn't ask again. */
    release() {
      released = true
    },
    get released() {
      return released
    }
  }
}

/**
 * While `active`, ask before leaving: the browser's own warning when the tab
 * is closed or reloaded, and `message` when a sidebar link (or a link using
 * useConfirmLeave) is clicked.
 */
export function useLeaveWarning(active, message = UNSAVED_MESSAGE) {
  const guard = useContext(LeaveGuardContext)

  useEffect(() => {
    if (!active) return undefined
    const warn = (event) => {
      if (guard?.released) return
      event.preventDefault()
      event.returnValue = ""
    }
    const warning = { message }
    window.addEventListener("beforeunload", warn)
    guard?.add(warning)
    return () => {
      window.removeEventListener("beforeunload", warn)
      guard?.remove(warning)
    }
  }, [active, message, guard])
}

/**
 * A function that returns true when it's fine to leave the screen: nothing
 * is unsaved, or the person agreed to lose it.
 */
export function useConfirmLeave() {
  const guard = useContext(LeaveGuardContext)
  return useCallback(() => (guard ? guard.confirm() : true), [guard])
}
