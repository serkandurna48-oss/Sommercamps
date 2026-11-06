import { describe, expect, it } from 'vitest'
import type { PlayerBooking, PlayerMeasurement, PlayerSummary } from '../../../lib/saasAdminApi'
import {
  FOCUS_OPTIONS, ageFromBirthDate, buildMetricSeries, filterPlayers, focusLabel, formatDay, formatMeasurement,
  formatDelta, goalsOpenFirst, hasDocumentationConsent, isLowerBetter, lastTrainingDate, metricLabel, metricTrend, parseGoalInput, parseMeasurementInput, parseNoteInput,
  parseQuickPrefill, ratingDots, scaleSeries, validateVideoUrl,
} from './playerLogic'

const booking = (patch: Partial<PlayerBooking>): PlayerBooking => ({
  registration_id: 'r1', camp_id: 'c1', kind: 'training', camp_title: 'Einzeltraining', offer_title: 'Technik',
  local_date: '2027-03-29', local_time: '18:00', status: 'confirmed', payment_status: 'paid', documentation_consent: true, ...patch,
})
const measurement = (patch: Partial<PlayerMeasurement>): PlayerMeasurement => ({
  id: 'm', player_id: 'p', measured_on: '2027-01-01', metric: 'sprint_10m', value: 2, unit: 's', note: null,
  created_at: '', updated_at: '', ...patch,
})
const summary = (patch: Partial<PlayerSummary>): PlayerSummary => ({
  id: 'p', first_name: 'Lena', last_name: 'Mustermann', birth_date: '2015-03-04', age: 11, last_booking_at: null,
  booking_count: 0, note_count: 0, open_goal_count: 0, ...patch,
})

describe('Alter', () => {
  it('zählt volle Jahre und beachtet den Geburtstag', () => {
    expect(ageFromBirthDate('2015-03-04', '2027-03-03')).toBe(11)
    expect(ageFromBirthDate('2015-03-04', '2027-03-04')).toBe(12)
    expect(ageFromBirthDate('2016-02-29', '2027-02-28')).toBe(10)
    expect(ageFromBirthDate('2016-02-29', '2027-03-01')).toBe(11)
  })
  it('liefert null bei ungültigem Datum', () => {
    expect(ageFromBirthDate('kaputt', '2027-03-04')).toBeNull()
  })
})

describe('Fokus', () => {
  it('bildet alle sechs Werte auf deutsche Bezeichnungen ab', () => {
    expect(FOCUS_OPTIONS.map(o => o.value)).toEqual(['technik', 'athletik', 'taktik', 'mental', 'video', 'sonstiges'])
    expect(focusLabel('technik')).toBe('Technik')
    expect(focusLabel('athletik')).toBe('Athletik')
    expect(focusLabel('taktik')).toBe('Taktik')
    expect(focusLabel('mental')).toBe('Mental')
    expect(focusLabel('video')).toBe('Video')
    expect(focusLabel('sonstiges')).toBe('Sonstiges')
  })
  it('lässt unbekannte Werte unverändert', () => {
    expect(focusLabel('neu' as never)).toBe('neu')
  })
})

describe('Video-Link', () => {
  it('akzeptiert nur https', () => {
    expect(validateVideoUrl('https://www.youtube.com/watch?v=abc')).toBeNull()
    expect(validateVideoUrl('  https://vimeo.com/1 ')).toBeNull()
    expect(validateVideoUrl('')).toBeNull()
    for (const bad of ['http://x.de/v', 'javascript:alert(1)', 'ftp://x.de', 'https://', 'https://a b.de', 'www.x.de', 'data:text/html,x']) {
      expect(validateVideoUrl(bad), bad).toMatch(/https/)
    }
  })
})

describe('Schnellerfassung vorbelegen', () => {
  const bookings = [booking({ camp_id: 'c1', local_date: '2027-03-29', local_time: '18:00' }), booking({ camp_id: 'c2', local_date: '2027-03-01', local_time: null, kind: 'camp', camp_title: 'Frühjahrscamp' })]
  it('nimmt Datum und camp_id des Termins', () => {
    expect(parseQuickPrefill({ neu: '1', termin: 'c1' }, bookings, '2027-04-02')).toEqual({ open: true, date: '2027-03-29', campId: 'c1' })
  })
  it('fällt ohne bekannten Termin auf heute zurück', () => {
    expect(parseQuickPrefill({ neu: '1', termin: 'unbekannt' }, bookings, '2027-04-02')).toEqual({ open: true, date: '2027-04-02', campId: null })
    expect(parseQuickPrefill({ neu: '1' }, bookings, '2027-04-02')).toEqual({ open: true, date: '2027-04-02', campId: null })
  })
  it('ohne neu=1 nur Standardwerte, Arrays und Fremdtypen werden ignoriert', () => {
    expect(parseQuickPrefill({}, bookings, '2027-04-02')).toEqual({ open: false, date: '2027-04-02', campId: null })
    expect(parseQuickPrefill({ neu: ['1', '1'], termin: ['c1'] }, bookings, '2027-04-02')).toEqual({ open: false, date: '2027-04-02', campId: null })
    expect(parseQuickPrefill(undefined, bookings, '2027-04-02').open).toBe(false)
  })
})

