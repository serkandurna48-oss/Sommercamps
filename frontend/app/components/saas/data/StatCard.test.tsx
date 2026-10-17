import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import StatCard from './StatCard'

it('lässt lange Werte unter 768px beide Spalten belegen', () => {
  const html = renderToStaticMarkup(<StatCard label="Offen" value={'1.639,00 €'} wide />)
  expect(html).toContain('col-span-2')
  expect(html).toContain('md:col-span-1')
})

it('lässt Zähler in einer halben Spalte stehen', () => {
  const html = renderToStaticMarkup(<StatCard label="Warteliste" value="3" numericValue={3} />)
  expect(html).not.toContain('col-span')
})
