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
 * das Feld (ältere Antwort, Organisation nicht geladen), gilt wie im Backend nur `camps`
 * (fail closed). So kann z. B. die Plattform-Konsole nie versehentlich alles vorbelegen.
 */
export function orgModules(org: { modules?: readonly string[] | null } | null | undefined): OrgModule[] {
  return normalizeModules(org?.modules ?? [])
}

export function hasModule(org: { modules?: readonly string[] | null } | null | undefined, module: OrgModule): boolean {
  return orgModules(org).includes(module)
}
