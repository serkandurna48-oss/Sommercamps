/**
 * Client-side CSV export — no library needed (unlike .xlsx, see
 * app/xlsx_export.py in backend_saas for why that generation happens
 * server-side instead). Semicolon-delimited on purpose: German Excel
 * (the realistic audience for a Vereins-Admin-Tool) treats a comma as the
 * decimal separator and mis-splits comma-delimited CSVs into one column.
 */

export interface ExportColumn<T> {
  header: string
  value: (row: T) => string | number | null | undefined
}

function csvCell(raw: string | number | null | undefined): string {
  const value = raw === null || raw === undefined ? '' : String(raw)
  if (/[";\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export function toCsv<T>(rows: T[], columns: ExportColumn<T>[]): string {
  const header = columns.map(c => csvCell(c.header)).join(';')
  const lines = rows.map(row => columns.map(c => csvCell(c.value(row))).join(';'))
  return [header, ...lines].join('\r\n')
}

/**
 * Makes "Als Excel" match whatever "Als CSV" would export — a bug found in
 * review: "Als CSV" is generated client-side from already-filtered rows,
 * but "Als Excel" pointed at a static server URL that always returned
 * everything, so filtering to e.g. "Zahlung offen" and picking "Als
 * Excel" silently downloaded every registration, paid ones included. Only
 * appends `tokens` (comma-separated registration_token values) when the
 * filtered set is a strict subset — an unfiltered view keeps the plain
 * URL, matching the export.xlsx endpoint's `tokens=None` default.
 */
export function xlsxHrefWithFilter(baseHref: string, filteredTokens: string[], totalCount: number): string {
  if (filteredTokens.length >= totalCount) return baseHref
  const url = new URL(baseHref, 'http://localhost')
  url.searchParams.set('tokens', filteredTokens.join(','))
  return `${url.pathname}?${url.searchParams.toString()}`
}

/** UTF-8 BOM so Excel recognizes the encoding and renders Umlaute
 * correctly instead of guessing Latin-1. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
