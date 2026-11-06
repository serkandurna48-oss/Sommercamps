// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import ModuleDisabledScreen from './ModuleDisabledScreen'
import { ViewerProvider } from '../shell/ViewerContext'

vi.mock('next/link', () => ({
  default: ({ children, href, prefetch, ...props }: { children: React.ReactNode; href: string; prefetch?: boolean }) => {
    void prefetch
    return <a href={href} {...props}>{children}</a>
  },
  useLinkStatus: () => ({ pending: false }),
}))

it('erklärt dem Vereins-Admin per Du, dass das Modul nicht aktiviert ist, mit Kontakt-Hinweis', () => {
  const html = renderToStaticMarkup(<ModuleDisabledScreen orgSlug="demo" module="players" />)
  expect(html).toContain('Dieses Modul ist für deinen Verein nicht aktiviert')
  expect(html).toContain('Ansprechpartner bei CampsPilot')
  expect(html).toContain('href="/pilot/demo/dashboard"')
  expect(html).toContain('Spieler')
  expect(html).not.toContain('Module freischalten')
  expect(html).not.toMatch(/\bSie\b|Ihren/)
})

it('führt den Plattform-Betreiber statt in eine Sackgasse zum Modul-Schalter des Vereins', () => {
  const html = renderToStaticMarkup(
    <ViewerProvider isPlatformOwner><ModuleDisabledScreen orgSlug="jk-demo" module="trainings" /></ViewerProvider>,
  )
  expect(html).toContain('nicht freigeschaltet')
  expect(html).toContain('href="/platform/jk-demo#module"')
  expect(html).toContain('Module freischalten')
  expect(html).not.toContain('Ansprechpartner bei CampsPilot')
})
