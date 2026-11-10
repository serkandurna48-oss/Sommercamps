'use client'

import Image from 'next/image'
import NextLink, { useLinkStatus } from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useId, useRef, useState, type ComponentType } from 'react'
import Link from '../preview/AdminLink'
import { previewHref, previewLogoutAction, useAdminPreview } from '../preview/AdminPreviewContext'
import CampsPilotMark from '../brand/CampsPilotMark'
import {
  IconBoard, IconChevronDown, IconClose, IconCoin, IconFlag, IconGear, IconHelp, IconHourglass, IconInbox,
  IconJersey, IconLogout, IconMenu, IconPeople, IconSidebar, IconTent, IconWhistle, type IconProps,
} from '../icons'
import { activeTabHref, adminNav, adminNavFooter, adminNavItems, type NavGroup, type NavIconName, type TabItem } from '../navTabs'
import { logoutAction } from './logoutAction'
import { useSidebarPrefs } from './sidebarState'
import { useIsPlatformOwner } from './ViewerContext'
import { ALL_MODULES, type OrgModule } from '../../../lib/orgModules'

const ICONS: Record<NavIconName, ComponentType<IconProps>> = {
  board: IconBoard, coin: IconCoin, hourglass: IconHourglass, flag: IconFlag, gear: IconGear, jersey: IconJersey,
  tent: IconTent, whistle: IconWhistle, inbox: IconInbox, people: IconPeople, help: IconHelp,
}

export interface AdminSidebarProps {
  orgSlug: string
  orgName: string
  orgLogoUrl: string | null
  /** The club's own colour: only a thin accent under the logo tile. */
  clubColor?: string
  /** Cookie mirror of the stored preferences, read by the layout so the rail renders collapsed without a flash. */
  sidebarPrefsRaw?: string | null
  /** Enabled modules; entries of other modules are hidden. Default: all (tests, previews). */
  modules?: readonly OrgModule[]
}

/**
 * Immediate click feedback: navigation keeps the previous page on screen
 * while the next one loads (no loading.tsx swap of the navigation), so the
 * clicked entry shows a pulsing dot until the target renders.
 */
function PendingHint() {
  const { pending } = useLinkStatus()
  return <span aria-hidden="true" className="cp-tab-hint cp-nav-hint" data-pending={pending} />
}

function useActiveHref(orgSlug: string, modules: readonly OrgModule[]) {
  const pathname = usePathname() ?? ''
  const preview = useAdminPreview()
  const toPath = (href: string) => (preview ? previewHref(href, preview.empty, preview.basePath).split('?')[0] : href)
  const active = activeTabHref(pathname, adminNavItems(orgSlug, modules).map(item => toPath(item.href)))
  return (href: string) => active !== undefined && toPath(href) === active
}

function NavLink({ item, active, rail, onNavigate }: { item: TabItem; active: boolean; rail: boolean; onNavigate?: () => void }) {
  const Icon = item.icon ? ICONS[item.icon] : undefined
  return (
    <Link
      href={item.href}
      // Menu clicks must not prefetch every admin route at once (each prefetch hits /admin/me).
      prefetch={false}
      onClick={onNavigate}
      data-active={active}
      aria-current={active ? 'page' : undefined}
      title={rail ? item.label : undefined}
      className="cp-focus cp-nav-item"
    >
      {Icon && <Icon size={18} className="shrink-0" />}
      <span className={rail ? 'sr-only' : 'min-w-0 truncate'}>{item.label}</span>
      <PendingHint />
    </Link>
  )
}

