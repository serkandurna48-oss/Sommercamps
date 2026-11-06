'use client'

import { useId, useRef, useState } from 'react'
import { importMembersAction, type ImportActionState } from '../actions/trainingActions'
import Button from '../ui/Button'
import SuccessNote from '../state/SuccessNote'
import {
  MEMBER_CSV_MAX_CHARS,
  MEMBER_CSV_TEMPLATE_FILENAME,
  memberTemplateBlob,
  parseCsvPreview,
  readCsvFile,
  type CsvPreview,
} from './memberCsv'
import MemberImportMapping from './MemberImportMapping'
import { suggestMapping, toApiMapping, validateMapping, type ColumnChoice } from './memberMapping'
import { formatImportError } from './trainingLogic'

interface Loaded {
  csv: string
  preview: CsvPreview
}

/** CSV-Import der Mitgliederliste. Die Datei wird im Browser gelesen
 * (UTF-8, bei Excel-Export windows-1252); Kopfzeile und erste Zeilen werden als
 * Vorschau gezeigt, der Nutzer ordnet die Spalten zu, dann gehen Text und
 * Zuordnung an den Server. Nichts davon wird geloggt; Fehler nennen nur Zeile,
 * Feld und Code. */
export default function MemberImport({ orgSlug }: { orgSlug: string }) {
  const inputId = useId()
  const input = useRef<HTMLInputElement>(null)
  const reading = useRef<Promise<Loaded | null> | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [choices, setChoices] = useState<ColumnChoice[]>([])
  const [mappingErrors, setMappingErrors] = useState<string[]>([])
  const [pending, setPending] = useState(false)
  const [state, setState] = useState<ImportActionState | null>(null)

  function downloadTemplate() {
    const url = URL.createObjectURL(memberTemplateBlob())
    const link = document.createElement('a')
    link.href = url
    link.download = MEMBER_CSV_TEMPLATE_FILENAME
    document.body.append(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  async function load(file: File): Promise<Loaded | null> {
    try {
      const csv = await readCsvFile(file)
      if (csv.length > MEMBER_CSV_MAX_CHARS) {
        setState({ error: 'Die Datei ist zu groß (höchstens 1.000.000 Zeichen).', errors: [{ row: 1, field: 'file', code: 'file_too_large' }], result: null })
        return null
      }
      const preview = parseCsvPreview(csv)
      if (!preview) {
        setState({ error: 'Die Datei ist leer.', errors: [], result: null })
        return null
      }
      const next = { csv, preview }
      setLoaded(next)
      setChoices(suggestMapping(preview.header))
      return next
    } catch {
      setState({ error: 'Datei konnte nicht gelesen werden. Bitte erneut auswählen.', errors: [], result: null })
      return null
    }
  }

  function chooseFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    setFileName(file?.name ?? null)
    setLoaded(null)
    setChoices([])
    setMappingErrors([])
    setState(null)
    reading.current = file ? load(file) : null
  }

  function changeChoice(index: number, next: ColumnChoice) {
    setChoices(current => current.map((choice, i) => (i === index ? next : choice)))
    setMappingErrors([])
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const current = loaded ?? (reading.current ? await reading.current : null)
    if (!current) {
      if (!input.current?.files?.[0]) setState({ error: 'Bitte zuerst eine CSV-Datei auswählen.', errors: [], result: null })
      return
    }
    // The state setter may not have flushed yet when we awaited the read above.
    const activeChoices = choices.length === current.preview.header.length ? choices : suggestMapping(current.preview.header)
    const problems = validateMapping(activeChoices)
    setMappingErrors(problems)
    if (problems.length > 0) return
    setPending(true)
    setState(null)
    try {
      const result = await importMembersAction(orgSlug, current.csv, toApiMapping(activeChoices))
      setState(result)
      if (result.result) {
        if (input.current) input.current.value = ''
        setFileName(null)
        setLoaded(null)
        setChoices([])
        reading.current = null
      }
    } catch {
      setState({ error: 'Import fehlgeschlagen – es wurde nichts gespeichert. Bitte erneut versuchen.', errors: [], result: null })
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="cp-card flex flex-col gap-4" aria-labelledby={`${inputId}-title`}>
      <div>
        <h3 id={`${inputId}-title`} className="cp-subheading" style={{ color: 'var(--cp-ink)' }}>Mitglieder per CSV importieren</h3>
        <p className="cp-body mt-1" style={{ color: 'var(--cp-muted)' }}>
          Export aus Ihrer Vereinssoftware wählen, dann die Spalten zuordnen: Vorname, Nachname, Geburtsdatum (TT.MM.JJJJ oder JJJJ-MM-TT), optional Mitgliedsnummer und bis zu 10 Zusatzfelder. Trenner Semikolon oder Komma. Bis zu 2.000 Zeilen.
          Ein erneuter Import ist unbedenklich: vorhandene Mitglieder werden aktualisiert und wieder auf aktiv gesetzt. Bei einem Fehler wird nichts gespeichert.
        </p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={inputId} className="cp-label" style={{ color: 'var(--cp-ink-2)' }}>CSV-Datei</label>
          <input ref={input} id={inputId} type="file" accept=".csv,text/csv,text/plain" onChange={chooseFile}
            className="cp-focus cp-input w-full min-w-0 rounded-[var(--cp-r-field)] border px-4 py-3" style={{ borderColor: 'var(--cp-field-line)', fontSize: '16px' }} />
          {fileName && <p className="cp-chip" style={{ color: 'var(--cp-muted)' }}>Ausgewählt: {fileName}</p>}
        </div>
        {loaded && <MemberImportMapping idPrefix={inputId} preview={loaded.preview} choices={choices} onChange={changeChoice} />}
        {mappingErrors.length > 0 && (
          <ul className="cp-chip list-disc rounded-[var(--cp-r-chip)] border py-2 pl-8 pr-3" role="alert" data-testid="mapping-errors"
            style={{ color: 'var(--cp-error)', background: 'var(--cp-error-bg)', borderColor: 'var(--cp-error-line)' }}>
            {mappingErrors.map(problem => <li key={problem}>{problem}</li>)}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? 'Wird importiert …' : 'Importieren'}
          </Button>
          <Button type="button" onClick={downloadTemplate}>Vorlage herunterladen</Button>
        </div>
      </form>

      {state?.result && (
        <SuccessNote>
          Import abgeschlossen: {state.result.rows} Zeilen gelesen, {state.result.created} neu, {state.result.updated} aktualisiert
          {state.result.merged_in_file > 0 ? `, ${state.result.merged_in_file} doppelt in der Datei zusammengeführt` : ''}.
        </SuccessNote>
      )}
      {state?.error && (
        <div className="rounded-[var(--cp-r-chip)] border px-3 py-2" role="alert"
          style={{ color: 'var(--cp-error)', background: 'var(--cp-error-bg)', borderColor: 'var(--cp-error-line)' }}>
          <p className="cp-body">{state.error}</p>
          {state.errors.length > 0 && (
            <ul className="cp-chip mt-2 list-disc pl-5">
              {state.errors.slice(0, 50).map((error, index) => <li key={`${error.row}-${error.field}-${index}`}>{formatImportError(error)}</li>)}
              {state.errors.length > 50 && <li>… und {state.errors.length - 50} weitere</li>}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
