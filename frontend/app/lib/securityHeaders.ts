/**
 * Security headers for every response (mystery-shopper finding 18.11.2026:
 * only HSTS was set). Applied in next.config.ts.
 *
 * The CSP is deliberately limited to rules that cannot break rendering:
 * who may frame us, where forms may post, no plugins, no <base> hijack.
 * A script/style policy needs nonces and a report-only phase (planned for v3).
 */
export const CONTENT_SECURITY_POLICY = [
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ')

export const SECURITY_HEADERS: ReadonlyArray<{ key: string; value: string }> = [
  // Older browsers; newer ones use frame-ancestors above.
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Booking links carry a token in the path: never send the path to other sites.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // The app uses none of these. Clipboard (copy buttons) stays allowed.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
  { key: 'Content-Security-Policy', value: CONTENT_SECURITY_POLICY },
]
