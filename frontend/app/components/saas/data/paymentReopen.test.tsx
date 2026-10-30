import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { getPreviewFixtures } from '../../../dev/admin-vorschau/fixtures'
import { canReopenPayment } from '../commandCenterLogic'
import PaymentRow from './PaymentRow'

vi.mock('../actions/paymentActions', () => ({ setPaymentStatusAction: vi.fn() }))

// Serkan 30.10.2026: "Kostenlos" set by mistake must be reversible.
const fixture = getPreviewFixtures(false, new Date('2026-10-24T12:00:00Z'))
const camp = fixture.camps[0]
const base = fixture.registrationsByCamp[0][1]

function row(payment_status: 'open' | 'paid' | 'waived' | 'refunded', status = base.status) {
  return renderToStaticMarkup(
    <PaymentRow registration={{ ...base, payment_status, status }} camp={camp} org={fixture.org}
      orgSlug="testverein" brandStrong="#123456" brandOn="#ffffff" onPaid={vi.fn()} />,
  )
}

it.each(['paid', 'waived', 'refunded'] as const)('%s lässt sich wieder auf Offen setzen', status => {
  expect(canReopenPayment({ ...base, payment_status: status })).toBe(true)
  expect(row(status)).toContain('Wieder auf Offen setzen')
})

it('offene und stornierte Anmeldungen bieten kein Zurücksetzen an', () => {
  expect(row('open')).not.toContain('Wieder auf Offen setzen')
  expect(canReopenPayment({ ...base, payment_status: 'waived', status: 'cancelled' })).toBe(false)
})
