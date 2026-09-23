import { NextRequest } from 'next/server'
import { proxyXlsxExport } from '../../../../lib/xlsxExportProxy'

/** Org-wide counterpart to camps/[campSlug]/export/route.ts — same proxy
 * reasoning, see proxyXlsxExport's docstring. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ org: string }> }) {
  const { org } = await params
  return proxyXlsxExport(request, `/admin/organizations/${org}/export.xlsx`, 'payments', view => `${org}-${view}.xlsx`)
}
