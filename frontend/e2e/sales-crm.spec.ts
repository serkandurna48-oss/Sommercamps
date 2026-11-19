/**
 * Browser E2E (phone viewport) of the sales CRM, stage 1, on the real local
 * stack with fake Supabase Auth: the platform owner invites a sales rep and a
 * sales lead, both set their password from the invite link and land in
 * /vertrieb; the owner imports leads; the lead assigns one to the rep; the rep
 * works it and cannot open a lead that is not theirs; the lead sees the team.
 * Synthetic accounts and leads only.
 */
import { expect, test, type Browser, type Page } from '@playwright/test'

const AUTH = 'http://127.0.0.1:59999'
const OWNER = { email: 'owner@e2e.example', password: 'e2e-owner-password' }
const REP = { name: 'Rita Vertrieb', email: 'rita@sales.e2e.example', password: 'rita-passwort-123' }
const LEAD = { name: 'Lars Leitung', email: 'lars@sales.e2e.example', password: 'lars-passwort-123' }
const PHONE = { width: 390, height: 844 }
const T = { timeout: 15_000 }

async function login(page: Page, email: string, password: string) {
  await page.goto('/platform/login')
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(password)
  await page.locator('button[type="submit"]').click()
}

async function phone(browser: Browser) {
  return (await browser.newContext({ viewport: PHONE, isMobile: true, hasTouch: true })).newPage()
}

async function noHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
  // Clipped overflow does not scroll but still hides content: every button must sit inside the viewport.
  const outside = await page.evaluate(() => [...document.querySelectorAll('button, a')]
    .filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1) })
    .map(el => el.textContent?.trim()))
  expect(outside).toEqual([])
}

async function acceptInvite(browser: Browser, person: typeof REP) {
  const res = await fetch(`${AUTH}/__outbox?email=${encodeURIComponent(person.email)}`)
  const mails = (await res.json()) as { kind: string; link?: string }[]
  const invite = mails.filter(m => m.kind === 'recovery_link').at(-1)
  expect(invite?.link).toContain(encodeURIComponent('http://127.0.0.1:3113/vertrieb/neues-passwort').replace(/%2F/g, '/'))
  const page = await phone(browser)
  await page.goto(invite!.link!)
  await expect(page.getByRole('heading', { name: 'Passwort festlegen' })).toBeVisible(T)
  await expect(page).not.toHaveURL(/access_token/)
  await page.locator('input[name="password"]').fill(person.password)
  await page.locator('input[name="passwordConfirmation"]').fill(person.password)
  await page.getByRole('button', { name: 'Passwort speichern' }).click()
  await expect(page.getByText('Dein Passwort ist gespeichert')).toBeVisible(T)
  await login(page, person.email, person.password)
  await expect(page).toHaveURL(/\/vertrieb$/, T)
  return page
}

