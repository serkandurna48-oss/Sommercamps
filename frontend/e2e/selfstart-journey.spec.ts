/**
 * Browser E2E of the v1 acceptance journey on the real stack with a local fake
 * Supabase Auth (scripts/e2e/fake_gotrue.py): a new club registers itself,
 * confirms its mail, sets up, publishes its camp, submits for review; the
 * platform owner approves; parents register (spot + waitlist); the club
 * cancels and the waitlisted child moves up. Synthetic data only.
 */
import { expect, test, type Browser, type Page } from '@playwright/test'

const AUTH = 'http://127.0.0.1:59999'
const CLUB = { name: 'SV Probelauf', slug: 'sv-probelauf', email: 'vorstand@probelauf.e2e.example', password: 'probelauf-passwort-1' }

async function outbox(email: string) {
  const res = await fetch(`${AUTH}/__outbox?email=${encodeURIComponent(email)}`)
  return (await res.json()) as { kind: string; link?: string }[]
}

async function login(page: Page, url: string, email: string, password: string) {
  await page.goto(url)
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(password)
  await page.locator('button[type="submit"]').click()
}

async function parentRegisters(browser: Browser, first: string, cta: string) {
  const page = await (await browser.newContext()).newPage()
  await page.goto(`/pilot/${CLUB.slug}`)
  await page.getByRole('button', { name: /Probecamp Ostern/ }).click()
  await page.getByRole('button', { name: cta }).last().click()
  await page.locator('[name="child_first_name"]').fill(first)
  await page.locator('[name="child_last_name"]').fill('Testkind')
  await page.locator('[name="child_birth_date"]').fill('03.04.2018')
  await page.locator('[name="parent_name"]').fill('Erika Muster')
  await page.locator('[name="parent_email"]').fill(`${first.toLowerCase()}@eltern.e2e.example`)
  await page.locator('[name="parent_phone"]').fill('0561 000000')
  await page.locator('[name="emergency_phone"]').fill('0561 111111')
  await page.locator('#terms_accepted').check()
  await page.locator('#privacy_accepted').check()
  await page.locator('form button[type="submit"]').click()
  await expect(page.locator('h1')).toHaveText('Anmeldung eingegangen', { timeout: 15_000 })
  await page.context().close()
}