function OrgIdentity({ orgSlug, orgName, orgLogoUrl, clubColor, rail, modules = ALL_MODULES }: AdminSidebarProps & { rail: boolean }) {
  const isPlatformOwner = useIsPlatformOwner()
  const lockedModules = ALL_MODULES.filter(module => !modules.includes(module)).length
  const initial = orgName.trim().charAt(0).toUpperCase()
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span
        className="cp-org-tile relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden"
        style={clubColor ? { '--cp-club': clubColor } as React.CSSProperties : undefined}
        title={rail ? orgName : undefined}
      >
        {orgLogoUrl ? (
          <Image src={orgLogoUrl} alt="" fill unoptimized className="object-contain p-1" />
        ) : (
          <span className="cp-label" style={{ color: 'var(--cp-on-band)' }}>{initial}</span>
        )}
      </span>
      <div className={rail ? 'sr-only' : 'flex min-w-0 flex-col'}>
        <span className="cp-label truncate" style={{ color: 'var(--cp-on-band)', fontSize: 15 }}>{orgName}</span>
        {isPlatformOwner && (
          <NextLink href={`/platform/${orgSlug}`} className="cp-focus cp-chip underline" style={{ color: 'var(--cp-on-band-2)' }}>
            ← Zur Plattform
          </NextLink>
        )}
        {isPlatformOwner && lockedModules > 0 && (
          <NextLink href={`/platform/${orgSlug}#module`} className="cp-focus cp-chip underline" style={{ color: 'var(--cp-on-band-2)' }}>
            Module freischalten
          </NextLink>
        )}
      </div>
    </div>
  )
}

function LogoutItem({ orgSlug, rail }: { orgSlug: string; rail: boolean }) {
  const preview = useAdminPreview()
  return (
    <form action={preview ? previewLogoutAction : logoutAction.bind(null, orgSlug)}>
      <button type="submit" className="cp-focus cp-nav-item w-full" title={rail ? 'Abmelden' : undefined}>
        <IconLogout size={18} className="shrink-0" />
        <span className={rail ? 'sr-only' : 'min-w-0 truncate'}>Abmelden</span>
      </button>
    </form>
  )
}

