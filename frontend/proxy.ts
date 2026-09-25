import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Nur relevant für das dedizierte "campspilot"-Vercel-Projekt (Landingpage
 * für neue Kunden, eigene Domain campspilot.vercel.app): dort wird
 * NEXT_PUBLIC_SITE_MODE=campspilot-marketing gesetzt, damit die nackte
 * Domain die Marketingseite zeigt statt des KSV-Anmeldeflows — dem Default
 * für "/" in dieser geteilten Codebase (siehe app/page.tsx / clubConfig.tsx).
 *
 * Auf den bestehenden Projekten "sommercamps" und "jkperformance" bleibt
 * diese Variable unset — dort greift dieser Redirect nie, "/" bleibt exakt
 * wie bisher der jeweilige Anmeldeflow.
 *
 * `proxy.ts` statt `middleware.ts`: Next.js 16 hat die Datei-Konvention
 * umbenannt (middleware.ts ist deprecated, siehe next/dist/docs).
 */
export function proxy(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_SITE_MODE === 'campspilot-marketing') {
    return NextResponse.redirect(new URL('/campspilot', request.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: '/',
}
