import { redirect } from 'next/navigation'
import { PAGE } from '../../../components/saas/ui/pageLayout'
import { fetchSalesMe } from '../../../lib/saasAdminApi'
import { getValidAccessToken } from '../../../lib/supabaseServer'
import ImportForm from './ImportForm'

export default async function ImportPage() {
  const token = await getValidAccessToken()
  if (!token) redirect('/platform/login')
  const me = await fetchSalesMe(token)
  if (me?.role !== 'owner') redirect('/vertrieb')
  return (
    <main className={PAGE}>
      <h1 className="cp-title mb-1" style={{ color: 'var(--cp-ink)' }}>Leads importieren</h1>
      <p className="cp-body mb-6 max-w-[680px]" style={{ color: 'var(--cp-muted)' }}>
        Erkannte Spalten: Name/Verein, Ort, Website, Passung (A/B/C), Quelle, Ansprechpartner, Telefon, E-Mail, Typ, Notiz/Anmeldeweg.
        Importierte Leads landen unverteilt im Pool; die Vertriebsleitung verteilt sie. Doppelte Einträge (gleicher Name und Ort) werden übersprungen.
      </p>
      <div className="max-w-[680px]"><ImportForm /></div>
    </main>
  )
}
