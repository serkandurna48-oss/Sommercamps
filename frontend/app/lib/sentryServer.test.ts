// @vitest-environment node
// Runs the real server SDK with sentryOptions() and a capturing transport, so
// the test sees what would actually leave the process - including data the SDK
// adds by itself (Next.js request context, headers, cookies). Nothing is sent.
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import * as Sentry from '@sentry/nextjs'
import { sentryOptions } from './sentryScrub'

const TOKEN = '3f2b8a1c-9d4e-4f6a-8b7c-1a2b3c4d5e6f'
const SECRETS = ['Maximiliane', 'max.test@example.com', TOKEN, 'cookie-value', 'Bearer-secret', '203.0.113.7']
const sent: string[] = []

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://public@o0.ingest.de.sentry.io/0')
  Sentry.init({
    ...sentryOptions(),
    integrations: [],
    transport: () => ({
      send: async (envelope: unknown) => { sent.push(JSON.stringify(envelope)); return {} },
      flush: async () => true,
    }),
  })
})

afterAll(async () => {
  await Sentry.close()
  vi.unstubAllEnvs()
})

it('reports a server render error with the route pattern and no personal data', async () => {
  Sentry.captureRequestError(
    new Error('Buchung für Maximiliane max.test@example.com nicht gefunden'),
    {
      path: `/pilot/ksv-baunatal/buchung/${TOKEN}?email=max.test@example.com&name=Maximiliane`,
      method: 'GET',
      headers: { cookie: 'cp_admin_token=cookie-value', authorization: 'Bearer-secret', 'x-forwarded-for': '203.0.113.7', 'user-agent': 'vitest' },
    },
    { routerKind: 'App Router', routePath: '/pilot/[org]/buchung/[token]', routeType: 'render' },
  )
  await Sentry.flush(2000)
  const text = sent.join('\n')
  expect(text).toContain('"type":"Error"')
  expect(text).toContain('/pilot/[org]/buchung/[token]')
  for (const secret of SECRETS) expect(text, `${secret} leaked`).not.toContain(secret)
})

it('collects nothing automatically and runs no tracing or session integration', () => {
  const client = Sentry.getClient()!
  expect(client.getDataCollectionOptions()).toMatchObject({
    userInfo: false, cookies: false, urlQueryParams: false, stackFrameVariables: false,
    httpHeaders: { request: false, response: false }, httpBodies: [],
  })
  expect(client.getOptions().tracesSampleRate).toBeUndefined()
  const names = client.getOptions().integrations.map((integration) => integration.name)
  for (const forbidden of ['Http', 'ProcessSession', 'LocalVariablesAsync', 'ContextLines', 'Console', 'BrowserTracing', 'Replay']) {
    expect(names).not.toContain(forbidden)
  }
})
