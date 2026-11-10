/**
 * Public demo of the parent page (/demo/verein). The real /pilot/[org] pages never pass `demo`,
 * so they behave exactly as before. In demo mode nothing is sent to any API: the registration
 * form answers locally. Plain helpers, no React state, so it is safe in every component.
 */
export const DEMO_PARENT_PATH = '/demo/verein'
export const DEMO_NOT_SAVED_NOTE = 'Demo: nichts wurde gespeichert'

/** Legal links lead nowhere real in the demo club; they jump to the demo notice instead. */
export function demoLegalHref(demo: boolean, realHref: string): string {
  return demo ? `${DEMO_PARENT_PATH}#demo-hinweis` : realHref
}
