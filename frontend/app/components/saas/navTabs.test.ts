import { expect, it } from 'vitest'
import { activeTabHref, adminNav, adminNavFooter, adminNavItems, campTabs } from './navTabs'

/** Launch-UX: grouped sidebar instead of eight band tabs. */
it('gruppiert die Seitenleiste wie im Brief: Übersicht, Angebote, Teilnehmer, Zahlungen/Aufgaben', () => {
  const groups = adminNav('demo')
  expect(groups.map(group => group.label ?? null)).toEqual([null, 'Angebote', 'Teilnehmer', null])
  expect(groups.map(group => group.items.map(item => item.label))).toEqual([
    ['Übersicht'],
    ['Camps', 'Trainings'],
    ['Anmeldungen', 'Warteliste', 'Spieler', 'Mitglieder'],
    ['Zahlungen', 'Aufgaben'],
  ])
  expect(adminNavFooter('demo').map(item => item.label)).toEqual(['Einstellungen', 'Hilfe'])
  const hrefs = adminNavItems('demo').map(item => item.href)
  expect(new Set(hrefs).size).toBe(hrefs.length)
  expect(hrefs.every(href => href.startsWith('/pilot/demo/'))).toBe(true)
  expect(groups.every(group => !group.label || group.id)).toBe(true)
})

it('behält alle bisherigen Bereichs-URLs und ergänzt die Campliste', () => {
  const hrefs = adminNavItems('demo').map(item => item.href)
  for (const path of ['dashboard', 'zahlungen', 'warteliste', 'aufgaben', 'trainings', 'mitglieder', 'spieler', 'konfiguration', 'anmeldungen', 'hilfe', 'camps']) {
    expect(hrefs).toContain(`/pilot/demo/${path}`)
  }
})

it('Camp-Reiter bleiben fünf Ziele mit den Einstellungen zuletzt', () => {
  expect(campTabs('demo', 'herbst').map(tab => tab.label)).toEqual(['Teilnehmer', 'Zahlungen', 'Warteliste', 'Aufgaben', 'Einstellungen'])
})

it('markiert auf Unterseiten den übergeordneten Bereich (längster Präfix)', () => {
  const org = adminNavItems('demoverein').map(tab => tab.href)
  expect(activeTabHref('/pilot/demoverein/trainings/abc', org)).toBe('/pilot/demoverein/trainings')
  expect(activeTabHref('/pilot/demoverein/spieler/123', org)).toBe('/pilot/demoverein/spieler')
  expect(activeTabHref('/pilot/demoverein/camps/sommer/zahlungen', org)).toBe('/pilot/demoverein/camps')
  expect(activeTabHref('/pilot/demoverein/camps/new', org)).toBe('/pilot/demoverein/camps')
  expect(activeTabHref('/pilot/demoverein/spielerliste', org)).toBeUndefined()
  expect(activeTabHref('/pilot/demoverein/einrichtung', org)).toBeUndefined()
  const camp = ['/pilot/v/camps/c', '/pilot/v/camps/c/zahlungen']
  expect(activeTabHref('/pilot/v/camps/c/zahlungen', camp)).toBe('/pilot/v/camps/c/zahlungen')
  expect(activeTabHref('/pilot/v/camps/c', camp)).toBe('/pilot/v/camps/c')
})
