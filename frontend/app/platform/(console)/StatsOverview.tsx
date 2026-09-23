import type { PlatformStats } from '../../lib/saasAdminApi'

function formatEuros(cents: number): string {
  return (cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--cp-r-card)] border p-4" style={{ borderColor: 'var(--cp-line)', background: 'var(--cp-surface)' }}>
      <p className="cp-chip" style={{ color: 'var(--cp-muted)' }}>
        {label}
      </p>
      <p className="cp-title mt-1" style={{ color: 'var(--cp-ink)' }}>
        {value}
      </p>
    </div>
  )
}

/** CEO-Konsole-Übersicht (feat/platform-foundation) — Kennzahlen aus
 * GET /admin/stats, eine einzelne Aggregat-Query im Backend (siehe
 * repositories/platform_stats.py), hier nur reine Darstellung. */
export default function StatsOverview({ stats }: { stats: PlatformStats }) {
  return (
    <section className="mb-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatTile label="Vereine veröffentlicht" value={String(stats.organizations_published)} />
      <StatTile label="Vereine im Entwurf" value={String(stats.organizations_draft)} />
      <StatTile label="Camps gesamt" value={String(stats.camps_total)} />
      <StatTile label="Warteliste gesamt" value={String(stats.waitlist_total)} />
      <StatTile label="Anmeldungen gesamt" value={String(stats.registrations_total)} />
      <StatTile label="Anmeldungen (30 Tage)" value={String(stats.registrations_last_30_days)} />
      <StatTile label="Zahlungen offen" value={formatEuros(stats.payments_open_cents)} />
      <StatTile label="Zahlungen eingegangen" value={formatEuros(stats.payments_paid_cents)} />
    </section>
  )
}
