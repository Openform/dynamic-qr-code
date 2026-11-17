import localFont from "next/font/local"

// The fonts a campaign page can use for its headings and text, self-hosted
// like Inter (see src/app/fonts/README.md), so no page ever calls a font
// service. None is preloaded: a browser only downloads the ones a page's
// theme and font choices actually use. Each sets a CSS variable that
// lib/pageTheme.js builds its font stacks from. next/font needs each call
// written out in full.

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

const playfairDisplay = localFont({
  src: "../../fonts/PlayfairDisplayVariable.woff2",
  weight: "400 900",
  style: "normal",
  display: "swap",
  preload: false,
  variable: "--font-playfair-display"
})

const outfit = localFont({
  src: "../../fonts/OutfitVariable.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  preload: false,
  variable: "--font-outfit"
})

const nunito = localFont({
  src: "../../fonts/NunitoVariable.woff2",
  weight: "200 1000",
  style: "normal",
  display: "swap",
  preload: false,
  variable: "--font-nunito"
})

const oswald = localFont({
  src: "../../fonts/OswaldVariable.woff2",
  weight: "200 700",
  style: "normal",
  display: "swap",
  preload: false,
  variable: "--font-oswald"
})

const caveat = localFont({
  src: "../../fonts/CaveatVariable.woff2",
  weight: "400 700",
  style: "normal",
  display: "swap",
  preload: false,
  variable: "--font-caveat"
})

const lora = localFont({
  src: "../../fonts/LoraVariable.woff2",
  weight: "400 700",
  style: "normal",
  display: "swap",
  preload: false,
  variable: "--font-lora"
})

/** Classes that define every campaign font's CSS variable for a page. */
export const campaignFontClasses = [spaceGrotesk, fraunces, playfairDisplay, outfit, nunito, oswald, caveat, lora]
  .map((font) => font.variable)
  .join(" ")
