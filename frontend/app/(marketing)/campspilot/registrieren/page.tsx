import type { Metadata } from 'next'
import Link from 'next/link'
import BrandMark from '../../../components/marketing/BrandMark'
import RegistrierenForm from './RegistrierenForm'

export const metadata: Metadata = {
  title: 'Verein registrieren – CampsPilot',
  description: 'Legen Sie Ihren Verein in CampsPilot an und starten Sie mit Ihrer ersten Anmeldeseite.',
}

export default function RegistrierenPage() {
  return (
    <div className="cp-scope">
      <nav className="nav" id="nav">
        <div className="wrap nav-in">
          <Link className="brand" href="/campspilot">
            <BrandMark className="mark-svg" width={35} height={24} />
            CampsPilot<span className="sr"> — Startseite</span>
          </Link>
          <Link href="/campspilot" className="btn sm ghost">Zur Übersicht</Link>
        </div>
      </nav>

      <main className="reg-page">
        <section className="reg-main">
          <div className="wrap">
            <RegistrierenForm />
          </div>
        </section>
      </main>

      <footer className="foot">
        <div className="wrap foot-in">
          <Link className="brand" href="/campspilot">
            <BrandMark className="mark-svg" width={35} height={24} />
            CampsPilot
          </Link>
          <nav className="foot-links">
            <Link href="/campspilot/impressum">Impressum</Link>
            <Link href="/campspilot/datenschutz">Datenschutz</Link>
            <Link href="/campspilot/teilnahmebedingungen">Teilnahmebedingungen</Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}