/** The navigation list shared by the desktop sidebar and the mobile drawer. */
function NavBody({ orgSlug, modules, rail, closedGroups, onToggleGroup, onNavigate, footerExtra }: {
  orgSlug: string
  modules: readonly OrgModule[]
  footerExtra?: React.ReactNode
  rail: boolean
  closedGroups: string[]
  onToggleGroup: (id: string) => void
  onNavigate?: () => void
}) {
  const isActive = useActiveHref(orgSlug, modules)
  const baseId = useId()
  const groups: NavGroup[] = adminNav(orgSlug, modules)
  return (
    <>
      <nav aria-label="Verwaltung" className="cp-nav-scroll">
        {groups.map((group, index) => {
          const hasActive = group.items.some(item => isActive(item.href))
          // The group holding the current page always stays open.
          const open = rail || !group.id || hasActive || !closedGroups.includes(group.id)
          const listId = `${baseId}-g${index}`
          return (
            <div key={group.id ?? `g${index}`} className="cp-nav-group">
              {group.label && !rail && (
                <button
                  type="button"
                  className="cp-focus cp-nav-group-head"
                  aria-expanded={open}
                  aria-controls={listId}
                  onClick={() => group.id && !hasActive && onToggleGroup(group.id)}
                  aria-disabled={hasActive || undefined}
                >
                  <span>{group.label}</span>
                  <IconChevronDown size={14} className="cp-nav-chevron shrink-0" />
                </button>
              )}
              {group.label && rail && index > 0 && <span aria-hidden="true" className="cp-nav-rule" />}
              <ul id={listId} hidden={!open} className="flex flex-col gap-0.5">
                {group.items.map(item => (
                  <li key={item.href}>
                    <NavLink item={item} active={isActive(item.href)} rail={rail} onNavigate={onNavigate} />
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </nav>
      <div className="cp-nav-foot">
        <ul className="flex flex-col gap-0.5">
          {adminNavFooter(orgSlug).map(item => (
            <li key={item.href}>
              <NavLink item={item} active={isActive(item.href)} rail={rail} onNavigate={onNavigate} />
            </li>
          ))}
          <li><LogoutItem orgSlug={orgSlug} rail={rail} /></li>
        </ul>
        <div className="cp-nav-brand-row">
          <p className="cp-nav-brand" title={rail ? 'Verwaltung mit CampsPilot' : undefined}>
            <CampsPilotMark width={24} height={16} />
            <span className={rail ? "sr-only" : undefined}>CampsPilot</span>
          </p>
          {footerExtra}
        </div>
      </div>
    </>
  )
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Mobile/tablet drawer: modal dialog with focus trap, Escape, overlay click and scroll lock. */
function NavDrawer({ open, onClose, returnFocusRef, children, labelId }: {
  open: boolean
  onClose: () => void
  returnFocusRef: React.RefObject<HTMLButtonElement | null>
  children: React.ReactNode
  labelId: string
}) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const panel = panelRef.current
    const returnTo = returnFocusRef.current
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panel?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    // Rotating/resizing to desktop width hides the drawer via CSS: close it so the scroll lock goes too.
    const desktop = typeof window.matchMedia === 'function' ? window.matchMedia('(min-width: 1024px)') : null
    function onViewport(event: MediaQueryListEvent) {
      if (event.matches) onClose()
    }
    if (desktop?.matches) onClose()
    desktop?.addEventListener('change', onViewport)

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !panel) return
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(el => !el.closest('[hidden]'))
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      desktop?.removeEventListener('change', onViewport)
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      returnTo?.focus()
    }
  }, [open, onClose, returnFocusRef])

  if (!open) return null
  return (
    <div className="cp-drawer">
      <div className="cp-drawer-overlay" aria-hidden="true" onClick={onClose} data-testid="drawer-overlay" />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={labelId} className="cp-drawer-panel cp-band">
        {children}
      </div>
    </div>
  )
}

/**
 * Admin navigation: a dark sidebar at >= 1024 px (collapsible to an icon
 * rail, remembered per browser), a slim top bar with a drawer below that.
 */
export default function AdminSidebar(props: AdminSidebarProps) {
  const { orgSlug, orgName } = props
  const modules = props.modules ?? ALL_MODULES
  const [prefs, setPrefs] = useSidebarPrefs(props.sidebarPrefsRaw ?? null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const drawerLabelId = useId()
  const rail = prefs.collapsed

  const toggleGroup = (id: string) => setPrefs({
    ...prefs,
    closedGroups: prefs.closedGroups.includes(id) ? prefs.closedGroups.filter(g => g !== id) : [...prefs.closedGroups, id],
  })
  const closeDrawer = useCallback(() => setDrawerOpen(false), [])

  return (
    <>
      {/* < 1024 px: slim top bar */}
      <header className="cp-topbar cp-band cp-noprint">
        <button
          ref={menuButtonRef}
          type="button"
          className="cp-focus cp-icon-btn"
          aria-label="Menü öffnen"
          aria-expanded={drawerOpen}
          aria-haspopup="dialog"
          onClick={() => setDrawerOpen(true)}
        >
          <IconMenu size={20} />
        </button>
        <OrgIdentity {...props} rail={false} />
        <span className="ml-auto flex shrink-0 items-center" style={{ color: 'var(--cp-on-band-2)' }} aria-label="CampsPilot" role="img">
          <CampsPilotMark width={24} height={16} />
        </span>
      </header>
      <NavDrawer open={drawerOpen} onClose={closeDrawer} returnFocusRef={menuButtonRef} labelId={drawerLabelId}>
        <div className="cp-nav-head">
          <h2 id={drawerLabelId} className="sr-only">Navigation {orgName}</h2>
          <OrgIdentity {...props} rail={false} />
          <button type="button" className="cp-focus cp-icon-btn ml-auto" aria-label="Menü schließen" data-autofocus onClick={closeDrawer}>
            <IconClose size={20} />
          </button>
        </div>
        <NavBody orgSlug={orgSlug} modules={modules} rail={false} closedGroups={prefs.closedGroups} onToggleGroup={toggleGroup} onNavigate={closeDrawer} />
      </NavDrawer>

      {/* >= 1024 px: sidebar */}
      <aside className="cp-sidebar cp-band cp-noprint" data-collapsed={rail} aria-label="Seitenleiste">
        <div className="cp-nav-head">
          <OrgIdentity {...props} rail={rail} />
        </div>
        <NavBody
          orgSlug={orgSlug}
          modules={modules}
          rail={rail}
          closedGroups={prefs.closedGroups}
          onToggleGroup={toggleGroup}
          footerExtra={
            <button
              type="button"
              className="cp-focus cp-icon-btn"
              aria-label={rail ? 'Seitenleiste ausklappen' : 'Seitenleiste einklappen'}
              title={rail ? 'Seitenleiste ausklappen' : 'Seitenleiste einklappen'}
              onClick={() => setPrefs({ ...prefs, collapsed: !rail })}
            >
              <IconSidebar size={18} />
            </button>
          }
        />
      </aside>
    </>
  )
}