describe('Doku-Einwilligung', () => {
  it('prüft die jüngste Buchung', () => {
    expect(hasDocumentationConsent([booking({ documentation_consent: true })])).toBe(true)
    expect(hasDocumentationConsent([booking({ documentation_consent: false }), booking({ documentation_consent: true })])).toBe(false)
    expect(hasDocumentationConsent([booking({ documentation_consent: null })])).toBe(false)
    expect(hasDocumentationConsent([])).toBe(false)
  })
  it('überspringt stornierte Buchungen', () => {
    expect(hasDocumentationConsent([booking({ status: 'cancelled', documentation_consent: false }), booking({ documentation_consent: true })])).toBe(true)
  })
})

describe('Messwert-Verlauf', () => {
  it('sortiert aufsteigend nach Datum und filtert die Metrik', () => {
    const series = buildMetricSeries([
      measurement({ id: 'b', measured_on: '2027-02-01', value: 2.1 }),
      measurement({ id: 'a', measured_on: '2027-01-01', value: 2.3 }),
      measurement({ id: 'x', metric: 'standweitsprung', unit: 'cm', value: 150 }),
    ], 'sprint_10m')
    expect(series.map(p => p.id)).toEqual(['a', 'b'])
  })
  it('skaliert in die Zeichenfläche, Zeit proportional, y nach oben = größer', () => {
    const pts = scaleSeries([{ date: '2027-01-01', value: 10 }, { date: '2027-01-11', value: 20 }, { date: '2027-01-21', value: 15 }], { width: 200, height: 100, pad: 10 })
    expect(pts.map(p => [p.x, p.y])).toEqual([[10, 90], [100, 10], [190, 50]])
  })
  it('zentriert einen einzelnen Punkt und eine flache Reihe', () => {
    expect(scaleSeries([{ date: '2027-01-01', value: 5 }], { width: 200, height: 100, pad: 10 }).map(p => [p.x, p.y])).toEqual([[100, 50]])
    expect(scaleSeries([{ date: '2027-01-01', value: 5 }, { date: '2027-01-02', value: 5 }], { width: 200, height: 100, pad: 10 }).map(p => p.y)).toEqual([50, 50])
    expect(scaleSeries([{ date: '2027-01-01', value: 5 }, { date: '2027-01-01', value: 6 }], { width: 200, height: 100, pad: 10 }).map(p => p.x)).toEqual([100, 100])
    expect(scaleSeries([], { width: 200, height: 100, pad: 10 })).toEqual([])
  })
  it('kennzeichnet Sprints als „niedriger ist besser“', () => {
    expect(isLowerBetter('sprint_10m')).toBe(true)
    expect(isLowerBetter('sprint_30m')).toBe(true)
    expect(isLowerBetter('standweitsprung')).toBe(false)
    expect(isLowerBetter('Dribbling-Parcours')).toBe(false)
  })
  it('erkennt „niedriger ist besser“ an ausdrücklicher Angabe, Zeiteinheit oder Name', () => {
    for (const unit of ['s', 'S', 'sek', 'Sek.', 'sec', ' sec ', 'Sekunden', 'ms']) expect(isLowerBetter('Dribbling-Parcours', unit), unit).toBe(true)
    expect(isLowerBetter('Antritt 20 m', 'cm')).toBe(false)
    expect(isLowerBetter('Tempo', 'm/s')).toBe(false)
    expect(isLowerBetter('Sprint 20 m', 'm')).toBe(true)
    expect(isLowerBetter('Standweitsprung', 'cm')).toBe(false)
    expect(isLowerBetter('Dribbling-Parcours', 'Anzahl', true)).toBe(true)
    expect(isLowerBetter('sprint_10m', 's', false)).toBe(false)
    expect(isLowerBetter('Dribbling-Parcours', 's', null)).toBe(true)
  })
  it('benennt Metriken und formatiert Werte mit Einheit (de-DE)', () => {
    expect(metricLabel('sprint_10m')).toBe('Sprint 10 m')
    expect(metricLabel('jonglieren')).toBe('Jonglieren')
    expect(metricLabel('Dribbling-Parcours')).toBe('Dribbling-Parcours')
    expect(formatMeasurement(2.14, 's')).toBe('2,14 s')
    expect(formatMeasurement(150, 'cm')).toBe('150 cm')
    expect(formatMeasurement(32, 'Anzahl')).toBe('32 Anzahl')
  })
})

