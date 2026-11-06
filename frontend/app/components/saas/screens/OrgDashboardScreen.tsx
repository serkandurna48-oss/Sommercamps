import Link from '../preview/AdminLink'
import TodayRegistrations from '../data/TodayRegistrations'
import { todayRegistrations } from '../registrationDates'
import { ButtonLink } from '../ui/Button'
import { buildTasks, computeCampStats, pickNextCamp, taskHref, type Task } from '../dashboardLogic'
import { computeMoneyStats, isOpenPayment } from '../commandCenterLogic'
import { computeOnboardingSteps, missingRequiredOrgFields } from '../onboardingSteps'
import PageHeader from '../shell/PageHeader'
import DashboardCampsCard from '../data/DashboardCampsCard'
import OnboardingCard from '../state/OnboardingCard'
import LaunchSuccessCard from '../state/LaunchSuccessCard'
import CopyParentLinkButton from '../state/CopyParentLinkButton'
import { IconCalendar, IconPlus } from '../icons'
import { formatSessionWhen } from '../training/trainingLogic'
import { de, formatDateRange, formatEuro } from '../../../lib/i18n/de'
import type { OrganizationScreenProps } from './types'
import type { TrainingOverview } from '../trainingAdminData'
import type { TrainingPaymentGroup } from '../training/trainingPayments'
import { ADMIN_PAGE } from '../ui/pageLayout'

const DAY_MS = 24 * 60 * 60 * 1000

function taskTitle(task: Task): string {
  switch (task.kind) {
    case 'payment': return de.tasks.payment.title(task.count, task.campTitle)
    case 'missing-contact': return de.tasks.missingContact.title(task.count, task.campTitle)
    case 'waitlist': return de.tasks.waitlist.title(task.count, task.campTitle)
  }
}

function taskHint(task: Task): string {
  switch (task.kind) {
    case 'payment': return de.tasks.payment.hint
    case 'missing-contact': return de.tasks.missingContact.hint
    case 'waitlist': return de.tasks.waitlist.hint
  }
}

function KpiTile({ label, value, detail, href, bar }: { label: string; value: string; detail: string; href: string; bar?: number }) {
  return (
    <Link href={href} prefetch={false} className="cp-focus cp-card cp-kpi-tile">
      <span className="cp-kpi-tile-label">{label}</span>
      <span className="cp-kpi-tile-value cp-num">{value}</span>
      {typeof bar === 'number' && (
        <span className="cp-kpi-bar" aria-hidden="true"><span style={{ width: `${Math.max(0, Math.min(1, bar)) * 100}%` }} /></span>
      )}
      <span className="cp-kpi-tile-detail">{detail}</span>
    </Link>
  )
}