test('Vertrieb: Einladung, Import, Zuweisung, Rechte am Handy', async ({ browser }) => {
  test.setTimeout(180_000)

  // 1. Owner invites rep and lead in the platform team area.
  const owner = await phone(browser)
  await login(owner, OWNER.email, OWNER.password)
  await expect(owner).toHaveURL(/\/platform$/, T)
  await owner.goto('/platform/team')
  for (const [person, role] of [[REP, 'Vertrieb'], [LEAD, 'Vertriebsleitung']] as const) {
    await owner.getByPlaceholder('Name', { exact: true }).fill(person.name)
    await owner.getByPlaceholder('name@beispiel.de', { exact: true }).fill(person.email)
    await owner.getByLabel('Rolle').selectOption({ label: role })
    await owner.getByRole('button', { name: 'Einladen' }).click()
    await expect(owner.getByText(`Einladung an ${person.email} gesendet`)).toBeVisible(T)
  }
  await expect(owner.getByText('Vertrieb (2)')).toBeVisible(T)
  await noHorizontalScroll(owner)

  // 2. Owner imports leads (check first, then import).
  await owner.goto('/vertrieb/import')
  const csv = 'Verein;Ort;Passung;Quelle\nE2E Fußballschule Nord;Kassel;A;https://example.com/q\nE2E SV Süd;Fulda;B;\n'
  await owner.locator('input[type="file"]').setInputFiles({ name: 'leads.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
  await owner.getByRole('button', { name: '1. Prüfen' }).click()
  await expect(owner.getByText('2 Leads würden angelegt.')).toBeVisible(T)
  await owner.locator('input[type="file"]').setInputFiles({ name: 'leads.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
  await owner.getByRole('button', { name: '2. Importieren' }).click()
  await expect(owner.getByText('2 Leads angelegt.')).toBeVisible(T)

  // 3. Both accept their invite and land directly in /vertrieb.
  const rep = await acceptInvite(browser, REP)
  await expect(rep.getByRole('heading', { name: 'Meine Leads' })).toBeVisible()
  await expect(rep.getByText('Dir sind noch keine Leads zugeordnet')).toBeVisible()
  await expect(rep.getByRole('link', { name: 'Team' })).toHaveCount(0)
  const lead = await acceptInvite(browser, LEAD)
  await expect(lead.getByRole('heading', { name: 'Leads' })).toBeVisible()

  // 4. The lead assigns one pool lead to the rep.
  await lead.getByRole('navigation', { name: 'Ansicht' }).getByRole('link', { name: 'Nicht verteilt' }).click()
  await lead.getByRole('link', { name: /E2E Fußballschule Nord/ }).click()
  await expect(lead).toHaveURL(/\/vertrieb\/[0-9a-f-]{36}$/, T)
  const assignedUrl = lead.url()
  await lead.getByLabel('Zuständig').selectOption({ label: REP.name })
  await lead.getByRole('button', { name: 'Zuweisen' }).click()
  await expect(lead.getByText('Zugewiesen.')).toBeVisible(T)
  await lead.goto('/vertrieb?ansicht=unassigned')
  const otherLeadUrl = await lead.getByRole('link', { name: /E2E SV Süd/ }).getAttribute('href')

  // 5. The rep sees exactly that lead, works it, and cannot open the other one.
  await rep.reload()
  await expect(rep.getByRole('link', { name: /E2E Fußballschule Nord/ })).toBeVisible(T)
  await expect(rep.getByText('E2E SV Süd')).toHaveCount(0)
  await rep.getByRole('link', { name: /E2E Fußballschule Nord/ }).click()
  await expect(rep).toHaveURL(assignedUrl)
  await rep.getByLabel('Status').selectOption({ label: 'Kontaktiert' })
  await rep.getByLabel('Nächster Schritt am').fill('2026-12-01')
  await rep.getByLabel('Notiz zum Gespräch').fill('Jugendleiter erreicht, Demo nach Ostern-Planung')
  await rep.getByRole('button', { name: 'Speichern', exact: true }).click()
  await expect(rep.getByText('Gespeichert.')).toBeVisible(T)
  await rep.reload()
  await expect(rep.getByText('Status: Neu → Kontaktiert')).toBeVisible(T)
  await expect(rep.getByText('Jugendleiter erreicht, Demo nach Ostern-Planung')).toBeVisible()
  await noHorizontalScroll(rep)
  await rep.screenshot({ path: 'playwright-results/e2e/sales-lead-detail-mobile.png', fullPage: true })

  const foreign = await rep.goto(otherLeadUrl!)
  expect(foreign?.status()).toBe(404)
  await rep.goto('/vertrieb/team')
  await expect(rep).toHaveURL(/\/vertrieb$/, T)
  await rep.goto('/platform')
  await expect(rep).toHaveURL(/\/vertrieb$/, T)

  // 6. The lead sees the team overview with the rep's work.
  await lead.goto('/vertrieb/team')
  const row = lead.getByRole('listitem').filter({ hasText: REP.name })
  await expect(row).toContainText('1 offen', T)
  await noHorizontalScroll(lead)
  await lead.screenshot({ path: 'playwright-results/e2e/sales-team-mobile.png', fullPage: true })

  // 7. Owner deactivates the rep: access ends on the next request.
  await owner.goto('/platform/team')
  await owner.getByRole('listitem').filter({ hasText: REP.name }).getByRole('button', { name: 'Deaktivieren' }).click()
  await expect(owner.getByRole('listitem').filter({ hasText: REP.name })).toContainText('(deaktiviert)', T)
  await rep.goto('/vertrieb')
  await expect(rep).not.toHaveURL(/\/vertrieb/, T)

  for (const page of [owner, rep, lead]) await page.context().close()
})
