import type { Metadata } from 'next'
import LegalPlaceholder from '../../../components/marketing/LegalPlaceholder'

export const metadata: Metadata = {
  title: 'Impressum – CampsPilot',
  description: 'Impressum von CampsPilot.',
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
