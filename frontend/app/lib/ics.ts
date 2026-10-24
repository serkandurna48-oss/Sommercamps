export interface CampCalendarInput {
  campId: string
  registrationToken: string
  title: string
  clubName: string
  ranges: readonly { start_date: string; end_date: string }[]
  location?: string | null
  careInfo?: string | null
}

function escapeText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n')
    .replace(/;/g, '\\;').replace(/,/g, '\\,')
}

function foldLine(line: string): string {
  const encoder = new TextEncoder()
  let folded = ''
  let octets = 0
  // Iterate code points so a UTF-8 character is never split across lines.
  for (const character of line) {
    const size = encoder.encode(character).length
    if (octets + size > 75) {
      folded += '\r\n '
      octets = 1
    }
    folded += character
    octets += size
  }
  return folded
}

function exclusiveEnd(date: string): string {
  const end = new Date(`${date}T00:00:00Z`)
  end.setUTCDate(end.getUTCDate() + 1)
  return end.toISOString().slice(0, 10).replace(/-/g, '')
}

/** The clock is an explicit input; no browser APIs or personal names are needed. */
export function buildCampIcs(input: CampCalendarInput, now: Date): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CampsPilot//DE']
  for (const [index, range] of input.ranges.entries()) {
    const uid = [input.campId, input.registrationToken, String(index)]
      .map(encodeURIComponent).join('/')
    lines.push(
      'BEGIN:VEVENT',
      `UID:${uid}@campspilot.app`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${range.start_date.replace(/-/g, '')}`,
      `DTEND;VALUE=DATE:${exclusiveEnd(range.end_date)}`,
      `SUMMARY:${escapeText(`${input.title} – ${input.clubName}`)}`,
    )
    if (input.location) lines.push(`LOCATION:${escapeText(input.location)}`)
    if (input.careInfo) lines.push(`DESCRIPTION:${escapeText(`Betreuungszeiten: ${input.careInfo}`)}`)
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return `${lines.map(foldLine).join('\r\n')}\r\n`
}
