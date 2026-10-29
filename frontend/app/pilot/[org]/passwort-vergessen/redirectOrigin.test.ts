import { describe, expect, it } from 'vitest'
import { authRedirectOrigin } from './redirectOrigin'

describe('authRedirectOrigin', () => {
  it('nimmt außerhalb von Vercel die explizite Site-URL', () => {
    expect(authRedirectOrigin({ NEXT_PUBLIC_SITE_URL: 'https://app.example.org/x' })).toBe('https://app.example.org')
  })
  it('Vorschau mit gesetzter SEO-Site-URL verlinkt trotzdem auf sich selbst', () => {
    expect(authRedirectOrigin({ NEXT_PUBLIC_SITE_URL: 'https://campspilot.de', VERCEL_ENV: 'preview', VERCEL_BRANCH_URL: 'campspilot-git-demo-jan-team.vercel.app' })).toBe('https://campspilot-git-demo-jan-team.vercel.app')
  })
  it('Production verlinkt auf die Production-Domain', () => {
    expect(authRedirectOrigin({ VERCEL_ENV: 'production', VERCEL_PROJECT_PRODUCTION_URL: 'campspilot.vercel.app', VERCEL_BRANCH_URL: 'x-git-main.vercel.app' })).toBe('https://campspilot.vercel.app')
  })
  it('Staging-Vorschau verlinkt auf sich selbst, nie auf Production', () => {
    expect(authRedirectOrigin({ VERCEL_ENV: 'preview', VERCEL_PROJECT_PRODUCTION_URL: 'campspilot.vercel.app', VERCEL_BRANCH_URL: 'campspilot-git-demo-jan-team.vercel.app' })).toBe('https://campspilot-git-demo-jan-team.vercel.app')
  })
  it('verwirft manipulierte Hostnamen und fällt auf den Standard zurück', () => {
    expect(authRedirectOrigin({ VERCEL_ENV: 'preview', VERCEL_BRANCH_URL: 'evil.com/@x' })).toBe('https://campspilot.de')
  })
})