describe('Trend und Kopfzahlen', () => {
  const pt = (date: string, value: number) => ({ date, value })
  it('bewertet die Richtung: Sprint sinkend = besser, Sprung sinkend = schlechter', () => {
    expect(metricTrend('sprint_10m', [pt('2027-01-01', 2.4), pt('2027-03-01', 2.14)])).toMatchObject({ delta: -0.26, direction: 'better' })
    expect(metricTrend('sprint_10m', [pt('2027-01-01', 2.1), pt('2027-03-01', 2.2)])).toMatchObject({ delta: 0.1, direction: 'worse' })
    expect(metricTrend('standweitsprung', [pt('2027-01-01', 150), pt('2027-03-01', 158)])).toMatchObject({ delta: 8, direction: 'better' })
    expect(metricTrend('standweitsprung', [pt('2027-01-01', 150), pt('2027-03-01', 140)])).toMatchObject({ direction: 'worse' })
    expect(metricTrend('jonglieren', [pt('2027-01-01', 5), pt('2027-03-01', 5)])).toMatchObject({ delta: 0, direction: 'same' })
  })
  it('eigene Zeitmetriken: sinkende Sekunden sind besser, steigende schlechter (auch ohne "sprint" im Namen)', () => {
    expect(metricTrend('Dribbling-Parcours', [pt('2027-01-01', 14.2), pt('2027-03-01', 13.4)], 's')).toMatchObject({ delta: -0.8, direction: 'better' })
    expect(metricTrend('Dribbling-Parcours', [pt('2027-01-01', 13.4), pt('2027-03-01', 14.2)], 'sek')).toMatchObject({ delta: 0.8, direction: 'worse' })
    expect(metricTrend('Sprint 20 m', [pt('2027-01-01', 3.4), pt('2027-03-01', 3.1)], 'Sek.')).toMatchObject({ direction: 'better' })
    expect(metricTrend('Liegestütze', [pt('2027-01-01', 20), pt('2027-03-01', 25)], 'Anzahl')).toMatchObject({ direction: 'better' })
    expect(metricTrend('Liegestütze', [pt('2027-01-01', 25), pt('2027-03-01', 20)], 'Anzahl')).toMatchObject({ direction: 'worse' })
  })
  it('ausdrückliche Angabe schlägt Einheit und Name', () => {
    expect(metricTrend('Ballkontakte', [pt('2027-01-01', 30), pt('2027-03-01', 20)], 'Anzahl', true)).toMatchObject({ direction: 'better' })
    expect(metricTrend('sprint_10m', [pt('2027-01-01', 2.4), pt('2027-03-01', 2.1)], 's', false)).toMatchObject({ direction: 'worse' })
  })
  it('einzelne Messung: kein Vergleich; leere Reihe: null', () => {
    expect(metricTrend('sprint_10m', [pt('2027-01-01', 2.4)])).toMatchObject({ previous: null, delta: null, direction: null })
    expect(metricTrend('sprint_10m', [])).toBeNull()
  })
  it('formatiert die Differenz mit Vorzeichen', () => {
    expect(formatDelta(-0.26, 's')).toBe('\u22120,26 s')
    expect(formatDelta(8, 'cm')).toBe('+8 cm')
    expect(formatDelta(0, 's')).toBe('0 s')
  })
  it('zeigt genau ein Vorzeichen, auch bei Prozent und krummen Werten (kein „−−0,8 %“)', () => {
    expect(formatDelta(-0.8, '%')).toBe('\u22120,8 %')
    expect(formatDelta(0.8, '%')).toBe('+0,8 %')
    expect(formatDelta(-0.004, 's')).toBe('0 s')
    for (const delta of [-0.8, 0.8, -12, 3.456]) expect(formatDelta(delta, 's')).not.toMatch(/[-\u2212+]{2}/)
  })
  it('letztes Training: jüngster nicht stornierter Termin bis heute', () => {
    const list = [
      booking({ local_date: '2027-03-01' }), booking({ local_date: '2027-03-20', status: 'cancelled' }),
      booking({ local_date: '2027-03-10', status: 'registered' }), booking({ local_date: '2027-05-01' }), booking({ local_date: '2027-03-15', status: 'waitlist' }),
    ]
    expect(lastTrainingDate(list, '2027-04-02')).toBe('2027-03-10')
    expect(lastTrainingDate([booking({ local_date: '2027-05-01' })], '2027-04-02')).toBeNull()
    expect(lastTrainingDate([], '2027-04-02')).toBeNull()
  })
  it('Ziele: offene zuerst, Reihenfolge sonst stabil', () => {
    const goals = [{ id: 'a', status: 'erreicht' }, { id: 'b', status: 'verworfen' }, { id: 'c', status: 'offen' }, { id: 'd', status: 'offen' }]
    expect(goalsOpenFirst(goals).map(g => g.id)).toEqual(['c', 'd', 'a', 'b'])
  })
})

