'use client'

import { useEffect, useRef, useState } from 'react'
import { downloadCsv, toCsv, type ExportColumn } from '../../../lib/exportCsv'
import { IconChevronDown, IconDocument, IconDownload, IconPrinter, IconTable } from '../icons'

/**
 * Ein "Exportieren"-Dropdown statt dreier lose herumstehender Buttons
 * (Design-Reifung nach dem dritten Praxistest — die drei Buttons wirkten
 * "optisch sehr schlecht"). "Als CSV" generiert clientseitig aus den
 * bereits geladenen/gefilterten Zeilen. "Als Excel" ist ein echter
 * Server-Download (siehe app/xlsx_export.py, backend_saas) über eine
 * gleich-origin Next.js Route, die den Admin-Token serverseitig aus dem
 * httpOnly-Cookie anhängt. "Drucken" nutzt die Print-Stylesheet-Regeln in
 * tokens.css statt eines eigenen PDF-Renderers.
 */
export default function ExportBar<T>({
  rows,
  columns,
  csvFilename,
  xlsxHref,
}: {
  rows: T[]
  columns: ExportColumn<T>[]
  csvFilename: string
  xlsxHref: string
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="cp-noprint relative mb-4 inline-block" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="cp-label inline-flex min-h-[40px] items-center gap-2 rounded-[var(--cp-r-field)] border px-3.5 transition-colors motion-reduce:transition-none focus-visible:outline focus-visible:outline-2"
        style={{ borderColor: 'var(--cp-field-line)', color: 'var(--cp-ink-2)', background: 'var(--cp-surface)' }}
      >
        <IconDownload />
        Exportieren
        <IconChevronDown className={`transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute top-[calc(100%+6px)] left-0 z-20 min-w-[190px] overflow-hidden rounded-[var(--cp-r-field)] border"
          style={{ borderColor: 'var(--cp-line)', background: 'var(--cp-surface)' }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              downloadCsv(csvFilename, toCsv(rows, columns))
              setOpen(false)
            }}
            className="cp-body flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors motion-reduce:transition-none hover:bg-[var(--cp-surface-2)]"
            style={{ color: 'var(--cp-ink)' }}
          >
            <IconDocument /> Als CSV
          </button>
          <a
            role="menuitem"
            href={xlsxHref}
            onClick={() => setOpen(false)}
            className="cp-body flex items-center gap-2.5 border-t px-3.5 py-2.5 transition-colors motion-reduce:transition-none hover:bg-[var(--cp-surface-2)]"
            style={{ color: 'var(--cp-ink)', borderColor: 'var(--cp-line-2)' }}
          >
            <IconTable /> Als Excel
          </a>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              window.print()
              setOpen(false)
            }}
            className="cp-body flex w-full items-center gap-2.5 border-t px-3.5 py-2.5 text-left transition-colors motion-reduce:transition-none hover:bg-[var(--cp-surface-2)]"
            style={{ color: 'var(--cp-ink)', borderColor: 'var(--cp-line-2)' }}
          >
            <IconPrinter /> Drucken
          </button>
        </div>
      )}
    </div>
  )
}
