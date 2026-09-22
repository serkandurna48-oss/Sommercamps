// Markenmoment beim Laden. Verschwindet über die reine CSS-Animation
// `cp-bootOut` (marketing.css, delay 1.55s) — SiteMotion beschleunigt das
// später nur um ~100ms und entfernt den Knoten danach aus dem DOM. Läuft
// JavaScript nicht, hebt sich der Vorhang trotzdem: das ist Absicht, siehe
// Ticket Abschnitt 7.3.
//
// Rahmen und Mittellinie zeichnen sich zusammen (.stroke, 1000ms), der
// Mittelkreis mit +300ms Versatz (.circle) — dieselbe Zählung wie
// "Linien zeichnen sich / Bogen +300ms Versatz" aus Ticket Abschnitt 8,
// nur auf die neue Spielfeld-Bildmarke übertragen. Der Anstoßpunkt poppt
// zuletzt ein (.pennant), wie zuvor der Wimpel.
export default function BootCurtain() {
  return (
    <div className="boot" id="boot" aria-hidden="true">
      <svg className="mark-svg" viewBox="0 0 112 76" width="130" height="88" aria-hidden="true">
        <rect className="stroke line" x="6" y="6" width="100" height="64" rx="10" fill="none" />
        <path className="stroke line" d="M56 6V33M56 43V70" fill="none" />
        <circle className="stroke circle" cx="56" cy="38" r="15" fill="none" />
        <circle className="pennant" cx="56" cy="38" r="3.5" />
      </svg>
    </div>
  )
}
