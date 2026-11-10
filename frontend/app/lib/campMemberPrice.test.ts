import { expect, it } from 'vitest'
import { campHasMemberPrice, campPriceLong, campPriceShort } from './parentFlowFormat'

const camp = { price_cents: 16900, currency: 'EUR' }

it('one price for everyone without a member price', () => {
  expect(campHasMemberPrice(camp)).toBe(false)
  expect(campPriceShort(camp)).toEqual({ from: false, text: '169,00 €' })
  expect(campPriceLong(camp)).toBe('169,00 €')
})

it('member price lower than the regular price: "ab" and both prices', () => {
  const c = { ...camp, price_member_cents: 14900 }
  expect(campHasMemberPrice(c)).toBe(true)
  expect(campPriceShort(c)).toEqual({ from: true, text: '149,00 €' })
  expect(campPriceLong(c)).toBe('149,00 € für Mitglieder, 169,00 € sonst – geprüft bei der Anmeldung')
})

it('a member price equal to the regular price is no member price', () => {
  expect(campHasMemberPrice({ ...camp, price_member_cents: 16900 })).toBe(false)
  expect(campHasMemberPrice({ ...camp, price_member_cents: null })).toBe(false)
})
