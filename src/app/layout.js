import "./globals.css"

export const metadata = {
  title: "QR Go — Dynamic QR Code Generator",
  description:
    "Create branded QR codes, update their destinations anytime and track scans — all from one simple dashboard."
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,200..800&display=swap"
          rel="stylesheet"
        ></link>
      </head>
      <body>{children}</body>
    </html>
  )
}
