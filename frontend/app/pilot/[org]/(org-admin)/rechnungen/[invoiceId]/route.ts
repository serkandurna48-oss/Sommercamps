import { getAdminToken } from '../../../../../lib/adminSession'

function baseUrl(): string {
  return process.env.NEXT_PUBLIC_SAAS_API_URL ?? 'http://localhost:8000'
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * Same-origin PDF download. The admin token lives in the httpOnly cookie
 * cp_admin_token (see xlsxExportProxy). Tenant checks happen in the backend.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ org: string; invoiceId: string }> }) {
  const { org, invoiceId } = await params
  if (!SLUG.test(org) || !UUID.test(invoiceId)) return new Response('Nicht gefunden', { status: 404 })
  const token = await getAdminToken()
  if (!token) return new Response('Nicht angemeldet', { status: 401 })
  const upstream = await fetch(`${baseUrl()}/admin/organizations/${org}/invoices/${invoiceId}/pdf`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  })
  if (!upstream.ok || !upstream.body) {
    return new Response('Rechnung nicht verfügbar', { status: upstream.status === 404 ? 404 : 502 })
  }
  return new Response(upstream.body, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': upstream.headers.get('Content-Disposition') ?? 'attachment; filename="rechnung.pdf"',
      'Cache-Control': 'no-store',
    },
  })
}
