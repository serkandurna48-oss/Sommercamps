import type { ReactNode } from 'react'
import Link from '../preview/AdminLink'
import type { TabItem } from '../navTabs'
import PageTabs from './PageTabs'

export interface PageMetric {
  label: string
  value: string
  /** Occupancy 0-1, drawn as a thin orange bar under the value. */
  bar?: number
}

export interface PageHeaderProps {
  title: string
  /** Short meta line under the title (dates, status, one-sentence hint). */
  subtitle?: ReactNode
  /** Compact KPI row under the title. */
  metrics?: PageMetric[]
  /** Parent route for sub-pages (camp, offer, player, forms). */
  backHref?: string
  backLabel?: string
  /** The one primary action of the page, right-aligned. */
  action?: ReactNode
  /** In-page sub-navigation (camp pages). */
  tabs?: TabItem[]
  tabsLabel?: string
}

/** Slim light page header: title, meta, one action, KPI row, optional tab row. */
export default function PageHeader({ title, subtitle, metrics = [], backHref, backLabel = 'Zurück', action, tabs, tabsLabel = 'Bereiche' }: PageHeaderProps) {
  return (
    <header className="cp-page-head">
      {backHref && (
        <Link href={backHref} className="cp-focus cp-back-link">
          <span aria-hidden="true">←</span> {backLabel}
        </Link>
      )}
      <div className="cp-page-head-row">
        <div className="min-w-0 flex-1">
          <h1 className="cp-page-title break-words">{title}</h1>
          {subtitle && <p className="cp-page-meta">{subtitle}</p>}
        </div>
        {action && <div className="cp-page-action">{action}</div>}
      </div>
      {metrics.length > 0 && (
        <dl className="cp-kpi-row">
          {metrics.map(metric => (
            <div key={metric.label} className="cp-kpi">
              <dt className="cp-kpi-label">{metric.label}</dt>
              <dd className="cp-kpi-value cp-num">{metric.value}</dd>
              {typeof metric.bar === 'number' && (
                <dd className="cp-kpi-bar" aria-hidden="true">
                  <span style={{ width: `${Math.max(0, Math.min(1, metric.bar)) * 100}%` }} />
                </dd>
              )}
            </div>
          ))}
        </dl>
      )}
      {tabs && tabs.length > 0 && <PageTabs tabs={tabs} label={tabsLabel} />}
    </header>
  )
}
