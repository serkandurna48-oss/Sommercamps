/**
 * Reine Berechnungslogik für den Einrichtungsfortschritt eines Vereins
 * (Betreiber-Konsole, "Sichtbare offene Einrichtungsschritte mit direktem
 * Link zur jeweiligen Einstellung"). Bewusst berechnet, nicht als eigener
 * DB-Status gespeichert — ein gespeicherter "Schritt X von Y"-Zustand kann
 * mit dem tatsächlichen Datenstand auseinanderlaufen (z. B. wenn jemand
 * ein Logo nachträglich wieder entfernt); die Wahrheit steht immer in den
 * Feldern selbst. Gleiches Prinzip wie dashboardLogic.ts.
 */

import type { OrganizationAdmin } from '../lib/saasAdminApi'

export interface SetupStep {
  id: string
  label: string
  done: boolean
  editPath: string
}

export function computeSetupSteps(org: OrganizationAdmin, campCount: number): SetupStep[] {
  const konfigPath = `/pilot/${org.slug}/konfiguration`
  return [
    {
      id: 'stammdaten',
      label: 'Stammdaten',
      done: Boolean(org.name && org.contact_email && org.contact_person_name),
      editPath: konfigPath,
    },
    {
      id: 'marke',
      label: 'Marke (Logo oder Farbe)',
      done: Boolean(org.logo_url || org.primary_color),
      editPath: konfigPath,
    },
    {
      id: 'website',
      label: 'Website-Inhalte',
      done: Boolean(org.intro_heading || org.intro_text),
      editPath: konfigPath,
    },
    {
      id: 'camp',
      label: 'Erstes Camp',
      done: campCount > 0,
      editPath: `/pilot/${org.slug}/camps/new`,
    },
    {
      id: 'veroeffentlicht',
      label: 'Veröffentlicht',
      done: org.site_published,
      editPath: konfigPath,
    },
  ]
}

export function setupProgressCount(steps: SetupStep[]): { done: number; total: number } {
  return { done: steps.filter(s => s.done).length, total: steps.length }
}
