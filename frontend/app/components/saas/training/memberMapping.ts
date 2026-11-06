/**
 * Spaltenzuordnung für den Mitglieder-Import. Reine Logik, läuft im Browser;
 * Zellinhalte werden weder geloggt noch gesendet, außer als CSV-Text beim Import.
 */
import type { MemberImportMapping } from '../../../lib/saasAdminApi'

export type ColumnTarget = 'first_name' | 'last_name' | 'birth_date' | 'member_number' | 'extra' | 'skip'

export interface ColumnChoice {
  target: ColumnTarget
  /** Label für Zusatzfelder (Standard: Spaltenname). */
  label: string
  /** Spaltenname deutet auf Gesundheits-, Adress- oder Kontaktdaten hin. */
  sensitive: boolean
}

/** Grenzen wie im Backend (membership_csv.py). */
export const MAX_EXTRA_FIELDS = 10
export const MAX_EXTRA_LABEL_LEN = 40

export const TARGET_LABELS: Record<ColumnTarget, string> = {
  first_name: 'Vorname',
  last_name: 'Nachname',
  birth_date: 'Geburtsdatum',
  member_number: 'Mitgliedsnummer',
  extra: 'Zusatzfeld',
  skip: 'Nicht importieren',
}

export const TARGET_ORDER: ColumnTarget[] = ['first_name', 'last_name', 'birth_date', 'member_number', 'extra', 'skip']

const REQUIRED: ColumnTarget[] = ['first_name', 'last_name', 'birth_date']

/** Kleinbuchstaben, Umlaute ausgeschrieben, nur a-z/0-9: "Geb.-Datum" -> "gebdatum". */
export function normalizeHeader(header: string): string {
  return header.toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '')
}

/** Exakte Namen haben Vorrang vor Aliasen (z. B. "Nachname" vor "Name"). */
const EXACT: Record<string, ColumnTarget> = {
  vorname: 'first_name', nachname: 'last_name', geburtsdatum: 'birth_date', mitgliedsnummer: 'member_number',
}

const ALIASES: Record<string, ColumnTarget> = {
  firstname: 'first_name', rufname: 'first_name', vornamen: 'first_name',
  name: 'last_name', familienname: 'last_name', lastname: 'last_name', surname: 'last_name', zuname: 'last_name',
  gebdatum: 'birth_date', geburtstag: 'birth_date', geb: 'birth_date', gebdat: 'birth_date', geboren: 'birth_date',
  geburtsdat: 'birth_date', birthdate: 'birth_date', dateofbirth: 'birth_date', birthday: 'birth_date',
  mitglnr: 'member_number', mitgliedsnr: 'member_number', mitgliednr: 'member_number', nr: 'member_number',
  mitgliedernummer: 'member_number', mitgliedernr: 'member_number', membernumber: 'member_number',
}

const SENSITIVE = ['krank', 'allerg', 'medikament', 'diagnose', 'adresse', 'strasse', 'plz', 'telefon', 'handy', 'mobil', 'email']

/** Gesundheits-, Adress- oder Kontaktdaten am Spaltennamen erkennen (Hinweis, kein Verbot). */
export function isSensitiveHeader(header: string): boolean {
  const key = normalizeHeader(header)
  return SENSITIVE.some(word => key.includes(word))
}

/** Vorschlag je Spalte. Unbekannte Spalten: "Nicht importieren" (Datensparsamkeit),
 * sensible Spalten immer "Nicht importieren". Jedes Standardziel höchstens einmal. */
export function suggestMapping(header: string[]): ColumnChoice[] {
  const choices: ColumnChoice[] = header.map(name => ({
    target: 'skip', label: name.trim().slice(0, MAX_EXTRA_LABEL_LEN), sensitive: isSensitiveHeader(name),
  }))
  const used = new Set<ColumnTarget>()
  for (const table of [EXACT, ALIASES]) {
    header.forEach((name, index) => {
      const choice = choices[index]
      if (choice.sensitive || choice.target !== 'skip') return
      const target = table[normalizeHeader(name)]
      if (target && !used.has(target)) {
        choice.target = target
        used.add(target)
      }
    })
  }
  return choices
}

/** Deutsche Meldungen; leer = gültig. */
export function validateMapping(choices: ColumnChoice[]): string[] {
  const errors: string[] = []
  for (const target of REQUIRED) {
    const count = choices.filter(choice => choice.target === target).length
    if (count === 0) errors.push(`Bitte eine Spalte als ${TARGET_LABELS[target]} zuordnen.`)
    if (count > 1) errors.push(`${TARGET_LABELS[target]} ist mehreren Spalten zugeordnet – bitte nur eine wählen.`)
  }
  if (choices.filter(choice => choice.target === 'member_number').length > 1) {
    errors.push('Mitgliedsnummer ist mehreren Spalten zugeordnet – bitte nur eine wählen.')
  }
  const extras = choices.filter(choice => choice.target === 'extra')
  if (extras.length > MAX_EXTRA_FIELDS) errors.push(`Höchstens ${MAX_EXTRA_FIELDS} Zusatzfelder pro Import.`)
  const labels = extras.map(choice => cleanLabel(choice.label))
  if (labels.some(label => label === '')) errors.push('Jedes Zusatzfeld braucht eine Bezeichnung.')
  if (labels.some(label => label.length > MAX_EXTRA_LABEL_LEN)) errors.push(`Bezeichnungen von Zusatzfeldern höchstens ${MAX_EXTRA_LABEL_LEN} Zeichen.`)
  const folded = labels.filter(Boolean).map(label => label.toLowerCase())
  const reserved = new Set(['vorname', 'nachname', 'geburtsdatum', 'mitgliedsnummer'])
  if (new Set(folded).size !== folded.length || folded.some(label => reserved.has(label))) {
    errors.push('Bezeichnungen von Zusatzfeldern müssen eindeutig sein und dürfen kein Standardfeld heißen.')
  }
  return errors
}

function cleanLabel(label: string): string {
  return label.split(/\s+/).filter(Boolean).join(' ')
}

/** Zuordnung im API-Format {Spaltenindex: Ziel}. */
export function toApiMapping(choices: ColumnChoice[]): MemberImportMapping {
  return Object.fromEntries(choices.map((choice, index) => [
    String(index),
    choice.target === 'skip' ? null : choice.target === 'extra' ? { extra: cleanLabel(choice.label) } : choice.target,
  ]))
}