test('Fremder Verein startet ohne Hilfe bis zur verwalteten Anmeldung', async ({ browser, page }) => {
  test.setTimeout(180_000)

  // 1. Self-signup
  await page.goto('/campspilot/registrieren')
  await page.locator('#rf-organization_name').fill(CLUB.name)
  await page.locator('#rf-contact_person_name').fill('Tina Test')
  await page.locator('#rf-email').fill(CLUB.email)
  await page.locator('#rf-password').fill(CLUB.password)
  await page.locator('#rf-terms').check()
  await page.locator('button[type="submit"]').click()
  await expect(page.getByText('Bitte bestätigen Sie Ihre E-Mail-Adresse.')).toBeVisible()

  // 2. Confirmation link lands on the club login (not localhost:3000), tokens leave the address bar
  const [mail] = await outbox(CLUB.email)
  expect(mail.link).toContain(encodeURIComponent('http://127.0.0.1:3113/pilot/sv-probelauf/login').replace(/%2F/g, '/'))
  await page.goto(mail.link!)
  await expect(page).toHaveURL(/\/pilot\/sv-probelauf\/login$/)
  await login(page, `/pilot/${CLUB.slug}/login`, CLUB.email, CLUB.password)
  await expect(page).toHaveURL(/\/pilot\/sv-probelauf\/dashboard/)

  // 3. Setup wizard
  await page.goto(`/pilot/${CLUB.slug}/einrichtung?schritt=1`)
  await page.locator('#w-primary_color').fill('#1c6b45')
  await page.getByRole('button', { name: 'Weiter' }).click()
  await expect(page.locator('#w-contact_email')).toBeVisible()
  await page.locator('#w-contact_email').fill(CLUB.email)
  await page.locator('#w-legal_address').fill('Teststraße 1, 34225 Baunatal')
  await page.getByRole('button', { name: 'Vorlage einfügen' }).click()
  await page.getByRole('button', { name: 'Weiter' }).click()
  await expect(page.locator('#title')).toBeVisible()
  await page.locator('#title').fill('Probecamp Ostern')
  await page.locator('#start_date').fill('2027-04-06')
  await page.locator('#end_date').fill('2027-04-09')
  await page.locator('#age_min').fill('6')
  await page.locator('#age_max').fill('12')
  await page.locator('#capacity').fill('1')
  await page.locator('#price_euros').fill('99')
  await page.getByRole('button', { name: 'Camp anlegen' }).click()
  await expect(page).toHaveURL(/camps\/probecamp-ostern\/konfiguration/)
  await page.locator('#location').fill('Sportplatz Probe')
  await page.getByRole('button', { name: 'Camp veröffentlichen' }).click()
  await expect(page.locator('main')).toContainText(/Camp:\s*Öffentlich/, { timeout: 15_000 })

  await page.goto(`/pilot/${CLUB.slug}/einrichtung?schritt=4`)
  await page.getByRole('button', { name: 'Zur Freigabe einreichen' }).click()
  await page.getByLabel(/Auftragsverarbeitungsvertrag/).check()
  await page.getByRole('button', { name: 'Jetzt einreichen' }).click()
  await expect(page.getByText('Wir prüfen Ihren Verein, meist innerhalb eines Werktags.')).toBeVisible({ timeout: 15_000 })

  // Not public before approval
  const anon = await (await browser.newContext()).newPage()
  await anon.goto(`/pilot/${CLUB.slug}`)
  await expect(anon.getByRole('button', { name: /Probecamp Ostern/ })).toHaveCount(0)

  // 4. Platform owner approves
  const owner = await (await browser.newContext()).newPage()
  await login(owner, '/platform/login', 'owner@e2e.example', 'e2e-owner-password')
  await expect(owner).not.toHaveURL(/\/login/)
  await owner.goto(`/platform/${CLUB.slug}`)
  // No logo uploaded: the owner approves with an explicit exception.
  await owner.getByRole('button', { name: 'Trotzdem freigeben' }).click()
  await owner.getByRole('button', { name: 'Ausnahme bestätigen und freigeben' }).click()
  // The transient status text is replaced once the page revalidates; check the stored state.
  await expect(owner.getByRole('button', { name: 'Ausnahme bestätigen und freigeben' })).toHaveCount(0, { timeout: 15_000 })
  await expect(async () => {
    await owner.reload()
    await expect(owner.getByLabel('Freigabe', { exact: true }).getByText(/^Freigegeben am/)).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })

  // 4b. Owner invites a second club admin who sets a password and logs in
  const colleague = 'kollegin@probelauf.e2e.example'
  await owner.getByLabel('E-Mail-Adresse des Vereinsadmins').fill(colleague)
  await owner.getByRole('button', { name: 'Einladen' }).click()
  await expect(owner.getByText(`Einladung an ${colleague} gesendet.`, { exact: false })).toBeVisible()
  const invite = (await outbox(colleague)).find(m => m.kind === 'recovery_link')
  expect(invite?.link).toContain('127.0.0.1%3A3113/pilot/sv-probelauf/neues-passwort')
  const admin2 = await (await browser.newContext()).newPage()
  await admin2.goto(invite!.link!)
  await admin2.locator('#new-password').fill('kollegin-passwort-123')
  await admin2.locator('#confirm-password').fill('kollegin-passwort-123')
  await admin2.locator('form button[type="submit"]').click()
  await expect(admin2.getByText('Ihr Passwort wurde geändert.', { exact: false })).toBeVisible()
  await login(admin2, `/pilot/${CLUB.slug}/login`, colleague, 'kollegin-passwort-123')
  await expect(admin2).toHaveURL(/\/pilot\/sv-probelauf\/dashboard/)

  // 5. Parents: first child gets the spot, second the waitlist
  await anon.goto(`/pilot/${CLUB.slug}`)
  await expect(anon.getByRole('button', { name: /Probecamp Ostern/ })).toBeVisible()
  await parentRegisters(browser, 'Mia', 'Jetzt anmelden')
  await parentRegisters(browser, 'Noah', 'Auf die Warteliste setzen')

  // 6. Club cancels Mia; Noah moves up automatically
  await page.goto(`/pilot/${CLUB.slug}/camps/probecamp-ostern`)
  await page.getByRole('button', { name: /Mia Testkind/ }).first().click()
  await page.getByRole('button', { name: 'Anmeldung stornieren' }).click()
  await page.locator('section[aria-label="Anmeldung stornieren"] button[type="submit"]').click()
  await expect(page.getByText(/storniert/).first()).toBeVisible({ timeout: 15_000 })
  await page.goto(`/pilot/${CLUB.slug}/warteliste`)
  await expect(page.getByText('Noah Testkind')).toHaveCount(0)
})