describe('Liste', () => {
  const list = [summary({ id: '1', first_name: 'Jörg', last_name: 'Größe' }), summary({ id: '2', first_name: 'Lena', last_name: 'Mustermann' })]
  it('sucht im Browser nach Vor- oder Nachname, ohne Groß-/Kleinschreibung und Umlaut-tolerant', () => {
    expect(filterPlayers(list, 'muster').map(p => p.id)).toEqual(['2'])
    expect(filterPlayers(list, 'JOERG').map(p => p.id)).toEqual(['1'])
    expect(filterPlayers(list, 'größe jörg').map(p => p.id)).toEqual(['1'])
    expect(filterPlayers(list, 'lena mu').map(p => p.id)).toEqual(['2'])
    expect(filterPlayers(list, '  ').length).toBe(2)
    expect(filterPlayers(list, 'xyz')).toEqual([])
  })
})

describe('Eingaben', () => {
  const base = { note_date: '2027-03-29', body: '  Gute Ballannahme  ', focus: ['technik', 'mental'], rating: '4', next_steps: ' ', video_url: '', camp_id: '' }
  it('normalisiert eine Notiz', () => {
    expect(parseNoteInput(base)).toEqual({
      ok: true,
      value: { note_date: '2027-03-29', body: 'Gute Ballannahme', focus: ['technik', 'mental'], rating: 4, next_steps: null, video_url: null, camp_id: null },
    })
  })
  it('meldet Fehler je Feld, ohne Werte zu verwerfen', () => {
    const r = parseNoteInput({ ...base, note_date: '', body: ' ', rating: '9', video_url: 'http://x.de' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['body', 'note_date', 'rating', 'video_url'])
  })
  it('akzeptiert Bewertung leer und weist unbekannten Fokus ab', () => {
    const ok = parseNoteInput({ ...base, rating: '', focus: [] })
    expect(ok.ok && ok.value.rating).toBeNull()
    const bad = parseNoteInput({ ...base, focus: ['zauberei'] })
    expect(bad.ok).toBe(false)
  })
  it('begrenzt Textlängen wie das Backend', () => {
    expect(parseNoteInput({ ...base, body: 'x'.repeat(10001) }).ok).toBe(false)
    expect(parseNoteInput({ ...base, next_steps: 'x'.repeat(4001) }).ok).toBe(false)
  })
  it('prüft Ziele', () => {
    expect(parseGoalInput({ title: ' Linker Fuß ', area: 'technik', target_date: '' })).toEqual({ ok: true, value: { title: 'Linker Fuß', area: 'technik', target_date: null } })
    expect(parseGoalInput({ title: '', area: 'x', target_date: '31.12.2027' }).ok).toBe(false)
  })
  it('prüft Messwerte, Komma als Dezimaltrenner, Standardeinheit', () => {
    const std = parseMeasurementInput({ measured_on: '2027-03-29', metric: 'sprint_10m', custom_metric: '', value: '2,14', unit: '', note: '' })
    expect(std).toEqual({ ok: true, value: { measured_on: '2027-03-29', metric: 'sprint_10m', value: 2.14, unit: 's', note: null } })
    const free = parseMeasurementInput({ measured_on: '2027-03-29', metric: '__custom', custom_metric: 'Dribbling', value: '12', unit: 'Sek', note: 'Slalom' })
    expect(free).toEqual({ ok: true, value: { measured_on: '2027-03-29', metric: 'Dribbling', value: 12, unit: 'Sek', note: 'Slalom' } })
    for (const value of ['', 'abc', 'NaN', 'Infinity', '1e3', '1,2,3']) {
      expect(parseMeasurementInput({ measured_on: '2027-03-29', metric: 'jonglieren', custom_metric: '', value, unit: '', note: '' }).ok, value).toBe(false)
    }
    expect(parseMeasurementInput({ measured_on: '2027-03-29', metric: '__custom', custom_metric: '', value: '1', unit: '', note: '' }).ok).toBe(false)
  })
})

describe('Anzeige', () => {
  it('formatiert Tage und Bewertungspunkte', () => {
    expect(formatDay('2027-03-29')).toBe('29.03.2027')
    expect(ratingDots(3)).toEqual([true, true, true, false, false])
    expect(ratingDots(null)).toEqual([false, false, false, false, false])
  })
})
