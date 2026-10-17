// Richtung C "Hybrid Matchday" — one variable family (Archivo) carries the
// entire type scale in Abschnitt 3.2 of the CampsPilot design order. Scoped
// to the new org-admin screens only (via the className this exports, applied
// in (org-admin)/layout.tsx) — never touches the parent-facing /pilot/[org]
// flow, which keeps its own Oswald/Work Sans pairing (see pilot/layout.tsx).
import { Archivo } from 'next/font/google'

export const archivo = Archivo({
  variable: '--font-cp',
  subsets: ['latin'],
  axes: ['wdth'],
  display: 'swap',
})
