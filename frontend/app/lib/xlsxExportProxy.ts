import { NextRequest } from 'next/server'
import { getAdminToken } from './adminSession'

function baseUrl(): string {
  return process.env.NEXT_PUBLIC_SAAS_API_URL ?? 'http://localhost:8000'
}

/**
 * Shared body for the org- and camp-level .../export/route.ts Route
 * Handlers (Cleanup nach Review-Fund: beide standen vorher wortgleich,
 * bis auf den Upstream-Pfad und den Default-Dateinamen, in zwei
 * getrennten Dateien).
 *
 * A plain `<a href>` straight to the backend_saas URL would have no
 * Authorization header — the admin token lives in an httpOnly cookie
 * readable only server-side (see adminSession.ts). This same-origin proxy
 * reads it here and forwards it as a Bearer header, then streams the
 * response straight through unchanged.
 */
export async function proxyXlsxExport(
  request: NextRequest,
  upstreamPath: string,
  defaultView: string,
  defaultFilename: (view: string) => string,
): Promise<Response> {
  const token = await getAdminToken()
  if (!token) {
    return new Response('Nicht angemeldet', { status: 401 })
  }

  const view = request.nextUrl.searchParams.get('view') ?? defaultView
  const tokens = request.nextUrl.searchParams.get('tokens')
  const upstreamParams = new URLSearchParams({ view })
  if (tokens) upstreamParams.set('tokens', tokens)

  const upstream = await fetch(`${baseUrl()}${upstreamPath}?${upstreamParams}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  })

  if (!upstream.ok || !upstream.body) {
    return new Response('Export fehlgeschlagen', { status: upstream.status || 502 })
  }

  return new Response(upstream.body, {
    headers: {
      'Content-Type':
        upstream.headers.get('Content-Type') ?? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': upstream.headers.get('Content-Disposition') ?? `attachment; filename="${defaultFilename(view)}"`,
    },
  })
}
