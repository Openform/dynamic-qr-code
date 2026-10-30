/**
 * The site's public name and address, used in search results, link previews,
 * robots.txt and the sitemap.
 *
 * This is fixed rather than read from BASE_URL (which builds QR redirect
 * links) so a build without BASE_URL can never point search engines at
 * localhost.
 */
export const SITE_NAME = "QR Go"
export const SITE_URL = "https://qrgo.co.za"
export const SITE_TITLE = "QR Go — Dynamic QR Code Generator"
export const SITE_DESCRIPTION =
  "Create branded QR codes, update their destinations anytime and track scans — all from one simple dashboard."
