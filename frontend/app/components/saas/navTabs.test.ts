import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { orgTabs } from './navTabs'

/** Auf 375 px bekommt jeder der acht Bereiche ~46 px (Spalten aus tabs.length, kein Scrollen).
 * Gemessen mit Inter SemiBold 10 px (breiter als Archivo): Training/Mitglied/Zahlung ~ 40 px,
 * Aufgabe ~ 42 px, alle unter den ~44 px Inhaltsbreite bei 360 px; deshalb höchstens 8 Zeichen. */
it('hat acht Org-Bereiche, darunter Spieler, mit eindeutigen kurzen Labels', () => {
  const tabs = orgTabs('demo')
  expect(tabs.map(tab => tab.label)).toEqual(['Übersicht', 'Zahlungen', 'Warteliste', 'Aufgaben', 'Trainings', 'Mitglieder', 'Spieler', 'Einstellungen'])
  expect(tabs.find(tab => tab.label === 'Spieler')?.href).toBe('/pilot/demo/spieler')
  const short = tabs.map(tab => tab.shortLabel ?? tab.label)
  expect(new Set(short).size).toBe(8)
  for (const label of short) expect(label.length, label).toBeLessThanOrEqual(8)
  expect(new Set(tabs.map(tab => tab.href)).size).toBe(8)
})

it('setzt für acht Bereiche kleinere Schrift ohne Innenabstand (CSS-Regel vorhanden)', () => {
  const css = readFileSync('app/components/saas/tokens.css', 'utf8')
  expect(css).toMatch(/\.cp-band-tabs\[data-tab-count='8'\] \.cp-band-tab\s*\{[^}]*font-size:\s*10px[^}]*padding-inline:\s*0/)
})
