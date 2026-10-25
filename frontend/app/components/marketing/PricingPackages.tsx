import Link from 'next/link'
import { pakete, paketAnfrageHref, preise, registrierungHref } from '../../(marketing)/preise/pakete'

export default function PricingPackages() {
  return (
    <>
      <div className="price-grid">
        {pakete.map((paket) => (
          <article className="price-card" key={paket.name} aria-label={paket.name}>
            <h3 className="d3">{paket.name}</h3>
            <p className="price-target">{paket.zielgruppe}</p>
            <p className="price-amount"><strong className="num">{paket.preis} {preise.waehrung}</strong> <span>{preise.zeitraum}</span></p>
            <p className="price-scope">{paket.umfang}</p>
            <ul className="price-features">
              {paket.features.map((feature) => <li key={feature}>{feature}</li>)}
            </ul>
            <Link className="btn price-cta" href={registrierungHref}>Verein registrieren</Link>
            <a className="price-inquiry" href={paketAnfrageHref(paket.name)}>
              {preise.anfrage}<span className="sr"> – {paket.name}</span>
            </a>
          </article>
        ))}
      </div>
      <p className="price-tax">{preise.steuerhinweis}</p>
      {preise.entwurf && <p className="price-note"><small>{preise.saisonhinweis}</small></p>}
    </>
  )
}
