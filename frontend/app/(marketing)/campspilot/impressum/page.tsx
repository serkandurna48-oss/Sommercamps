import LegalPlaceholder from '../../../components/marketing/LegalPlaceholder'
import { marketingMetadata } from '../seoMetadata'

export async function generateMetadata() {
  return marketingMetadata('/campspilot/impressum', 'Impressum – CampsPilot', 'Das Impressum von CampsPilot ist noch nicht freigegeben und wird vor der Veröffentlichung ergänzt.')
}

export default function CampsPilotImpressumPage() {
  return (
    <div className="cp-scope">
      <LegalPlaceholder
        title="Impressum"
        note="Das Impressum ist Pflicht, bevor diese Seite öffentlich geht."
      />
    </div>
  )
}
