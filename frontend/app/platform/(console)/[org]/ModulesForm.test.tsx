// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import ModulesForm from './ModulesForm'

vi.mock('./modulesActions', () => ({ updateModulesAction: vi.fn() }))

it('zeigt alle Module, camps immer an und gesperrt, sonst den gespeicherten Stand', () => {
  const doc = document.implementation.createHTMLDocument()
  doc.body.innerHTML = renderToStaticMarkup(<ModulesForm orgSlug="demo" modules={['camps', 'players']} />)
  const boxes = [...doc.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')]
  expect(boxes.map(b => b.value)).toEqual(['camps', 'trainings', 'members', 'players'])
  expect(boxes.map(b => b.checked)).toEqual([true, false, false, true])
  expect(boxes.map(b => b.disabled)).toEqual([true, false, false, false])
  expect(doc.body.textContent).toContain('immer aktiv')
})
