'use client'

import Button from './Button'
import { useAdminPreview } from '../preview/AdminPreviewContext'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
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
  configuration,
  summary,
  onReset,
  onPrint,
  printEnabled = true,
}: {
  rows: T[]
  columns: ExportColumn<T>[]
  csvFilename: string
  xlsxHref: string
  configuration?: ReactNode
  summary?: ReactNode
  onReset?: () => void
  onPrint?: () => void
  printEnabled?: boolean
}) {
  const preview = useAdminPreview()
  const [open, setOpen] = useState(false)
  const [downloadState, setDownloadState] = useState<'idle' | 'pending' | 'success' | 'error'>('idle')
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelId = useId()
  const disabled = rows.length === 0 || downloadState === 'pending'

  async function downloadExcel() {
    if (disabled || !!preview) return
    setDownloadState('pending')
    try {
      const response = await fetch(xlsxHref)
      if (!response.ok) throw new Error('Export failed')
      const url = URL.createObjectURL(await response.blob())
      const link = document.createElement('a')
      link.href = url
      link.download = csvFilename.replace(/\.csv$/i, '.xlsx')
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setDownloadState('success')
    } catch {
      setDownloadState('error')
    }
  }

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="cp-noprint relative mb-4" ref={rootRef}>
      <Button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="gap-2"
      >
        <IconDownload />
        Exportieren
        <IconChevronDown className={`transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} />
      </Button>

      {summary && <div className="mt-2 text-sm" aria-live="polite">{summary}</div>}

      {open && (
        <div
          id={panelId}
          role="group"
          aria-label="Exportformat"
          className="absolute top-[calc(100%+6px)] left-0 z-20 w-[320px] max-w-full p-1 rounded-[var(--cp-r-field)] border"
          style={{ borderColor: 'var(--cp-line)', background: 'var(--cp-surface)' }}
        >
          {configuration && <div className="border-b p-3">{configuration}</div>}
          {rows.length === 0 && <p className="px-3.5 py-2 text-sm">Keine Treffer für diesen Export.</p>}
          {rows.length === 0 && onReset && <Button type="button" onClick={onReset} className="cp-focus min-h-[44px] min-w-[44px] px-3.5">Filter zurücksetzen</Button>}
          <Button
            type="button"
            disabled={disabled}
            onClick={() => {
              downloadCsv(csvFilename, toCsv(rows, columns))
              setDownloadState('success')
            }}
            className="mt-1 w-full gap-2.5"
          >
            <IconDocument /> Als CSV
          </Button>
          <Button
            type="button"
            disabled={disabled || !!preview}
            title={preview ? 'Excel-Export ist in der Vorschau nicht verfügbar' : undefined}
            onClick={downloadExcel}
            className="mt-1 w-full gap-2.5"
          >
            <IconTable /> Als Excel
          </Button>
          {printEnabled && <Button
            type="button"
            disabled={disabled}
            onClick={() => {
              if (onPrint) {
                setOpen(false)
                triggerRef.current?.focus()
                onPrint()
              }
              else window.print()
            }}
            className="mt-1 w-full gap-2.5"
          >
            <IconPrinter /> PDF / Drucken
          </Button>}
        </div>
      )}
      {downloadState === 'pending' && <p role="status">Liste wird erstellt …</p>}
      {downloadState === 'success' && <p role="status">Download gestartet.</p>}
      {downloadState === 'error' && <div role="alert">Export fehlgeschlagen. <Button type="button" disabled={disabled} onClick={downloadExcel} className="cp-focus min-h-[44px] min-w-[44px]">Erneut versuchen</Button></div>}
    </div>
  )
}
