import LegalPlaceholder from '../../../components/marketing/LegalPlaceholder'
import { marketingMetadata } from '../seoMetadata'

export async function generateMetadata() {
  return marketingMetadata('/campspilot/datenschutz', 'Datenschutz – CampsPilot', 'Der Datenschutztext von CampsPilot ist noch nicht freigegeben und wird vor der Veröffentlichung ergänzt.')
}

export default function CampsPilotDatenschutzPage() {
  return (
    <div className="cp-scope">
      <LegalPlaceholder title="Datenschutz" />
    </div>
  )
}
