// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import ModuleDisabledScreen from './ModuleDisabledScreen'

vi.mock('next/link', () => ({
  default: ({ children, href, prefetch, ...props }: { children: React.ReactNode; href: string; prefetch?: boolean }) => {
    void prefetch
    return <a href={href} {...props}>{children}</a>
  },
  useLinkStatus: () => ({ pending: false }),
}))

it('erklärt freundlich, dass das Modul nicht aktiviert ist, mit Kontakt-Hinweis', () => {
  const html = renderToStaticMarkup(<ModuleDisabledScreen orgSlug="demo" module="players" />)
  expect(html).toContain('Dieses Modul ist für Ihren Verein nicht aktiviert')
  expect(html).toContain('Ansprechpartner bei CampsPilot')
  expect(html).toContain('href="/pilot/demo/dashboard"')
  expect(html).toContain('Spieler')
})
