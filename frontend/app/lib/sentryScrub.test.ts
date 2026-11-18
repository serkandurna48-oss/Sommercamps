import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ErrorEvent } from '@sentry/nextjs'
import { REMOVED, maskText, scrubBreadcrumb, scrubEvent, sentryEnvironment, sentryOptions, SentryTestError } from './sentryScrub'

const TOKEN = '3f2b8a1c-9d4e-4f6a-8b7c-1a2b3c4d5e6f'
const SECRETS = ['Maximiliane', 'Mustermann-Test', '2015-04-01', 'Erdnussallergie', 'max.test@example.com', TOKEN, 'cookie-value', '203.0.113.7']

function dirtyEvent(): ErrorEvent {
  return {
    type: undefined,
    message: 'Anmeldung für Maximiliane fehlgeschlagen',
    transaction: `/pilot/ksv-baunatal/buchung/${TOKEN}`,
    user: { email: 'max.test@example.com', ip_address: '203.0.113.7' },
    extra: { form: { childFirstName: 'Maximiliane', allergies: 'Erdnussallergie' } },
    tags: { last_child: 'Maximiliane' },
    contexts: {
      browser: { name: 'Chrome' },
      form_state: { childFirstName: 'Maximiliane' },
      nextjs: {
        request_path: `/pilot/ksv-baunatal/buchung/${TOKEN}?email=max.test@example.com`,
        router_kind: 'App Router', router_path: '/pilot/[org]/buchung/[token]', route_type: 'render',
      },
    },
    request: {
      url: `https://campspilot.example/pilot/ksv-baunatal/buchung/${TOKEN}?email=max.test@example.com`,
      method: 'GET',
      query_string: 'email=max.test@example.com',
      cookies: { cp_admin_token: 'cookie-value' },
      data: { childBirthDate: '2015-04-01' },
      headers: { 'User-Agent': 'vitest', Referer: `https://campspilot.example/x/${TOKEN}`, Cookie: 'cp_admin_token=cookie-value' },
    },
    exception: {
      values: [
        {
          type: 'Error',
          value: 'Speichern fehlgeschlagen für Maximiliane Mustermann-Test (2015-04-01)',
          stacktrace: { frames: [{ function: 'submit', lineno: 3, filename: `https://campspilot.example/_next/a.js?t=${TOKEN}`, vars: { name: 'Maximiliane' }, context_line: "const n = 'Maximiliane'" }] },
        },
        { type: 'TypeError', value: `Cannot read properties of undefined (reading 'slug') at ${TOKEN}` },
        { type: 'SyntaxError', value: `Unexpected token 'M', "Maximiliane Mustermann-Test"... is not valid JSON` },
      ],
    },
    breadcrumbs: [
      { category: 'console', message: 'form state Maximiliane' },
      { category: 'ui.input', message: 'input#childFirstName' },
      { category: 'ui.click', message: 'button.cp-row[aria-label="Maximiliane Mustermann-Test, Details"]' },
      { category: 'ui.keypress', message: 'input#childFirstName[name="Maximiliane"]' },
      { category: 'log', message: 'saved Maximiliane' },
      { category: 'fetch', message: 'POST for Maximiliane', data: { method: 'POST', status_code: 422, url: `https://api.example/registrations?x=Maximiliane`, request_body_size: 512, body: 'Maximiliane' } },
      { category: 'navigation', data: { from: `/buchung/${TOKEN}`, to: '/pilot/ksv-baunatal?camp=ostern' } },
    ],
  }
}

describe('scrubEvent', () => {
  it('lets no personal value through', () => {
    const text = JSON.stringify(scrubEvent(dirtyEvent()))
    for (const secret of SECRETS) expect(text).not.toContain(secret)
  })

  it('keeps what is needed to find the bug', () => {
    const event = scrubEvent(dirtyEvent())!
    expect(event.request).toEqual({
      url: 'https://campspilot.example/pilot/ksv-baunatal/buchung/[id]',
      method: 'GET',
      headers: { 'User-Agent': 'vitest' },
    })
    expect(event.transaction).toBe('/pilot/ksv-baunatal/buchung/[id]')
    const [generic, engine, syntax] = event.exception!.values!
    expect(syntax.value).toBe(REMOVED)
    expect(event.tags).toBeUndefined()
    expect(event.contexts).toEqual({
      browser: { name: 'Chrome' },
      nextjs: { router_kind: 'App Router', router_path: '/pilot/[org]/buchung/[token]', route_type: 'render' },
    })
    expect(generic.type).toBe('Error')
    expect(generic.value).toBe(REMOVED)
    expect(generic.stacktrace!.frames![0]).toEqual({ function: 'submit', lineno: 3, filename: 'https://campspilot.example/_next/a.js' })
    expect(engine.value).toBe("Cannot read properties of undefined (reading 'slug') at [id]")
    expect(event.breadcrumbs!.map((crumb) => crumb.category)).toEqual(['fetch', 'navigation'])
    expect(event.breadcrumbs![0].data).toEqual({ method: 'POST', status_code: 422, url: 'https://api.example/registrations' })
    expect(event.breadcrumbs![0].message).toBeUndefined()
    expect(event.breadcrumbs![1].data).toEqual({ from: '/buchung/[id]', to: '/pilot/ksv-baunatal' })
  })

  it('keeps the marker text of the deliberate test error', () => {
    const error = new SentryTestError()
    const event = scrubEvent({ type: undefined, exception: { values: [{ type: error.name, value: error.message }] } })!
    expect(event.exception!.values![0].value).toBe('CampsPilot Sentry test (frontend)')
  })

  it('drops the event when cleaning fails', () => {
    const broken = { type: undefined, get exception(): never { throw new Error('boom') } } as unknown as ErrorEvent
    expect(scrubEvent(broken)).toBeNull()
  })
})

describe('scrubBreadcrumb', () => {
  it('drops every category that is not navigation or network', () => {
    for (const category of ['console', 'ui.click', 'ui.keypress', 'ui.input', 'log', 'sentry.event', undefined]) {
      expect(scrubBreadcrumb({ category, message: 'x' })).toBeNull()
    }
  })
})

describe('maskText', () => {
  it('caps the length', () => {
    expect(maskText('x'.repeat(5000)).length).toBeLessThanOrEqual(301)
  })
})

describe('sentryOptions', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('is off without a DSN', () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', '')
    const options = sentryOptions()
    expect(options.enabled).toBe(false)
    expect(options.dsn).toBeUndefined()
  })

  it('is on with a DSN, collects nothing by itself, and has no tracing or default integrations', () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://public@o0.ingest.de.sentry.io/0')
    const options = sentryOptions()
    expect(options.enabled).toBe(true)
    expect(options.dataCollection).toMatchObject({
      userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false,
      stackFrameVariables: false, frameContextLines: 0,
    })
    expect(options).not.toHaveProperty('tracesSampleRate')
    expect(options.tracePropagationTargets).toEqual([])
    expect(options.defaultIntegrations).toBe(false)
    expect(options.beforeSend).toBe(scrubEvent)
    expect(options.beforeBreadcrumb).toBe(scrubBreadcrumb)
  })

  it('maps Vercel environments so staging and production stay apart', () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_ENVIRONMENT', '')
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'production')
    expect(sentryEnvironment()).toBe('production')
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'preview')
    expect(sentryEnvironment()).toBe('staging')
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', '')
    expect(sentryEnvironment()).toBe('development')
    vi.stubEnv('NEXT_PUBLIC_SENTRY_ENVIRONMENT', 'Staging')
    expect(sentryEnvironment()).toBe('staging')
  })
})
