import "./globals.css"

export const metadata = {
  title: "QRFlow — Dynamic QR Code Generator",
  description:
    "Create, manage, and track dynamic QR codes. Change destinations anytime without reprinting."
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  )
}
