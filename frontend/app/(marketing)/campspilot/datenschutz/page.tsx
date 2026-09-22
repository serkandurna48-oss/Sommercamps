import type { Metadata } from 'next'
import LegalPlaceholder from '../../../components/marketing/LegalPlaceholder'

export const metadata: Metadata = {
  title: 'Datenschutz – CampsPilot',
  description: 'Datenschutzerklärung von CampsPilot.',
}

export default function CampsPilotDatenschutzPage() {
  return (
    <div className="cp-scope">
      <LegalPlaceholder title="Datenschutz" />
    </div>
  )
}
