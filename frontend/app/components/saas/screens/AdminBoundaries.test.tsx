// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, expect, it, vi } from 'vitest'
import { de } from '../../../lib/i18n/de'
import Error0 from '../../../pilot/[org]/(org-admin)/error'
import Loading0 from '../../../pilot/[org]/(org-admin)/loading'
import Error1 from '../../../pilot/[org]/(org-admin)/anmeldungen/error'
import Loading1 from '../../../pilot/[org]/(org-admin)/anmeldungen/loading'
import Error2 from '../../../pilot/[org]/(org-admin)/aufgaben/error'
import Loading2 from '../../../pilot/[org]/(org-admin)/aufgaben/loading'
import Error3 from '../../../pilot/[org]/(org-admin)/camps/new/error'
import Loading3 from '../../../pilot/[org]/(org-admin)/camps/new/loading'
import Error4 from '../../../pilot/[org]/(org-admin)/camps/[campSlug]/error'
import Loading4 from '../../../pilot/[org]/(org-admin)/camps/[campSlug]/loading'
import Error5 from '../../../pilot/[org]/(org-admin)/camps/[campSlug]/aufgaben/error'
import Loading5 from '../../../pilot/[org]/(org-admin)/camps/[campSlug]/aufgaben/loading'
import Error6 from '../../../pilot/[org]/(org-admin)/camps/[campSlug]/konfiguration/error'
import Loading6 from '../../../pilot/[org]/(org-admin)/camps/[campSlug]/konfiguration/loading'
import Error7 from '../../../pilot/[org]/(org-admin)/camps/[campSlug]/warteliste/error'
import Loading7 from '../../../pilot/[org]/(org-admin)/camps/[campSlug]/warteliste/loading'
import Error8 from '../../../pilot/[org]/(org-admin)/camps/[campSlug]/zahlungen/error'
import Loading8 from '../../../pilot/[org]/(org-admin)/camps/[campSlug]/zahlungen/loading'
import Error9 from '../../../pilot/[org]/(org-admin)/dashboard/error'
import Loading9 from '../../../pilot/[org]/(org-admin)/dashboard/loading'
import Error10 from '../../../pilot/[org]/(org-admin)/einrichtung/error'
import Loading10 from '../../../pilot/[org]/(org-admin)/einrichtung/loading'
import Error11 from '../../../pilot/[org]/(org-admin)/hilfe/error'
import Loading11 from '../../../pilot/[org]/(org-admin)/hilfe/loading'
import Error12 from '../../../pilot/[org]/(org-admin)/konfiguration/error'
import Loading12 from '../../../pilot/[org]/(org-admin)/konfiguration/loading'
import Error13 from '../../../pilot/[org]/(org-admin)/warteliste/error'
import Loading13 from '../../../pilot/[org]/(org-admin)/warteliste/loading'
import Error14 from '../../../pilot/[org]/(org-admin)/zahlungen/error'
import Loading14 from '../../../pilot/[org]/(org-admin)/zahlungen/loading'
import Error15 from '../../../platform/(console)/error'
import Loading15 from '../../../platform/(console)/loading'
import Error16 from '../../../platform/(console)/audit-log/error'
import Loading16 from '../../../platform/(console)/audit-log/loading'
import Error17 from '../../../platform/(console)/new/error'
import Loading17 from '../../../platform/(console)/new/loading'
import Error18 from '../../../platform/(console)/registrations/error'
import Loading18 from '../../../platform/(console)/registrations/loading'
import Error19 from '../../../platform/(console)/[org]/error'
import Loading19 from '../../../platform/(console)/[org]/loading'
import Error20 from '../../../platform/(console)/[org]/preview/error'
import Loading20 from '../../../platform/(console)/[org]/preview/loading'

let pathname = '/pilot/demo/dashboard'
vi.mock('next/navigation', () => ({ usePathname: () => pathname }))
vi.mock('next/link', () => ({ default: ({ children, ...props }: { children: React.ReactNode }) => <a {...props}>{children}</a>, useLinkStatus: () => ({ pending: false }) }))
vi.mock('../shell/logoutAction', () => ({ logoutAction: vi.fn() }))
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
afterEach(() => { document.body.innerHTML = '' })

const routes = [['/pilot/demo/dashboard', Error0, Loading0],
['/pilot/demo/anmeldungen', Error1, Loading1],
['/pilot/demo/aufgaben', Error2, Loading2],
['/pilot/demo/camps/new', Error3, Loading3],
['/pilot/demo/camps/camp', Error4, Loading4],
['/pilot/demo/camps/camp/aufgaben', Error5, Loading5],
['/pilot/demo/camps/camp/konfiguration', Error6, Loading6],
['/pilot/demo/camps/camp/warteliste', Error7, Loading7],
['/pilot/demo/camps/camp/zahlungen', Error8, Loading8],
['/pilot/demo/dashboard', Error9, Loading9],
['/pilot/demo/einrichtung', Error10, Loading10],
['/pilot/demo/hilfe', Error11, Loading11],
['/pilot/demo/konfiguration', Error12, Loading12],
['/pilot/demo/warteliste', Error13, Loading13],
['/pilot/demo/zahlungen', Error14, Loading14],
['/platform', Error15, Loading15],
['/platform/audit-log', Error16, Loading16],
['/platform/new', Error17, Loading17],
['/platform/registrations', Error18, Loading18],
['/platform/demo', Error19, Loading19],
['/platform/demo/preview', Error20, Loading20]] as const
it.each(routes)('renders the error boundary on %s and calls reset', async (url, Boundary) => {
  pathname = url
  const reset = vi.fn()
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  try {
    await act(async () => root.render(<Boundary error={new Error('private 503 detail')} reset={reset} />))
    expect(container.querySelector('[role="alert"]')).not.toBeNull()
    expect(container.textContent).not.toContain('private 503 detail')
    const retry = [...container.querySelectorAll('button')].find(button => button.textContent === de.states.retry)
    expect(retry).toBeDefined()
    await act(async () => retry!.click())
    expect(reset).toHaveBeenCalledTimes(1)
    const dashboard = [...container.querySelectorAll('a')].find(link => link.textContent === de.states.dashboard)
    expect(dashboard?.getAttribute('href')).toBe(url.startsWith('/platform') ? '/platform' : '/pilot/demo/dashboard')
  } finally { await act(async () => root.unmount()) }
})

it.each(routes)('renders calm skeletons on %s', (url, _Boundary, Loading) => {
  pathname = url
  const container = document.createElement('div')
  container.innerHTML = renderToStaticMarkup(<Loading />)
  const status = container.querySelector('[role="status"]')
  expect(status?.getAttribute('aria-label')).toBe(de.states.loading)
  expect(status?.querySelectorAll('[aria-hidden="true"]').length).toBe(2)
})
