import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import StatCard from './StatCard'

it('hält Geldwerte innerhalb der gemeinsamen Kennzahlkachel', () => {
  const html = renderToStaticMarkup(<StatCard label="Offen" value={'1.639,00 €'} wide />)
  expect(html).toContain('cp-stat-money')
  expect(html).toContain('cp-stat-amount')
  expect(html).not.toContain('col-span-2')
})

it('lässt Zähler in einer halben Spalte stehen', () => {
  const html = renderToStaticMarkup(<StatCard label="Warteliste" value="3" numericValue={3} />)
  expect(html).not.toContain('col-span')
})
