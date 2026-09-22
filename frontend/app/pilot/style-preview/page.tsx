import { archivo } from '../../components/saas/fonts'
import { computeBrandTokens } from '../../components/saas/brandPipeline'
import '../../components/saas/tokens.css'

/**
 * Interne Vorschauseite für Richtung C — zeigt die Typo-Skala (Schritt 2)
 * und die Mandanten-Farbpipeline für beide echten Testfälle aus 3.3
 * (Schritt 3). Kein Produkt-Screen, nicht verlinkt, keine echten/DSGVO-
 * relevanten Daten. Dient als Checkpoint-Screenshot-Quelle für Serkan.
 */

const TYPE_ROWS = [
  { cls: 'cp-band-hero', label: 'band-hero · 52/1.0', sample: 'Ostercamp 2027' },
  { cls: 'cp-band-metric', label: 'band-metric · 38/1.0', sample: '16/24' },
  { cls: 'cp-band-title', label: 'band-title · 18/1.2', sample: 'Ostercamp 2027' },
  { cls: 'cp-title', label: 'title · 24/1.2', sample: 'Alle Camps' },
  { cls: 'cp-heading', label: 'heading · 21/1.25', sample: 'Fünf Familien haben noch nicht bezahlt' },
  { cls: 'cp-subheading', label: 'subheading · 16–17/1.3', sample: 'Lena Mustermann' },
  { cls: 'cp-body', label: 'body · 15/1.55', sample: 'Der Platz ist reserviert, sobald die Zahlung eingeht.' },
  { cls: 'cp-label', label: 'label · 13/1.4', sample: 'ZAHLUNG OFFEN' },
  { cls: 'cp-chip', label: 'chip · 12/1.2', sample: 'Warteliste' },
]

function BrandSwatch({ name, primaryColor }: { name: string; primaryColor: string }) {
  const tokens = computeBrandTokens(primaryColor)
  return (
    <div
      className="cp-scope rounded-[var(--cp-r-card)] border p-6"
      style={
        {
          borderColor: 'var(--cp-line)',
          '--cp-brand': tokens.brand,
          '--cp-brand-strong': tokens.brandStrong,
          '--cp-brand-on': tokens.brandOn,
          '--cp-brand-tint': `color-mix(in oklab, ${tokens.brand} 8%, white)`,
        } as React.CSSProperties
      }
    >
      <p className="cp-label mb-4" style={{ color: 'var(--cp-muted)' }}>
        {name} · Eingabe {primaryColor}
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex flex-col items-center gap-1.5">
          <div className="h-14 w-14 rounded-full border" style={{ background: tokens.brand, borderColor: 'var(--cp-line)' }} />
          <span className="cp-chip" style={{ color: 'var(--cp-muted)' }}>brand</span>
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <div className="h-14 w-14 rounded-full" style={{ background: tokens.brandStrong }} />
          <span className="cp-chip" style={{ color: 'var(--cp-muted)' }}>brand-strong</span>
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-full border"
            style={{ background: 'var(--cp-brand-tint)', borderColor: 'var(--cp-line)' }}
          >
            <span className="cp-chip" style={{ color: 'var(--cp-ink)' }}>tint</span>
          </div>
          <span className="cp-chip" style={{ color: 'var(--cp-muted)' }}>brand-tint</span>
        </div>
        <button
          type="button"
          className="cp-subheading rounded-[var(--cp-r-field)] px-6 py-3"
          style={{ background: tokens.brandStrong, color: tokens.brandOn }}
        >
          Neues Camp
        </button>
      </div>
    </div>
  )
}

export default function StylePreviewPage() {
  return (
    <div className={`${archivo.variable} cp-scope min-h-screen p-10`}>
      <div className="mx-auto max-w-3xl space-y-14">
        <header>
          <p className="cp-label" style={{ color: 'var(--cp-muted)' }}>
            Richtung C · interne Vorschau, nicht verlinkt
          </p>
          <h1 className="cp-title mt-1">Tokens, Typografie, Mandantenfarben</h1>
        </header>

        <section>
          <h2 className="cp-heading mb-4">Typo-Skala (Archivo, eine Familie)</h2>
          <div className="rounded-[var(--cp-r-card)] border" style={{ borderColor: 'var(--cp-line)', background: 'var(--cp-surface)' }}>
            {TYPE_ROWS.map((row, i) => (
              <div
                key={row.cls}
                className="flex flex-col gap-1 px-6 py-5"
                style={{ borderTop: i === 0 ? 'none' : '1px solid var(--cp-line-2)' }}
              >
                <span className="cp-chip" style={{ color: 'var(--cp-muted)' }}>{row.label}</span>
                <span className={row.cls}>{row.sample}</span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="cp-heading mb-4">Mandanten-Pipeline (Abschnitt 3.3, beide Testfälle)</h2>
          <div className="space-y-4">
            <BrandSwatch name="KSV Baunatal" primaryColor="#C8102E" />
            <BrandSwatch name="JK Performance Academy" primaryColor="#C79B3B" />
          </div>
        </section>

        <section>
          <h2 className="cp-heading mb-4">Band + Status (Abschnitt 3.1)</h2>
          <div className="rounded-[var(--cp-r-card)] p-6" style={{ background: 'var(--cp-band)', color: 'var(--cp-on-band)' }}>
            <p className="cp-band-title">Dunkles Matchday-Band</p>
            <p className="cp-body mt-1" style={{ color: 'var(--cp-on-band-2)' }}>
              Text auf dem Band, zweite Stufe
            </p>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            {(['ok', 'pending', 'error', 'info'] as const).map(status => (
              <span
                key={status}
                className="cp-chip rounded-[var(--cp-r-chip)] border px-3 py-1.5"
                style={{
                  color: `var(--cp-${status})`,
                  background: `var(--cp-${status}-bg)`,
                  borderColor: `var(--cp-${status}-line)`,
                }}
              >
                {status}
              </span>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
