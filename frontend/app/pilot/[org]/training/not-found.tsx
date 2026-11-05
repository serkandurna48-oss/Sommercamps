import Link from 'next/link'
import PublicState from '../PublicState'
import { publicFontClassName } from '../publicFonts'
import '../publicTheme.css'

export default function TrainingNotFound() {
  return (
    <main className={`cp-public public-state-page ${publicFontClassName('kompakt')}`} data-theme="kompakt">
      <PublicState
        title="Angebot nicht verfügbar"
        message="Unter diesem Link ist kein veröffentlichtes Trainingsangebot erreichbar."
        instruction="Bitte prüfen Sie den Link oder fragen Sie beim Verein nach."
      >
        <Link className="btn primary btn-pill" href="/">Zur Startseite</Link>
      </PublicState>
    </main>
  )
}
