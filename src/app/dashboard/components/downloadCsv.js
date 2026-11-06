import { bulkCodesCsv } from "@/lib/bulk"

/**
 * Save a CSV of the given codes (title, short link, destination) as a dated
 * file, e.g. qr-go-codes-2026-11-06.csv. Client-only: it builds a Blob and
 * clicks a temporary link.
 */
export function downloadCodesCsv(codes) {
  const blob = new Blob([bulkCodesCsv(codes)], {
    type: "text/csv;charset=utf-8"
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `qr-go-codes-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
