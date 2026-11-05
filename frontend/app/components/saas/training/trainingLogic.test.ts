import { describe, expect, it } from 'vitest'
import {
  buildOfferUrl,
  buildWhatsAppUrl,
  formatEuroInput,
  formatImportError,
  filterMembers,
  formatSessionWhen,
  parseEuroToCents,
  parseOfferInput,
  parseSessionInput,
  paymentMethodLabel,
} from './trainingLogic'

describe('Teilen-Links', () => {
  it('baut die öffentliche Angebots-URL aus Origin, Verein und Angebots-Slug', () => {
    expect(buildOfferUrl('https://campspilot.example', 'ksv', 'einzel-45')).toBe('https://campspilot.example/pilot/ksv/training/einzel-45')
  })

  it('entfernt einen abschließenden Schrägstrich der Origin', () => {
    expect(buildOfferUrl('https://campspilot.example/', 'ksv', 'x')).toBe('https://campspilot.example/pilot/ksv/training/x')
  })

  it('baut den WhatsApp-Link mit kodiertem Text aus Titel – URL', () => {
    const url = 'https://campspilot.example/pilot/ksv/training/einzel-45'
    expect(buildWhatsAppUrl('Einzeltraining & Technik', url)).toBe(
      `https://wa.me/?text=${encodeURIComponent(`Einzeltraining & Technik – ${url}`)}`,
    )
  })
})

describe('Euro-Eingabe', () => {
  it.each([
    ['12', 1200],
    ['12,5', 1250],
    ['12,50', 1250],
    ['12.50', 1250],
    ['0', 0],
    ['0,00', 0],
    [' 35 ', 3500],
    ['1234,99', 123499],
  ])('wandelt %s in %i Cent', (input, cents) => {
    expect(parseEuroToCents(input)).toBe(cents)
  })

  it.each(['', 'abc', '-5', '12,345', '1,2,3', '12 €', '1e3'])('lehnt %j ab', input => {
    expect(parseEuroToCents(input)).toBeNull()
  })

  it('rechnet ohne Gleitkomma-Fehler (19,99 und 1,15)', () => {
    expect(parseEuroToCents('19,99')).toBe(1999)
    expect(parseEuroToCents('1,15')).toBe(115)
  })
})

describe('Euro-Anzeige im Formular', () => {
  it('zeigt Cent als deutsche Eingabe mit Komma', () => {
    expect(formatEuroInput(3000)).toBe('30,00')
    expect(formatEuroInput(4050)).toBe('40,50')
    expect(formatEuroInput(0)).toBe('0,00')
    expect(parseEuroToCents(formatEuroInput(123499))).toBe(123499)
  })
})

describe('Termin-Anzeige aus Berliner Ortszeit', () => {
  it('zeigt local_date und local_time unverändert umformatiert, ohne Zeitzonenrechnung', () => {
    expect(formatSessionWhen('2026-03-29', '18:00')).toBe('29.03.2026, 18:00 Uhr')
    expect(formatSessionWhen('2026-12-01', '09:05')).toBe('01.12.2026, 09:05 Uhr')
  })
})

describe('Zahlart', () => {
  it('benennt bekannte Zahlarten und reicht unbekannte durch', () => {
    expect(paymentMethodLabel('bar')).toBe('Bar')
    expect(paymentMethodLabel('ueberweisung')).toBe('Überweisung')
    expect(paymentMethodLabel(null)).toBe('–')
    expect(paymentMethodLabel('neu')).toBe('neu')
  })
})

describe('Importfehler', () => {
  it('zeigt Zeile, Feld und Code, ohne Namen', () => {
    expect(formatImportError({ row: 3, field: 'geburtsdatum', code: 'invalid_date' })).toBe('Zeile 3: Feld geburtsdatum (invalid_date)')
  })
})

const baseOffer = {
  slug: 'einzel-45', title: ' Einzeltraining ', kind: 'einzel', description: '', duration_minutes: '45',
  location: ' Sportplatz ', price_member_euros: '30', price_nonmember_euros: '40,50', status: 'draft',
}

