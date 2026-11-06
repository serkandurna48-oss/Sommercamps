import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import PaymentReturn from './page'

async function render(result?: string) {
  const el = await PaymentReturn({
    params: Promise.resolve({ org: 'ksv' }),
    searchParams: Promise.resolve({ result }),
  })
  return renderToStaticMarkup(el)
}

test('cancel page promises only what the mail contains', async () => {
  const html = await render('cancel')
  expect(html).toContain('Ihre Buchung bleibt reserviert')
  expect(html).toContain('Bestätigungsmail steht, wie Sie per Überweisung zahlen')
  expect(html).toContain('wenden Sie sich direkt an den Verein')
  expect(html).not.toContain('Angaben aus Ihrer Anmeldebestätigung')
})

test('success page text is unchanged', async () => {
  expect(await render('success')).toContain('Zurück von Stripe')
})
