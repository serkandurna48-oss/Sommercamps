import Link from 'next/link'
import BrandMark from '../../components/marketing/BrandMark'
import { marketingMetadata } from './seoMetadata'
import PilotRequestForm from './PilotRequestForm'
import RoiCalculator from './landing/RoiCalculator'
import { NightHero, NightPitch } from './landing/NightScene'
import {
  IconCalendar, IconCard, IconCheck, IconClipboard, IconEye, IconLock, IconPalette, IconPeople,
  IconPhone, IconPin, IconSheet, IconShield, IconSliders,
} from './landing/icons'
import { dashboardDemoHref, demoHref, features, heroFacts, loginHref, trust } from './landingContent'
import { faq, pakete, paketAnfrageHref, preise, registrierungHref, startSchritte, tarife } from '../preise/pakete'

export async function generateMetadata() {
  return marketingMetadata(
    '/campspilot',
    'Anmeldung Fußballcamp online – CampsPilot',
    'Online-Anmeldung für Fußballcamps von Vereinen und Fußballschulen. Camps, Teilnehmer, Zahlungen und Wartelisten an einer Stelle verwalten.',
    true,
  )
}

const ICONS = {
  calendar: IconCalendar, card: IconCard, palette: IconPalette, sheet: IconSheet, people: IconPeople, shield: IconShield,
  pin: IconPin, lock: IconLock, clipboard: IconClipboard, phone: IconPhone,
} as const

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'CampsPilot',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  description: 'Plattform für Sportvereine: Feriencamps erstellen, Anmeldungen und Zahlungen automatisch verwalten.',
  offers: { '@type': 'Offer', price: String(tarife.starter.monatCents / 100), priceCurrency: 'EUR' },
}

/** Dekorative Beispielkarte: zeigt, was Eltern sehen. Beispielwerte, keine Preise von CampsPilot. */
function HeroPreview() {
  return (
    <Link href={demoHref} className="lp-preview-link">
      <div className="lp-card lp-preview">
        <div className="lp-preview-top">
          <div>
            <span className="lp-pill">Fußball</span>
            <p className="lp-preview-title">Sommer-Fußballcamp</p>
          </div>
          <div className="lp-preview-price">
            <s>150 €</s>
            <strong>135 €</strong>
          </div>
        </div>
        <div className="lp-pill-row">
          <span className="lp-pill accent">Frühbucherpreis</span>
          <span className="lp-pill">10 % Geschwisterrabatt</span>
        </div>
        <div className="lp-bar"><i style={{ width: '75%' }} /></div>
        <div className="lp-preview-meta">
          <span>9 von 12 Plätzen belegt</span>
          <span className="lp-pill warn">Nur noch 3 Plätze frei</span>
        </div>
        <div className="lp-preview-cta">Jetzt anmelden</div>
        <p className="lp-fine">Beispiel: in der Live-Demo ausprobieren</p>
      </div>
    </Link>
  )
}

