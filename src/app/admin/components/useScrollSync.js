"use client"

import { useCallback, useEffect, useLayoutEffect, useRef } from "react"
import { buildScrollAnchors, mapScroll } from "@/lib/scrollSync"

// Text styles the hidden copy of the text box needs, so its lines wrap the same.
const MIRRORED_STYLES = [
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "lineHeight",
  "letterSpacing",
  "wordSpacing",
  "textTransform",
  "tabSize",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "wordBreak"
]

/**
 * Where each wanted line starts in the text box (px from the top of the text),
 * allowing for long lines wrapping. Measured with a hidden copy of the text
 * box laid out one line per row.
 */
function measureLineTops(textarea, lineNumbers) {
  const style = window.getComputedStyle(textarea)
  const mirror = document.createElement("div")
  for (const name of MIRRORED_STYLES) mirror.style[name] = style[name]
  Object.assign(mirror.style, {
    position: "absolute",
    top: "0",
    left: "-9999px",
    visibility: "hidden",
    boxSizing: "border-box",
    // clientWidth leaves out the scrollbar, like the text area's own wrapping.
    width: `${textarea.clientWidth}px`,
    border: "0",
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word"
  })

  const rows = textarea.value.split("\n").map((line) => {
    const row = document.createElement("div")
    row.textContent = line || "​" // an empty line still takes up a row
    mirror.appendChild(row)
    return row
  })
  document.body.appendChild(mirror)

  const paddingTop = parseFloat(style.paddingTop) || 0
  const tops = new Map()
  for (const line of lineNumbers) {
    if (rows[line]) tops.set(line, rows[line].offsetTop - paddingTop)
  }
  mirror.remove()
  return tops
}

/** Pair each preview block (marked with data-line) with its line in the editor. */
function computeAnchors(editor, preview) {
  const blocks = [...preview.querySelectorAll("[data-line]")].map((element) => ({
    element,
    line: Number(element.dataset.line)
  }))
  // The first block sits at the top of both panes already; leaving it out lets
  // the preview's title and date scroll past smoothly.
  const wanted = blocks.filter((block) => block.line > 0)
  const editorTops = measureLineTops(editor, wanted.map((block) => block.line))
  const previewPadding = parseFloat(window.getComputedStyle(preview).paddingTop) || 0

  const points = wanted
    .filter((block) => editorTops.has(block.line))
    .map((block) => [editorTops.get(block.line), block.element.offsetTop - previewPadding])

  return buildScrollAnchors(
    points,
    editor.scrollHeight - editor.clientHeight,
    preview.scrollHeight - preview.clientHeight
  )
}

/**
 * Keep the editor (a textarea) and its preview scrolled to the same part of
 * the page: scrolling either one moves the other. `content` is the text the
 * preview is showing; when it changes, positions are re-measured and the
 * preview follows the editor. The preview must be position: relative so its
 * blocks' offsetTop is measured from it.
 */
export function useScrollSync(editorRef, previewRef, { enabled, content }) {
  const anchorsRef = useRef(null)
  // The scroll position we last set on each pane, so the scroll event that
  // causes isn't treated as the person scrolling (which would loop back).
  const expectedRef = useRef({ editor: null, preview: null })

  const sync = useCallback(
    (from) => {
      const editor = editorRef.current
      const preview = previewRef.current
      if (!editor || !preview) return
      if (!anchorsRef.current) anchorsRef.current = computeAnchors(editor, preview)

      const fromEditor = from === "editor"
      const source = fromEditor ? editor : preview
      const target = fromEditor ? preview : editor
      const next = Math.round(mapScroll(anchorsRef.current, source.scrollTop, fromEditor ? 0 : 1))
      if (Math.abs(target.scrollTop - next) < 1) return
      target.scrollTop = next
      expectedRef.current[fromEditor ? "preview" : "editor"] = target.scrollTop
    },
    [editorRef, previewRef]
  )

  useEffect(() => {
    const editor = editorRef.current
    const preview = previewRef.current
    if (!enabled || !editor || !preview) return

    let frame = 0
    let pendingFrom = null
    const listen = (pane, element) => () => {
      const expected = expectedRef.current[pane]
      expectedRef.current[pane] = null
      if (expected !== null && Math.abs(element.scrollTop - expected) < 2) return
      // At most one sync per frame, from whichever pane moved last.
      pendingFrom = pane
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0
          sync(pendingFrom)
        })
      }
    }
    const onEditorScroll = listen("editor", editor)
    const onPreviewScroll = listen("preview", preview)
    editor.addEventListener("scroll", onEditorScroll, { passive: true })
    preview.addEventListener("scroll", onPreviewScroll, { passive: true })

    // Wrapping changes when a pane is resized or the web font finishes loading.
    const invalidate = () => {
      anchorsRef.current = null
    }
    const observer = new ResizeObserver(invalidate)
    observer.observe(editor)
    observer.observe(preview)
    document.fonts?.ready.then(invalidate)

    return () => {
      editor.removeEventListener("scroll", onEditorScroll)
      preview.removeEventListener("scroll", onPreviewScroll)
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [enabled, sync, editorRef, previewRef])

  // The preview has re-rendered (typing, another page): re-measure and line
  // the preview up with the editor again.
  useLayoutEffect(() => {
    anchorsRef.current = null
    if (enabled) sync("editor")
  }, [content, enabled, sync])
}
