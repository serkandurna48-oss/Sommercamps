import LegalPlaceholder from '../../../components/marketing/LegalPlaceholder'
import { marketingMetadata } from '../seoMetadata'

export async function generateMetadata() {
  return marketingMetadata('/campspilot/teilnahmebedingungen', 'Teilnahmebedingungen – CampsPilot', 'Die Teilnahmebedingungen von CampsPilot sind noch nicht freigegeben und werden vor der Veröffentlichung ergänzt.')
}

export default function CampsPilotTeilnahmebedingungenPage() {
  return (
    <div className="cp-scope">
      <LegalPlaceholder title="Teilnahmebedingungen" />
    </div>
  )
}
