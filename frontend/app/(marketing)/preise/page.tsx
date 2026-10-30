import Link from 'next/link'
import BrandMark from '../../components/marketing/BrandMark'
import PricingPackages from '../../components/marketing/PricingPackages'
import StartSteps from '../../components/marketing/StartSteps'
import { marketingMetadata } from '../campspilot/seoMetadata'
import { faq, preise, registrierungHref } from './pakete'

export async function generateMetadata() {
  return marketingMetadata('/preise', 'Preise – CampsPilot', preise.einleitung)
}

export default function PreisePage() {
  return (
    <>
      <a className="skip-link" href="#inhalt">Zum Inhalt springen</a>
      <nav className="nav solid" aria-label="Hauptnavigation">
        <div className="wrap nav-in">
          <Link className="brand" href="/campspilot">
            <BrandMark className="mark-svg" width={35} height={24} />
            CampsPilot<span className="sr"> — Startseite</span>
          </Link>
          <Link className="btn sm fill" href={registrierungHref}><span className="nav-long">Verein registrieren</span><span className="nav-short">Registrieren</span></Link>
        </div>
      </nav>
      <main id="inhalt" tabIndex={-1}>
        <header className="pricing-intro">
          <div className="wrap sec">
            <div className="sec-head wide">
              <p className="label">{preise.navigation}</p>
              <h1 className="d2">{preise.titel}</h1>
              <p className="lead">{preise.einleitung}</p>
              <div className="hero-cta">
                <Link className="btn fill" href={registrierungHref}>Verein registrieren</Link>
                <Link className="btn ghost" href="/campspilot#pilot">Unverbindlich anfragen</Link>
              </div>
            </div>
          </div>
        </header>
        <section className="light" id="preis" aria-labelledby="preis-heading">
          <div className="wrap sec">
            <h2 className="d2" id="preis-heading">Die Pakete im Überblick</h2>
            <PricingPackages />
          </div>
        </section>
        <StartSteps />
        <section id="fragen" aria-labelledby="fragen-heading">
          <div className="wrap sec">
            <h2 className="d2" id="fragen-heading">{preise.faqTitel}</h2>
            <div className="faq-list">
              {faq.map((eintrag) => (
                <details className="faq-item" key={eintrag.frage}>
                  <summary>{eintrag.frage}</summary>
                  <p>{eintrag.antwort}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>
      <footer className="foot">
        <div className="wrap foot-in">
          <Link className="brand" href="/campspilot">CampsPilot</Link>
          <nav className="foot-links" aria-label="Rechtliches">
            <Link href="/campspilot/impressum">Impressum</Link>
            <Link href="/campspilot/datenschutz">Datenschutz</Link>
            <Link href="/campspilot/teilnahmebedingungen">Teilnahmebedingungen</Link>
          </nav>
        </div>
      </footer>
    </>
  )
}
