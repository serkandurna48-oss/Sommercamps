/**
 * Nacht-Illustrationen der Startseite (Flutlicht über nassem Kunstrasen), übernommen aus der Vorführ-App.
 * Reines SVG, keine Fotos, frei von Rechten Dritter. Dekorativ: aria-hidden, kein JavaScript.
 * Die Akzentfarbe (Leibchen, Hütchen) kommt aus --brand (siehe landing.css).
 */

function Tower({ x, h = 330 }: { x: number; h?: number }) {
  return (
    <g>
      <rect x={x - 3} y={300 - h + 60} width="6" height={h + 120} fill="#0d1518" />
      <rect x={x - 34} y={300 - h + 30} width="68" height="34" rx="4" fill="#101a1d" />
      {[-24, -8, 8, 24].map((dx) => (
        <circle key={dx} cx={x + dx} cy={300 - h + 47} r="5" fill="#f4f8f6" />
      ))}
    </g>
  )
}

function Cone({ x, i, w = 360 }: { x: number; i: number; w?: number }) {
  // Klasse lp-beam: die Flutlichter gehen beim Laden nacheinander an (Reihenfolge i)
  return (
    <polygon
      className="lp-beam"
      style={{ ['--i' as string]: i }}
      points={`${x - 30},${300 - 330 + 64} ${x + 30},${300 - 330 + 64} ${x + w / 2},560 ${x - w / 2},560`}
      fill="url(#ns-beam)"
    />
  )
}

function Player({ x, y, s = 1, bib = false }: { x: number; y: number; s?: number; bib?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx="0" cy="58" rx="16" ry="4" fill="#000" opacity=".35" />
      <rect x="-8" y="30" width="6" height="26" rx="3" fill="#0c1316" />
      <rect x="2" y="30" width="6" height="26" rx="3" fill="#0c1316" />
      <rect x="-12" y="2" width="24" height="32" rx="9" fill={bib ? 'var(--brand)' : '#162226'} />
      <circle cx="0" cy="-8" r="9" fill="#0f181b" />
    </g>
  )
}

/** Breite Hero-Szene: Flutlichtmasten, Tribüne, Spielfeld mit Spiegelung. */
export function NightHero({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 1600 760" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden focusable="false">
      <defs>
        <linearGradient id="ns-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#060a0c" />
          <stop offset="1" stopColor="#14201f" />
        </linearGradient>
        <linearGradient id="ns-beam" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#eaf3ee" stopOpacity=".5" />
          <stop offset="1" stopColor="#eaf3ee" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="ns-grass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1f4a33" />
          <stop offset="1" stopColor="#0e2218" />
        </linearGradient>
        <radialGradient id="ns-glow" cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#f4f8f6" stopOpacity=".75" />
          <stop offset="1" stopColor="#f4f8f6" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="1600" height="760" fill="url(#ns-sky)" />
      {[260, 560, 1040, 1340].map((x) => <circle key={x} cx={x} cy="96" r="130" fill="url(#ns-glow)" />)}
      <Cone x={260} i={0} /><Cone x={560} i={1} /><Cone x={1040} i={2} /><Cone x={1340} i={3} />
      {/* Tribüne */}
      <path d="M0 470 L0 380 L180 350 L1420 350 L1600 380 L1600 470 Z" fill="#0b1316" />
      {Array.from({ length: 46 }).map((_, i) => (
        <rect key={i} x={60 + i * 33} y={366 + (i % 3) * 14} width="6" height="4" fill="#f4f8f6" opacity={0.15 + (i % 4) * 0.06} />
      ))}
      <Tower x={260} /><Tower x={560} /><Tower x={1040} /><Tower x={1340} />
      {/* Spielfeld */}
      <polygon points="0,470 1600,470 1600,760 0,760" fill="url(#ns-grass)" />
      <g stroke="#e9f1ec" strokeOpacity=".7" strokeWidth="3" fill="none">
        <line x1="0" y1="600" x2="1600" y2="600" strokeOpacity=".3" />
        <ellipse cx="800" cy="600" rx="190" ry="46" />
        <path d="M420 760 L520 520 L1080 520 L1180 760" />
        <path d="M640 520 L660 478 L940 478 L960 520" strokeOpacity=".35" />
      </g>
      {/* Spiegelung der Flutlichter auf dem nassen Rasen */}
      {[260, 560, 1040, 1340].map((x) => <ellipse key={x} cx={x} cy="640" rx="38" ry="150" fill="#eaf3ee" opacity=".14" />)}
      {/* Hütchen, Ball, Spieler */}
      {[640, 720, 800, 880, 960].map((x, i) => (
        <polygon key={x} points={`${x},${628 + (i % 2) * 6} ${x + 9},${650 + (i % 2) * 6} ${x - 9},${650 + (i % 2) * 6}`} fill="var(--brand)" />
      ))}
      <Player x={470} y={560} s={1.1} bib />
      <Player x={1130} y={570} s={1.05} />
      <Player x={1230} y={548} s={0.9} bib />
      <circle cx="560" cy="640" r="9" fill="#f4f8f6" />
    </svg>
  )
}

/** Kleine Szene für Karten (Demos, Abschluss). */
export function NightPitch({ className, id = 'np' }: { className?: string; id?: string }) {
  return (
    <svg viewBox="0 0 640 300" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden focusable="false">
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#070c0e" />
          <stop offset="1" stopColor="#15221f" />
        </linearGradient>
        <linearGradient id={`${id}-beam`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#eaf3ee" stopOpacity=".3" />
          <stop offset="1" stopColor="#eaf3ee" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="640" height="300" fill={`url(#${id}-sky)`} />
      <polygon points="120,30 160,30 250,210 30,210" fill={`url(#${id}-beam)`} />
      <polygon points="480,30 520,30 610,210 390,210" fill={`url(#${id}-beam)`} />
      <rect x="138" y="30" width="4" height="120" fill="#0d1518" /><rect x="498" y="30" width="4" height="120" fill="#0d1518" />
      <rect x="116" y="20" width="48" height="16" rx="3" fill="#101a1d" /><rect x="476" y="20" width="48" height="16" rx="3" fill="#101a1d" />
      <circle cx="132" cy="28" r="3.5" fill="#f4f8f6" /><circle cx="148" cy="28" r="3.5" fill="#f4f8f6" />
      <circle cx="492" cy="28" r="3.5" fill="#f4f8f6" /><circle cx="508" cy="28" r="3.5" fill="#f4f8f6" />
      <polygon points="0,170 640,170 640,300 0,300" fill="#10241a" />
      <g stroke="#e9f1ec" strokeOpacity=".45" strokeWidth="2" fill="none">
        <ellipse cx="320" cy="228" rx="92" ry="22" />
        <line x1="0" y1="228" x2="640" y2="228" strokeOpacity=".3" />
      </g>
      <polygon points="260,214 266,230 254,230" fill="var(--brand)" /><polygon points="380,214 386,230 374,230" fill="var(--brand)" />
      <rect x="296" y="190" width="14" height="22" rx="5" fill="var(--brand)" /><circle cx="303" cy="184" r="6" fill="#0f181b" />
      <rect x="330" y="194" width="14" height="20" rx="5" fill="#162226" /><circle cx="337" cy="188" r="6" fill="#0f181b" />
      <circle cx="318" cy="226" r="5" fill="#f4f8f6" />
    </svg>
  )
}