describe('Angebotsformular', () => {
  it('liefert bereinigte API-Werte', () => {
    const result = parseOfferInput(baseOffer, 'create')
    expect(result).toEqual({
      ok: true,
      value: {
        slug: 'einzel-45', title: 'Einzeltraining', kind: 'einzel', description: null, duration_minutes: 45,
        location: 'Sportplatz', price_member_cents: 3000, price_nonmember_cents: 4050, status: 'draft',
      },
    })
  })

  it('beim Bearbeiten werden slug und kind nicht gesendet', () => {
    const result = parseOfferInput(baseOffer, 'update')
    expect(result.ok && 'slug' in result.value).toBe(false)
    expect(result.ok && 'kind' in result.value).toBe(false)
  })

  it('verlangt Titel, gültigen Slug, Dauer 1–600 und Preise', () => {
    const errors = (patch: Record<string, string>) => {
      const r = parseOfferInput({ ...baseOffer, ...patch }, 'create')
      return r.ok ? [] : Object.keys(r.errors)
    }
    expect(errors({ title: '  ' })).toEqual(['title'])
    expect(errors({ slug: 'Ungültig Slug' })).toEqual(['slug'])
    expect(errors({ slug: '-a' })).toEqual(['slug'])
    expect(errors({ duration_minutes: '0' })).toEqual(['duration_minutes'])
    expect(errors({ duration_minutes: '601' })).toEqual(['duration_minutes'])
    expect(errors({ duration_minutes: '45,5' })).toEqual(['duration_minutes'])
    expect(errors({ price_member_euros: '' })).toEqual(['price_member_euros'])
    expect(errors({ price_nonmember_euros: 'x' })).toEqual(['price_nonmember_euros'])
    expect(errors({ kind: 'sonst' })).toEqual(['kind'])
    expect(errors({ status: 'live' })).toEqual(['status'])
  })

  it('akzeptiert Preis 0 als gültigen Preis', () => {
    const r = parseOfferInput({ ...baseOffer, price_member_euros: '0' }, 'create')
    expect(r.ok && r.value.price_member_cents).toBe(0)
  })
})

describe('Terminformular', () => {
  const base = { date: '2026-11-20', start_time: '17:30', capacity: '', age_min: '', age_max: '', status: 'published' }

  it('Einzel: keine Kapazität im Body, Altersgrenzen optional', () => {
    const r = parseSessionInput(base, 'einzel')
    expect(r).toEqual({ ok: true, value: { date: '2026-11-20', start_time: '17:30', status: 'published' } })
  })

  it('Gruppe: Kapazität 1–8 Pflicht', () => {
    const ok = parseSessionInput({ ...base, capacity: '6' }, 'gruppe')
    expect(ok.ok && ok.value.capacity).toBe(6)
    for (const capacity of ['', '0', '9', 'x', '2,5']) {
      const r = parseSessionInput({ ...base, capacity }, 'gruppe')
      expect(r.ok ? [] : Object.keys(r.errors)).toEqual(['capacity'])
    }
  })

  it('ignoriert eine mitgeschickte Kapazität bei Einzel', () => {
    const r = parseSessionInput({ ...base, capacity: '5' }, 'einzel')
    expect(r.ok && 'capacity' in r.value).toBe(false)
  })

  it('prüft Datum, Uhrzeit und Altersgrenzen', () => {
    const errs = (patch: Record<string, string>) => {
      const r = parseSessionInput({ ...base, ...patch }, 'einzel')
      return r.ok ? [] : Object.keys(r.errors)
    }
    expect(errs({ date: '' })).toEqual(['date'])
    expect(errs({ date: '20.11.2026' })).toEqual(['date'])
    expect(errs({ start_time: '25:00' })).toEqual(['start_time'])
    expect(errs({ start_time: '' })).toEqual(['start_time'])
    expect(errs({ age_min: '10', age_max: '8' })).toEqual(['age_max'])
    expect(errs({ age_min: '-1' })).toEqual(['age_min'])
    expect(parseSessionInput({ ...base, age_min: '6', age_max: '12' }, 'einzel')).toEqual({
      ok: true,
      value: { date: '2026-11-20', start_time: '17:30', status: 'published', age_min: 6, age_max: 12 },
    })
  })
})

describe('Mitgliedersuche im Browser', () => {
  const m = (id: string, first_name: string, last_name: string, active: boolean, member_number: string | null = null) => ({ id, first_name, last_name, member_number, active })
  const members = [m('1', 'Jürgen', 'Müller', true, 'M-17'), m('2', 'Anna-Lena', 'Groß', false), m('3', 'Max', 'Mustermann', true)]

  it('ohne Suchbegriff und Status alle', () => {
    expect(filterMembers(members, '', 'alle')).toHaveLength(3)
  })
  it('findet Umlaute, ß und Bindestrich normalisiert, nach Name oder Nummer', () => {
    expect(filterMembers(members, 'mueller', 'alle').map(x => x.id)).toEqual(['1'])
    expect(filterMembers(members, 'MÜLLER', 'alle').map(x => x.id)).toEqual(['1'])
    expect(filterMembers(members, 'gross', 'alle').map(x => x.id)).toEqual(['2'])
    expect(filterMembers(members, 'annalena', 'alle').map(x => x.id)).toEqual(['2'])
    expect(filterMembers(members, 'm-17', 'alle').map(x => x.id)).toEqual(['1'])
  })
  it('filtert nach Status', () => {
    expect(filterMembers(members, '', 'aktiv').map(x => x.id)).toEqual(['1', '3'])
    expect(filterMembers(members, '', 'inaktiv').map(x => x.id)).toEqual(['2'])
  })
  it('ein Suchbegriff, der zu leer normalisiert, filtert nicht', () => {
    expect(filterMembers(members, '-', 'alle')).toHaveLength(3)
  })
})
