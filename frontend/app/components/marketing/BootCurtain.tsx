// Markenmoment beim Laden. Verschwindet über die reine CSS-Animation
// `cp-bootOut` (marketing.css, delay 1.55s) — SiteMotion beschleunigt das
// später nur um ~100ms und entfernt den Knoten danach aus dem DOM. Läuft
// JavaScript nicht, hebt sich der Vorhang trotzdem: das ist Absicht, siehe
// Ticket Abschnitt 7.3.
export default function BootCurtain() {
  return (
    <div className="boot" id="boot" aria-hidden="true">
      <svg className="mark-svg" viewBox="0 0 28 32" width="70" height="80" aria-hidden="true">
        <path className="stroke line" d="M3 4V29H26" />
        <path className="stroke arc" d="M3 18A11 11 0 0 1 14 29" />
        <path className="pennant" d="M3.7 4.7L17 9L3.7 13.3Z" />
      </svg>
    </div>
  )
}
