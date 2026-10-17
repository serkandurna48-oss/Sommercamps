import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { ModuleKind, transpileModule } from 'typescript'
import { describe, expect, it } from 'vitest'
import { parseZonedDateTime } from './dateTimeInput'

// Run the real helper under independent device timezones, also on Node 20
// where native TypeScript imports are not supported.
const javascript = transpileModule(readFileSync('app/lib/dateTimeInput.ts', 'utf8'), {
  compilerOptions: { module: ModuleKind.ESNext },
}).outputText
const moduleUrl = `data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`

describe('deadline transport across timezones', () => {
  it.each([
    ['UTC', '2027-06-01T10:00:00.000Z'],
    ['Europe/Berlin', '2027-06-01T08:00:00.000Z'],
    ['America/New_York', '2027-06-01T14:00:00.000Z'],
  ])('converts an edited wall time on a device in %s', (timezone, expected) => {
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', `
      import { localInputToIso } from ${JSON.stringify(moduleUrl)};
      console.log(localInputToIso('2027-06-01T10:00'));
    `], { env: { ...process.env, TZ: timezone }, encoding: 'utf8' })
    expect(output.trim()).toBe(expected)
  })

  it.each(['UTC', 'Europe/Berlin', 'America/New_York'])(
    'preserves a deadline displayed on a device in %s', timezone => {
      const output = execFileSync(process.execPath, ['--input-type=module', '-e', `
        import { toLocalInputValue, localInputToIso } from ${JSON.stringify(moduleUrl)};
        const original = '2027-06-01T10:00:00+02:00';
        console.log(localInputToIso(toLocalInputValue(original), original));
      `], { env: { ...process.env, TZ: timezone }, encoding: 'utf8' })
      expect(parseZonedDateTime(output.trim())).toBe('2027-06-01T08:00:00.000Z')
    },
  )

  it('preserves the second autumn hour and rejects a missing spring hour in Berlin', () => {
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', `
      import { toLocalInputValue, localInputToIso } from ${JSON.stringify(moduleUrl)};
      const original = '2027-10-31T02:30:15+01:00';
      console.log(localInputToIso(toLocalInputValue(original), original));
      try { localInputToIso('2027-03-28T02:30'); console.log('accepted'); }
      catch { console.log('rejected'); }
    `], { env: { ...process.env, TZ: 'Europe/Berlin' }, encoding: 'utf8' })
    expect(output.trim().split(/\r?\n/)).toEqual(['2027-10-31T01:30:15.000Z', 'rejected'])
  })

  it.each(['2027-06-01T10:00', 'invalid', '2027-13-01T10:00:00Z'])(
    'does not guess or silently clear an invalid server-side value: %s', value => {
      expect(() => parseZonedDateTime(value)).toThrow()
    },
  )

  it('only an intentionally empty deadline clears the value', () => {
    expect(parseZonedDateTime('')).toBeNull()
    expect(parseZonedDateTime(null)).toBeNull()
  })
})