export default function OrgDashboardScreen({ orgSlug, org, camps, registrationsByCamp, training, trainingPayments = [], trainingPaymentsError = false, now = new Date() }: OrganizationScreenProps & {
  /** Offers and upcoming sessions; undefined where the caller did not load trainings (preview). */
  training?: TrainingOverview
  /** Training bookings for the open-payments KPI (same source as the payments page). */
  trainingPayments?: TrainingPaymentGroup[]
  trainingPaymentsError?: boolean
  now?: Date
}) {
  const campsWithStats = camps.map((camp, i) => computeCampStats(camp, registrationsByCamp[i] ?? []))
  const nextCamp = pickNextCamp(campsWithStats)
  const tasks = buildTasks(campsWithStats)

  const { step3Done } = computeOnboardingSteps(org, camps)
  const showOnboarding = !step3Done
  const missingFields = step3Done ? missingRequiredOrgFields(org) : []
  const publishedCamps = camps.filter(c => c.status === 'published')
  const totalRegistrations = registrationsByCamp.reduce((sum, r) => sum + r.length, 0)
  const showLaunchSuccess = publishedCamps.length === 1 && totalRegistrations === 0

  // KPI: occupancy across published camps that are not over yet.
  const todayIso = now.toISOString().slice(0, 10)
  const activeCamps = campsWithStats.filter(c => c.camp.status === 'published' && c.camp.end_date >= todayIso)
  const occupied = activeCamps.reduce((sum, c) => sum + c.registeredCount, 0)
  const capacity = activeCamps.reduce((sum, c) => sum + c.camp.capacity, 0)

  // KPI: open payments in euro across camps and trainings (same rules as the payments page).
  const paymentGroups = [...camps.map((camp, i) => ({ camp, registrations: registrationsByCamp[i] ?? [] })), ...trainingPayments]
  const openCents = paymentGroups.reduce((sum, g) => sum + computeMoneyStats(g.camp, g.registrations).openCents, 0)
  const openCount = paymentGroups.reduce((sum, g) => sum + g.registrations.filter(isOpenPayment).length, 0)
  const openScope = trainingPaymentsError ? 'nur Camps, Trainings nicht geladen' : 'Camps und Trainings'

  // KPI: camp registrations today / last 7 days (Berlin calendar day).
  const today = todayRegistrations(camps, registrationsByCamp, now)
  const weekStart = now.getTime() - 7 * DAY_MS
  const lastWeek = registrationsByCamp.flat().filter(r => {
    const t = Date.parse(r.created_at)
    return !Number.isNaN(t) && t >= weekStart && t <= now.getTime()
  }).length

  // KPI + list: upcoming training sessions.
  const upcoming = training?.upcoming ?? []
  const nextWeekSessions = upcoming.filter(({ session }) => Date.parse(session.starts_at) - now.getTime() <= 7 * DAY_MS)
  const offers = training?.offers ?? []
  const sessionTarget = offers.length === 1 ? `/pilot/${orgSlug}/trainings/${offers[0].id}#termin-anlegen` : `/pilot/${orgSlug}/trainings`

  const firstTask = tasks[0]

  return (
    <>
      <PageHeader
        title="Übersicht"
        subtitle={nextCamp
          ? <>{de.dashboard.nextCamp}: <span style={{ color: 'var(--cp-ink-2)' }}>{nextCamp.camp.title}</span> · {formatDateRange(nextCamp.camp.start_date, nextCamp.camp.end_date)}</>
          : de.dashboard.noUpcomingCampHint}
        action={showOnboarding ? undefined : (
          <>
            <ButtonLink href={sessionTarget} variant="secondary"><IconPlus size={16} />Termin anlegen</ButtonLink>
            <CopyParentLinkButton orgSlug={orgSlug} label="Link teilen" />
          </>
        )}
      />

      <main className={ADMIN_PAGE}>
        {showOnboarding && (
          <section className="mb-6">
            <OnboardingCard orgSlug={orgSlug} org={org} camps={camps} />
          </section>
        )}

        <section aria-label="Kennzahlen" className="cp-kpi-grid mb-6">
          <KpiTile
            label="Belegte Plätze"
            value={capacity > 0 ? `${occupied}/${capacity}` : '–'}
            bar={capacity > 0 ? occupied / capacity : undefined}
            detail={activeCamps.length === 1 ? 'in 1 laufenden Camp' : `in ${activeCamps.length} laufenden Camps`}
            href={`/pilot/${orgSlug}/camps`}
          />
          <KpiTile
            label="Offene Zahlungen"
            value={formatEuro(openCents)}
            detail={`${openCount === 1 ? '1 Anmeldung' : `${openCount} Anmeldungen`} · ${openScope}`}
            href={`/pilot/${orgSlug}/zahlungen`}
          />
          <KpiTile
            label="Anmeldungen heute"
            value={String(today.length)}
            detail={`${lastWeek} in den letzten 7 Tagen`}
            href={`/pilot/${orgSlug}/anmeldungen`}
          />
          <KpiTile
            label="Trainings 7 Tage"
            value={training?.error ? '–' : String(nextWeekSessions.length)}
            detail={training?.error ? 'Termine nicht geladen'
              : upcoming[0] ? `nächster: ${formatSessionWhen(upcoming[0].session.local_date, upcoming[0].session.local_time)}` : 'keine Termine geplant'}
            href={`/pilot/${orgSlug}/trainings`}
          />
        </section>

        <div className="cp-dash-grid mb-6">
          <section className="cp-card cp-card-list" aria-labelledby="dashboard-upnext">
            <div className="cp-card-head">
              <h2 id="dashboard-upnext" className="cp-heading">{de.dashboard.upNext}</h2>
              {tasks.length > 0 && <Link href={`/pilot/${orgSlug}/aufgaben`} prefetch={false} className="cp-focus cp-card-link">Alle Aufgaben</Link>}
            </div>
            {missingFields.length > 0 && (
              <div className="cp-dash-row" style={{ background: 'var(--cp-pending-bg)' }}>
                <div className="min-w-0 flex-1">
                  <p className="cp-label" style={{ color: 'var(--cp-ink)' }}>{de.onboarding.missingFieldsHint(missingFields)}</p>
                </div>
                <ButtonLink href={`/pilot/${orgSlug}/konfiguration`} variant="secondary">{de.onboarding.missingFieldsAction}</ButtonLink>
              </div>
            )}
            {showOnboarding ? (
              <p className="cp-body cp-dash-pad" style={{ color: 'var(--cp-muted)' }}>Schließen Sie zuerst die Einrichtung oben ab.</p>
            ) : firstTask ? (
              <ul>
                {tasks.slice(0, 5).map((task, index) => (
                  <li key={task.id} className="cp-dash-row">
                    <span aria-hidden="true" className="cp-dash-dot" data-kind={task.kind} />
                    <div className="min-w-0 flex-1">
                      <p className="cp-label" style={{ color: 'var(--cp-ink)' }}>{taskTitle(task)}</p>
                      <p className="cp-hint">{taskHint(task)}</p>
                    </div>
                    <ButtonLink href={taskHref(orgSlug, task)} variant={index === 0 ? 'primary' : 'secondary'}>{de.tasks.review}</ButtonLink>
                  </li>
                ))}
              </ul>
            ) : showLaunchSuccess ? (
              <div className="cp-dash-pad"><LaunchSuccessCard orgSlug={orgSlug} /></div>
            ) : missingFields.length === 0 ? (
              <p className="cp-body cp-dash-pad" style={{ color: 'var(--cp-muted)' }}>Keine offenen Aufgaben. Ihre Anmeldeseite ist live.</p>
            ) : null}
            {tasks.length > 5 && (
              <p className="cp-hint cp-dash-pad">+ {tasks.length - 5} weitere unter „Aufgaben“</p>
            )}
          </section>

          <div className="flex min-w-0 flex-col gap-4 lg:gap-5">
          <section className="cp-card cp-card-list" aria-labelledby="dashboard-sessions">
            <div className="cp-card-head">
              <h2 id="dashboard-sessions" className="cp-heading">Nächste Termine</h2>
              <Link href={`/pilot/${orgSlug}/trainings`} prefetch={false} className="cp-focus cp-card-link">Trainings</Link>
            </div>
            {training?.error ? (
              <p role="alert" className="cp-body cp-dash-pad" style={{ color: 'var(--cp-error)' }}>Trainingstermine konnten nicht geladen werden.</p>
            ) : upcoming.length === 0 ? (
              <p className="cp-body cp-dash-pad" style={{ color: 'var(--cp-muted)' }}>Keine anstehenden Trainingstermine.</p>
            ) : (
              <ul>
                {upcoming.slice(0, 5).map(({ offer, session }) => (
                  <li key={session.id}>
                    <Link href={`/pilot/${orgSlug}/trainings/${offer.id}`} prefetch={false} className="cp-focus cp-dash-row cp-dash-link">
                      <IconCalendar size={18} className="shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="cp-label block truncate" style={{ color: 'var(--cp-ink)' }}>{offer.title}</span>
                        <span className="cp-hint block">{formatSessionWhen(session.local_date, session.local_time)}</span>
                      </span>
                      <span className="cp-label cp-num shrink-0" style={{ color: session.free_spots === 0 ? 'var(--cp-ok)' : 'var(--cp-ink-2)' }}>
                        {session.booked_count}/{session.capacity}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {!showOnboarding && <TodayRegistrations entries={today} orgSlug={orgSlug} className="" />}
          </div>
        </div>

        <DashboardCampsCard camps={campsWithStats} orgSlug={orgSlug} action={
          <ButtonLink href={`/pilot/${orgSlug}/camps/new`} variant="secondary">+ Camp anlegen</ButtonLink>
        } />
      </main>
    </>
  )
}

