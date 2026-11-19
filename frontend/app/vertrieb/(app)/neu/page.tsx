import { PAGE } from '../../../components/saas/ui/pageLayout'
import { NewLeadForm } from '../LeadForms'

export default function NewLeadPage() {
  return (
    <main className={PAGE}>
      <h1 className="cp-title mb-1" style={{ color: 'var(--cp-ink)' }}>Neuer Lead</h1>
      <p className="cp-body mb-6 max-w-[640px]" style={{ color: 'var(--cp-muted)' }}>
        Verein oder Fußballschule, die ihr ansprechen wollt. Als Vertriebler bist du automatisch zuständig.
      </p>
      <div className="max-w-[760px]"><NewLeadForm /></div>
    </main>
  )
}
