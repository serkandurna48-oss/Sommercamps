/**
 * Module je Verein (organizations.modules, Backend app/modules.py).
 *
 * `camps` ist immer an. `trainings`, `members` und `players` schaltet nur der
 * Platform-Owner frei. Die Oberfläche blendet gesperrte Bereiche aus; die
 * eigentliche Grenze bleibt das Backend (Admin 403 `module_disabled`,
 * öffentlich 404).
 */
export type OrgModule = 'camps' | 'trainings' | 'members' | 'players'

export const ALL_MODULES: readonly OrgModule[] = ['camps', 'trainings', 'members', 'players']

export const MODULE_LABELS: Record<OrgModule, string> = {
  camps: 'Camps',
  trainings: 'Trainings (Einzel- und Gruppentraining)',
  members: 'Mitgliederliste (Mitgliederpreis)',
  players: 'Spielerakte (Notizen, Ziele, Messwerte)',
}

/** Bekannte Module in fester Reihenfolge, camps immer dabei. */
export function normalizeModules(values: readonly string[]): OrgModule[] {
  const present = new Set(values)
  return ALL_MODULES.filter(m => m === 'camps' || present.has(m))
}

/**
 * Module eines Vereins für die Oberfläche. Das Backend liefert `modules` immer mit; fehlt
 * das Feld (ältere Antwort, Test-Fixture, Organisation nicht geladen), zeigt die Oberfläche
 * alles wie vor der Modul-Einführung. Das ist unkritisch, weil das Backend gesperrte Module
 * selbst ablehnt und die Seiten dann den Modul-Hinweis zeigen.
 */
export function orgModules(org: { modules?: readonly string[] | null } | null | undefined): OrgModule[] {
  const values = org?.modules
  return values ? normalizeModules(values) : [...ALL_MODULES]
}

export function hasModule(org: { modules?: readonly string[] | null } | null | undefined, module: OrgModule): boolean {
  return orgModules(org).includes(module)
}
