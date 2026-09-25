import type { Metadata } from 'next'
import LegalPlaceholder from '../../../components/marketing/LegalPlaceholder'

export const metadata: Metadata = {
  title: 'Teilnahmebedingungen – CampsPilot',
  description: 'Teilnahmebedingungen von CampsPilot.',
}

export default function CampsPilotTeilnahmebedingungenPage() {
  return (
    <div className="cp-scope">
      <LegalPlaceholder title="Teilnahmebedingungen" />
    </div>
  )
}
