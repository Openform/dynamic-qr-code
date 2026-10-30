import localFont from "next/font/local"
import "./globals.css"

// Self-hosted Inter (variable, weights 100–900). See ./fonts/README.md.
const inter = localFont({
  src: "./fonts/InterVariable.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  variable: "--font-inter"
})

export const metadata = {
  title: "QR Go — Dynamic QR Code Generator",
  description:
    "Create branded QR codes, update their destinations anytime and track scans — all from one simple dashboard."
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-scroll-behavior="smooth" className={inter.variable}>
      <body>{children}</body>
    </html>
  )
}
