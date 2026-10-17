import { NextRequest } from 'next/server'
import { proxyXlsxExport } from '../../../../../../lib/xlsxExportProxy'

/**
 * Proxy for backend_saas's GET .../camps/{campSlug}/export.xlsx — see
 * proxyXlsxExport's docstring for why this can't be a plain <a href>.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ org: string; campSlug: string }> },
) {
  const { org, campSlug } = await params
  return proxyXlsxExport(
    request,
    `/admin/organizations/${org}/camps/${campSlug}/export.xlsx`,
    'participants',
    view => `${campSlug}-${view}.xlsx`,
  )
}
