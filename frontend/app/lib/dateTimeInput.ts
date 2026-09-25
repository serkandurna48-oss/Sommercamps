/** Format an instant for a datetime-local input in the device's timezone. */
export function toLocalInputValue(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** Run in the browser before crossing the Server Action boundary. */
export function localInputToIso(value: FormDataEntryValue | null, original?: string | null): string {
  if (value === null || value === '') return ''
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    throw new Error('Invalid local date/time')
  }
  // Preserve the original instant when the minute field was not changed:
  // autumn's repeated hour has two possible offsets, and the API may carry seconds.
  if (original && value === toLocalInputValue(original)) return new Date(original).toISOString()
  const date = new Date(value)
  // Reject invalid dates and wall times skipped during the spring DST change.
  if (Number.isNaN(date.getTime()) || toLocalInputValue(date.toISOString()) !== value) {
    throw new Error('Invalid local date/time')
  }
  return date.toISOString()
}

/** Server-side parsing never guesses the browser's timezone. */
export function parseZonedDateTime(value: FormDataEntryValue | null): string | null {
  if (value === null || value === '') return null
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw new Error('A timezone is required')
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new Error('Invalid date/time')
  return date.toISOString()
}
