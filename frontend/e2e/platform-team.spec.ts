/**
 * Browser E2E (phone viewport) of the platform team management on the real
 * local stack with fake Supabase Auth (scripts/e2e/fake_gotrue.py): the
 * platform owner grants platform access to an existing, activated account,
 * that person opens the console with their own login, the owner revokes it
 * again. Refusals: unknown address, never-activated account, last owner.
 * Synthetic accounts only; ends with the same single owner it started with.
 */
import { expect, test, type Page } from '@playwright/test'

const AUTH = 'http://127.0.0.1:59999'
const OWNER = { email: 'owner@e2e.example', password: 'e2e-owner-password' }
const COLLEAGUE = { email: 'kollege@team.e2e.example', password: 'kollege-passwort-1' }
const INACTIVE = { email: 'nie-angemeldet@team.e2e.example', password: 'inaktiv-passwort-1' }
const PHONE = { width: 390, height: 844 }

async function createAccount(email: string, password: string, signIn: boolean) {
  const res = await fetch(`${AUTH}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, email_confirm: true }),
  })
  expect([200, 422]).toContain(res.status)
  if (signIn) {
    const token = await fetch(`${AUTH}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    expect(token.status).toBe(200)
  }
}

async function login(page: Page, email: string, password: string) {
  await page.goto('/platform/login')
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(password)
  await page.locator('button[type="submit"]').click()
}

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
}

test('Plattform-Owner vergibt und entzieht Plattform-Zugang am Handy', async ({ browser }) => {
  test.setTimeout(120_000)
  await createAccount(COLLEAGUE.email, COLLEAGUE.password, true)
  await createAccount(INACTIVE.email, INACTIVE.password, false)

  const owner = await (await browser.newContext({ viewport: PHONE, isMobile: true, hasTouch: true })).newPage()
  await login(owner, OWNER.email, OWNER.password)
  await expect(owner).toHaveURL(/\/platform$/, { timeout: 15_000 })
  await owner.getByRole('navigation', { name: 'Plattform-Konsole' }).getByRole('link', { name: 'Team' }).click()
  await expect(owner.locator('h1')).toHaveText('Team')

  // Start: only the owner, who cannot remove themself as the last one.
  await expect(owner.getByText('Plattform-Admins (1)')).toBeVisible()
  await expect(owner.getByText('(du)')).toBeVisible()
  await expect(owner.getByText('Letzter Plattform-Owner, kann nicht entfernt werden.')).toBeVisible()
  await noHorizontalScroll(owner)

  const email = owner.getByLabel('E-Mail-Adresse des Kontos')
  const grant = owner.getByRole('button', { name: 'Zugang vergeben' })
  const box = await grant.boundingBox()
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)

  await email.fill('unbekannt@team.e2e.example')
  await grant.click()
  await expect(owner.locator('p[role="alert"]')).toContainText('Kein Konto mit dieser E-Mail-Adresse', { timeout: 15_000 })

  await email.fill(INACTIVE.email)
  await grant.click()
  await expect(owner.locator('p[role="alert"]')).toContainText('Konto noch nicht aktiviert', { timeout: 15_000 })

  await email.fill(COLLEAGUE.email)
  await grant.click()
  await expect(owner.locator('p[role="status"]')).toContainText(`${COLLEAGUE.email} hat jetzt Plattform-Zugang`, { timeout: 15_000 })
  await expect(owner.getByText('Plattform-Admins (2)')).toBeVisible()
  await expect(owner.getByText(COLLEAGUE.email, { exact: true })).toBeVisible()
  await noHorizontalScroll(owner)
  await owner.screenshot({ path: 'playwright-results/e2e/platform-team-mobile.png', fullPage: true })

  // The colleague opens the console with their own account.
  const colleague = await (await browser.newContext({ viewport: PHONE, isMobile: true })).newPage()
  await login(colleague, COLLEAGUE.email, COLLEAGUE.password)
  await expect(colleague).toHaveURL(/\/platform$/, { timeout: 15_000 })
  await colleague.goto('/platform/team')
  await expect(colleague.getByText('Plattform-Admins (2)')).toBeVisible()

  // Revoke with an explicit confirmation step.
  const row = owner.getByRole('listitem').filter({ hasText: COLLEAGUE.email })
  await row.getByRole('button', { name: 'Entziehen' }).click()
  await row.getByRole('button', { name: 'Zugang entziehen' }).click()
  await expect(owner.getByText('Plattform-Admins (1)')).toBeVisible({ timeout: 15_000 })

  // Revocation takes effect on the colleague's next request: no console any more.
  await colleague.goto('/platform/team')
  await expect(colleague).toHaveURL(/\/platform\/login/, { timeout: 15_000 })

  // Both changes are in the audit log.
  await owner.goto('/platform/audit-log')
  await expect(owner.getByText('Plattform-Zugang vergeben').first()).toBeVisible()
  await expect(owner.getByText('Plattform-Zugang entzogen').first()).toBeVisible()
  await owner.context().close()
  await colleague.context().close()
})