export default function CampsPilotPage() {
  return (
    <div className="lp-root">
      <a className="skip-link" href="#inhalt">Zum Inhalt springen</a>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />

      <nav className="nav solid" id="nav" aria-label="Hauptnavigation">
        <div className="wrap nav-in">
          <a className="brand" href="#top">
            <BrandMark className="mark-svg" width={35} height={24} />
            CampsPilot<span className="sr"> — Startseite</span>
          </a>
          <div className="lp-nav-links">
            <a href="#roi" className="lp-hide-sm">ROI-Rechner</a>
            <Link href="/preise">{preise.navigation}</Link>
            <Link href={loginHref}>Login</Link>
            <a href="#demo" className="lp-hide-sm">Demo ansehen</a>
          </div>
          <Link href={registrierungHref} className="btn sm fill"><span className="nav-long">Verein registrieren</span><span className="nav-short">Registrieren</span></Link>
        </div>
      </nav>

      <main id="inhalt" tabIndex={-1}>
        <header className="lp-hero" id="top">
          <div className="lp-hero-bg" aria-hidden><div className="lp-zoom"><NightHero className="lp-fill" /></div></div>
          <div className="lp-hero-veil" aria-hidden />
          <div className="wrap lp-hero-grid">
            <div>
              <p className="lp-label lp-rise">Für Vereine, die Feriencamps veranstalten</p>
              <h1 className="lp-display lp-rise" style={{ ['--i' as string]: 1 }}>Digitalisieren Sie Ihre Vereins-Feriencamps in 5 Minuten</h1>
              <p className="lp-lead lp-rise" style={{ ['--i' as string]: 2 }}>Anmeldung, Bezahlung und Teilnehmerlisten in einer Plattform – mit Ihrem Logo, Ihren Farben und Ihren Fragen.</p>
              <div className="hero-cta lp-rise" style={{ ['--i' as string]: 3 }}>
                <Link className="btn fill" href={demoHref}>Live-Demo ansehen</Link>
                <Link className="btn ghost" href={dashboardDemoHref}>Dashboard ausprobieren</Link>
                <a className="btn quiet" href="#roi">Ersparnis berechnen</a>
              </div>
              <ul className="lp-facts lp-rise" style={{ ['--i' as string]: 4 }}>
                {heroFacts.map((t) => <li key={t}><IconCheck />{t}</li>)}
              </ul>
            </div>
            <div className="lp-rise lp-hero-card" style={{ ['--i' as string]: 5 }}><HeroPreview /></div>
          </div>
        </header>

        <section className="wrap lp-sec" id="funktionen" aria-labelledby="funktionen-heading">
          <h2 className="lp-h2 lp-fade" id="funktionen-heading">Alles, was ein Camp braucht</h2>
          <div className="lp-grid lp-grid-3">
            {features.map((f) => {
              const Icon = ICONS[f.icon]
              return (
                <div className="lp-card lp-feature lp-fade lp-lift" key={f.title}>
                  <span className="lp-icon"><Icon /></span>
                  <div><h3>{f.title}</h3><p>{f.text}</p></div>
                </div>
              )
            })}
          </div>
        </section>

        <section className="wrap lp-sec narrow" id="demo" aria-labelledby="demo-heading">
          <div className="lp-center lp-fade">
            <h2 className="lp-h2" id="demo-heading">Erleben Sie CampsPilot, bevor Sie sich entscheiden</h2>
            <p className="lp-muted">Zwei Demos ohne Anmeldung: so sehen Eltern Ihre Seite, und so verwalten Sie Ihre Camps.</p>
          </div>
          <div className="lp-grid lp-grid-2">
            <div className="lp-card lp-demo lp-fade lp-lift">
              <NightPitch className="lp-demo-art" id="npa" />
              <span className="lp-icon"><IconEye /></span>
              <h3>Die Seite für Ihre Eltern</h3>
              <p>Camp-Karten, Anmeldung in drei Schritten und Bestätigung, genau wie bei einem echten Verein. Nichts wird gespeichert oder bezahlt.</p>
              <Link className="btn ghost lp-block" href={demoHref}>Live-Demo öffnen</Link>
            </div>
            <div className="lp-card lp-demo glow lp-fade lp-lift">
              <NightPitch className="lp-demo-art" id="npb" />
              <span className="lp-icon"><IconSliders /></span>
              <h3>Ihr Vereins-Dashboard</h3>
              <p>So sieht der Alltag im Verwaltungsbereich aus: Aufgaben, Auslastung, Zahlungen und Teilnehmerlisten. Mit Beispieldaten, ohne Anmeldung.</p>
              <Link className="btn fill lp-block" href={dashboardDemoHref}>Dashboard ausprobieren</Link>
            </div>
          </div>
        </section>

        <section className="wrap lp-sec narrow" id="roi" aria-labelledby="roi-heading">
          <div className="lp-center lp-fade">
            <h2 className="lp-h2" id="roi-heading">Was bringt das Ihrem Verein?</h2>
            <p className="lp-muted">Stellen Sie Ihre Zahlen ein – der Rechner reagiert sofort.</p>
          </div>
          <div className="lp-fade"><RoiCalculator /></div>
        </section>

        <section className="wrap lp-sec" id="vertrauen" aria-labelledby="vertrauen-heading">
          <div className="lp-center lp-fade">
            <h2 className="lp-h2" id="vertrauen-heading">Vertrauen von Anfang an</h2>
            <p className="lp-muted">Sorgfalt bei Daten und Zahlungen ist bei Kinder-Anmeldungen keine Nebensache.</p>
          </div>
          <div className="lp-grid lp-grid-4">
            {trust.map((t) => {
              const Icon = ICONS[t.icon]
              return (
                <div className="lp-card lp-fade" key={t.title}>
                  <span className="lp-icon"><Icon /></span>
                  <h3>{t.title}</h3>
                  <p>{t.text}</p>
                </div>
              )
            })}
          </div>
          <div className="lp-card lp-pilotcard lp-fade">
            <div>
              <h3>Pilotvereine gesucht</h3>
              <p>Wir suchen Vereine, die CampsPilot als Erste einsetzen und gemeinsam mit uns weiterentwickeln. Sprechen Sie uns an.</p>
            </div>
            <Link className="btn ghost" href={paketAnfrageHref('Verein')}>Pilotverein werden</Link>
          </div>
        </section>

        <section className="wrap lp-sec" id="preis" aria-labelledby="preis-heading">
          <div className="lp-center lp-fade">
            <h2 className="lp-h2" id="preis-heading">{preise.titel}</h2>
            <p className="lp-muted">{preise.einleitung}</p>
          </div>
          <div className="lp-grid lp-grid-3">
            {pakete.map((p) => (
              <article className={`lp-card lp-plan lp-lift${p.name === 'Verein' ? ' glow' : ''}`} key={p.name} aria-label={p.name}>
                <h3>{p.name}</h3>
                <p className="lp-muted">{p.zielgruppe}</p>
                <p className="lp-price"><strong className="num">{p.preis}</strong>{p.zeitraum && <span> {p.zeitraum}</span>}</p>
                <p className="lp-fee">{p.buchungsgebuehr}</p>
                <p className="lp-muted">{p.umfang}</p>
                <Link className={`btn ${p.name === 'Verein' ? 'fill' : 'ghost'} price-cta`} href={registrierungHref}>Verein registrieren</Link>
                <a className="lp-inquiry" href={paketAnfrageHref(p.name)}>{preise.anfrage}<span className="sr"> – {p.name}</span></a>
              </article>
            ))}
          </div>
          <p className="lp-fine lp-center">{preise.steuerhinweis}</p>
          <p className="lp-center lp-more"><Link href="/preise">Rechenbeispiel und häufige Fragen</Link></p>
        </section>

        <section className="wrap lp-sec narrow" id="fragen" aria-labelledby="fragen-heading">
          <h2 className="lp-h2 lp-fade" id="fragen-heading">{preise.faqTitel}</h2>
          <div className="faq-list">
            {faq.map((eintrag) => (
              <details className="faq-item" key={eintrag.frage}>
                <summary>{eintrag.frage}</summary>
                <p>{eintrag.antwort}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="wrap lp-sec lp-closing" id="pilot" aria-labelledby="pilot-heading">
          <div className="lp-closing-art lp-fade"><NightPitch className="lp-fill-w" id="npc" /></div>
          <div className="lp-center lp-fade">
            <h2 className="lp-h2" id="pilot-heading">Bereit für Ihr erstes Online-Camp?</h2>
            <p className="lp-muted">{preise.pilotEinleitung}</p>
          </div>
          <ol className="lp-steps">
            {startSchritte.map((s, i) => (
              <li key={s.titel}><span className="lp-step-n" aria-hidden>{i + 1}</span>{s.titel}</li>
            ))}
          </ol>
          <div className="start-actions lp-center-actions">
            <Link href={registrierungHref} className="btn fill">Verein registrieren</Link>
            <a href="#anfrage" className="btn ghost">Unverbindlich anfragen</a>
            <Link href={dashboardDemoHref} className="btn quiet">Dashboard ausprobieren</Link>
          </div>
          <div id="anfrage" className="lp-form"><PilotRequestForm /></div>
          <p className="form-note" id="formNote">
            Aktuelle Pilotvereine: <strong>KSV Baunatal</strong> und <strong>JK Performance Academy</strong>.
          </p>
          <p className="form-note">Bereits registriert? <Link href={loginHref} className="underline">Anmelden</Link></p>
        </section>
      </main>

      <footer className="foot">
        <div className="wrap foot-in">
          <a className="brand" href="#top">
            <BrandMark className="mark-svg" width={35} height={24} />
            CampsPilot
          </a>
          <span className="cl">Anmeldung und Verwaltung für Fußballcamps</span>
          <nav className="foot-links" aria-label="Preise und Rechtliches">
            <Link href="/preise">{preise.navigation}</Link>
            <Link href="/campspilot/impressum">Impressum</Link>
            <Link href="/campspilot/datenschutz">Datenschutz</Link>
            <Link href="/campspilot/teilnahmebedingungen">Teilnahmebedingungen</Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}
