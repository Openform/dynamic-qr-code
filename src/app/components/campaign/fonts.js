import localFont from "next/font/local"

// The campaign page themes' heading fonts, self-hosted like Inter (see
// src/app/fonts/README.md). Not preloaded: a browser only downloads one
// when a page's theme or font actually uses it.
const spaceGrotesk = localFont({
  src: "../../fonts/SpaceGroteskVariable.woff2",
  weight: "300 700",
  style: "normal",
  display: "swap",
  preload: false,
  variable: "--font-space-grotesk"
})

const fraunces = localFont({
  src: "../../fonts/FrauncesVariable.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  preload: false,
  variable: "--font-fraunces"
})

/** Classes that define --font-space-grotesk and --font-fraunces for a page. */
export const campaignFontClasses = `${spaceGrotesk.variable} ${fraunces.variable}`
