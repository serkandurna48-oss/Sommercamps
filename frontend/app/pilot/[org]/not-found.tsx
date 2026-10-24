import PublicState from './PublicState'
import RetryButton from './RetryButton'
import { publicFontClassName } from './publicFonts'
import './publicTheme.css'

export default function OrgNotFound() {
  return (
    <main className={`cp-public public-state-page ${publicFontClassName('kompakt')}`} data-theme="kompakt">
      <PublicState
        title="Vereinsseite nicht verfügbar"
        message="Unter diesem Link ist kein veröffentlichter Verein erreichbar."
        instruction="Bitte prüfen Sie den Vereinslink und versuchen Sie es erneut."
      >
        <RetryButton />
      </PublicState>
    </main>
  )
}
