/**
 * Eigenes, kleines Linien-Icon-Set für den Org-Admin (Design-Reifung nach
 * dem dritten Praxistest) — von Hand gezeichnet statt aus einem
 * generischen Icon-Kit kopiert (Heroicons/Feather & Co. sind überall,
 * genau die Art "austauschbarer" Optik, die hier vermieden werden soll).
 * Durchgehend: 20x20 viewBox, stroke=currentColor, strokeWidth 1.4-1.6,
 * kein Fill (ausser wo explizit angegeben) — eine Stimme, kein Sammelsurium
 * unterschiedlicher Stile.
 *
 * Navigations-Icons sind bewusst dem Spielfeld/Matchday-Sujet entnommen wo
 * es die Verständlichkeit nicht kostet (Trikot statt generischem
 * Personen-Symbol für Teilnehmer, Eckfahne statt Checkliste für Aufgaben)
 * — nur Konfiguration bleibt das konventionelle Zahnrad, weil "Zahnrad =
 * Einstellungen" eine zu etablierte Erwartung ist, um sie aus Prinzip zu
 * brechen.
 */

export interface IconProps {
  className?: string
  size?: number
}

const base = { fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

/** Gemeinsamer svg-Rahmen für das gesamte Set (Cleanup nach Review-Fund:
 * width/height/viewBox/base-Attribute standen vorher identisch in jeder
 * der 11 Icon-Funktionen). Jedes Icon liefert nur noch seine Pfade als
 * children. */
function IconBase({ className, size = 18, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" {...base} className={className} aria-hidden="true">
      {children}
    </svg>
  )
}

export function IconBoard(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="3" y="5" width="14" height="10" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <path d="M7 8v4M13 8v4M3 10h14" stroke="currentColor" strokeWidth="1.2" />
    </IconBase>
  )
}

export function IconJersey(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M7 3L4 5.2v3h2V17h8V8.2h2v-3L13 3l-1.5 1.6h-3L7 3z" stroke="currentColor" strokeWidth="1.4" />
    </IconBase>
  )
}

export function IconCoin(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M12.3 7.6c-.5-.5-1.3-.8-2.1-.8-1.6 0-2.7.9-2.7 2s1.1 1.7 2.7 2 2.7.9 2.7 2-1.1 2-2.7 2c-.9 0-1.7-.3-2.2-.8"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path d="M6.8 9h3M6.8 11.5h3" stroke="currentColor" strokeWidth="1.1" />
    </IconBase>
  )
}

export function IconHourglass(props: IconProps) {
  return (
    <IconBase {...props}>
      <path
        d="M6 3h8M6 17h8M6 3c0 3.6 2.2 4.7 3.6 5.6.1.1.1.3 0 .4C8.2 9.9 6 11 6 14.6M14 3c0 3.6-2.2 4.7-3.6 5.6-.1.1-.1.3 0 .4 1.4.9 3.6 2 3.6 5.6"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </IconBase>
  )
}

export function IconFlag(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M6 17V3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 4h7.5l-2.3 2.6L13.5 9H6" stroke="currentColor" strokeWidth="1.4" />
    </IconBase>
  )
}

export function IconGear(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="10" cy="10" r="2.6" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M10 3v2.1M10 14.9V17M17 10h-2.1M5.1 10H3M14.9 5.1l-1.5 1.5M6.6 13.4l-1.5 1.5M14.9 14.9l-1.5-1.5M6.6 6.6L5.1 5.1"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </IconBase>
  )
}

export function IconChevronDown({ size = 14, ...props }: IconProps) {
  return (
    <IconBase {...props} size={size}>
      <path d="M5 7.5L10 12.5 15 7.5" stroke="currentColor" strokeWidth="1.7" />
    </IconBase>
  )
}

export function IconDownload({ size = 16, ...props }: IconProps) {
  return (
    <IconBase {...props} size={size}>
      <path d="M10 3v9M6.5 9L10 12.5 13.5 9" stroke="currentColor" strokeWidth="1.4" />
      <path d="M4 15.5h12" stroke="currentColor" strokeWidth="1.4" />
    </IconBase>
  )
}

export function IconPrinter({ size = 16, ...props }: IconProps) {
  return (
    <IconBase {...props} size={size}>
      <path d="M6 8V4h8v4" stroke="currentColor" strokeWidth="1.4" />
      <rect x="4" y="8" width="12" height="6" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="7" y="12" width="6" height="4.5" stroke="currentColor" strokeWidth="1.3" />
    </IconBase>
  )
}

export function IconTable({ size = 16, ...props }: IconProps) {
  return (
    <IconBase {...props} size={size}>
      <rect x="3" y="4" width="14" height="12" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <path d="M3 8.3h14M8 4v12" stroke="currentColor" strokeWidth="1.2" />
    </IconBase>
  )
}

export function IconDocument({ size = 16, ...props }: IconProps) {
  return (
    <IconBase {...props} size={size}>
      <path d="M6 3h6l3 3v11H6V3z" stroke="currentColor" strokeWidth="1.4" />
      <path d="M12 3v3h3" stroke="currentColor" strokeWidth="1.2" />
      <path d="M8 11h5M8 13.5h5" stroke="currentColor" strokeWidth="1.1" />
    </IconBase>
  )
}
