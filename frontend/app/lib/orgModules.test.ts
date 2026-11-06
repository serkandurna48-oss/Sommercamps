import { expect, it } from 'vitest'
import { hasModule, normalizeModules, orgModules } from './orgModules'

it('normalisiert: camps immer, bekannte Module in fester Reihenfolge', () => {
  expect(normalizeModules([])).toEqual(['camps'])
  expect(normalizeModules(['players', 'shop', 'trainings', 'players'])).toEqual(['camps', 'trainings', 'players'])
})

it('ohne Feld: nur camps (fail closed, wie der Backend-Default)', () => {
  expect(orgModules(undefined)).toEqual(['camps'])
  expect(orgModules({})).toEqual(['camps'])
  expect(orgModules({ modules: null })).toEqual(['camps'])
})

it('mit Feld: nur freigeschaltete Module', () => {
  expect(hasModule({ modules: ['camps'] }, 'trainings')).toBe(false)
  expect(hasModule({ modules: ['camps'] }, 'camps')).toBe(true)
  expect(hasModule({ modules: ['camps', 'members'] }, 'members')).toBe(true)
})
