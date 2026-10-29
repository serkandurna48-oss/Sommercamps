/**
 * Browser E2E: parent registration against the REAL stack (Next.js production
 * build + FastAPI + throwaway Postgres seeded by scripts/e2e/seed_e2e.py).
 * Synthetic data only. Camp capacity is 1: first child gets the spot,
 * the second lands on the waitlist.
 */
import { expect, test, type Page } from '@playwright/test'

const ORG = '/pilot/e2e-verein'

async function register(page: Page, child: { first: string; birth: string }, parentEmail: string, cta = 'Jetzt anmelden') {
  await page.goto(ORG)
  await page.getByRole('button', { name: /E2E Sommercamp/ }).click()
  await page.getByRole('button', { name: cta }).last().click()

  await page.locator('[name="child_first_name"]').fill(child.first)
  await page.locator('[name="child_last_name"]').fill('Testkind')
  await page.locator('[name="child_birth_date"]').fill(child.birth)
  await page.locator('[name="parent_name"]').fill('Erika Muster')
  await page.locator('[name="parent_email"]').fill(parentEmail)
  await page.locator('[name="parent_phone"]').fill('0561 000000')
  await page.locator('[name="emergency_phone"]').fill('0561 111111')
  await page.locator('#terms_accepted').check()
  await page.locator('#privacy_accepted').check()
  await page.locator('form button[type="submit"]').click()

  // The done headline is an h1 with role="status" (announced to screen readers).
  await expect(page.locator('h1')).toHaveText('Anmeldung eingegangen', { timeout: 15_000 })
}

// Order matters (1 worker): validation first, while the camp still has its free spot.
test('Pflichtfelder: ohne Einwilligungen wird nichts gespeichert', async ({ page }) => {
  await page.goto(ORG)
  await page.getByRole('button', { name: /E2E Sommercamp/ }).click()
  await page.getByRole('button', { name: 'Jetzt anmelden' }).last().click()
  await page.locator('[name="child_first_name"]').fill('Lea')
  await page.locator('form button[type="submit"]').click()
  await expect(page.locator('h1')).not.toHaveText('Anmeldung eingegangen')
  await expect(page.locator('.field.bad, .consent.bad').first()).toBeVisible()
})

test('Familie meldet ein Kind an, das zweite Kind landet auf der Warteliste', async ({ page }) => {
  await register(page, { first: 'Mia', birth: '03.04.2017' }, 'eltern1@e2e.example')
  await expect(page.getByText(/Mia ist angemeldet/)).toBeVisible()
  await expect(page.getByText(/CP-[A-Z0-9]{8}/).first()).toBeVisible()

  // Full camp: the camp page offers the waitlist instead.
  await register(page, { first: 'Noah', birth: '12.09.2016' }, 'eltern2@e2e.example', 'Auf die Warteliste setzen')
  await expect(page.getByText(/Noah ist auf der Warteliste/)).toBeVisible()

  // The public page now shows the camp as full.
  await page.goto(ORG)
  await expect(page.getByText(/ausgebucht|Warteliste/i).first()).toBeVisible()
})
