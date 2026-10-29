import { GlobeIcon } from "@/app/components/icons"
import { flag } from "./format"

const globeStyle = { verticalAlign: "-0.125em", color: "var(--text-tertiary)" }

/** The country's flag, or a globe icon when the country isn't known. */
export default function CountryFlag({ code }) {
  return flag(code) || <GlobeIcon size="1em" strokeWidth={1.75} style={globeStyle} />
}
