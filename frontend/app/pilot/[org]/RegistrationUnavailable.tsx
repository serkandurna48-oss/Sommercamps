'use client'

import { useState } from 'react'
import type { CampPublic, OrganizationPublic } from '../../lib/saasApi'
import PublicState from './PublicState'

export default function RegistrationUnavailable({ org, camp, onBack }: {
  org: OrganizationPublic
  camp: CampPublic
  onBack: () => void
}) {
  const [now] = useState(() => Date.now())
  const notYetOpen = Boolean(camp.registration_start && Date.parse(camp.registration_start) > now)
  return (
    <PublicState org={org}
      title={notYetOpen ? 'Anmeldung noch nicht geöffnet' : 'Anmeldung geschlossen'}
      message={notYetOpen ? 'Die Anmeldung für dieses Camp hat noch nicht begonnen.' : 'Die Anmeldung für dieses Camp ist derzeit geschlossen.'}
      instruction="Bitte sehen Sie sich die anderen Camps des Vereins an."
    >
      <button type="button" className="btn primary btn-pill" onClick={onBack}>Alle Camps ansehen</button>
    </PublicState>
  )
}
