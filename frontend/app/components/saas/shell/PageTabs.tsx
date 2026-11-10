'use client'

import { useLinkStatus } from 'next/link'
import { usePathname } from 'next/navigation'
import Link from '../preview/AdminLink'
import { previewHref, useAdminPreview } from '../preview/AdminPreviewContext'
import { activeTabHref, type TabItem } from '../navTabs'

function TabHint() {
  const { pending } = useLinkStatus()
  return <span aria-hidden="true" className="cp-tab-hint" data-pending={pending} />
}

/** Compact in-page tab row (camp sub-navigation). Active tab: orange underline + aria-current. */
export default function PageTabs({ tabs, label }: { tabs: TabItem[]; label: string }) {
  const pathname = usePathname() ?? ''
  const preview = useAdminPreview()
  const tabPath = (href: string) => (preview ? previewHref(href, preview.empty, preview.basePath).split('?')[0] : href)
  const activeHref = activeTabHref(pathname, tabs.map(tab => tabPath(tab.href)))
  return (
    <nav aria-label={label} className="cp-page-tabs">
      {tabs.map(tab => {
        const active = activeHref !== undefined && tabPath(tab.href) === activeHref
        return (
          <Link
            key={tab.href}
            href={tab.href}
            prefetch={false}
            data-active={active}
            aria-current={active ? 'page' : undefined}
            className="cp-focus cp-page-tab"
          >
            {tab.label}
            <TabHint />
          </Link>
        )
      })}
    </nav>
  )
}
