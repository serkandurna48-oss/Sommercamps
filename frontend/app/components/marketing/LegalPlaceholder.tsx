import Link from 'next/link'

type LegalPlaceholderProps = {
  title: string
  note?: string
}

// Platzhalter für die drei Rechtsrouten (Ticket 7.6): echte Route,
// sichtbarer Hinweis statt erfundenem Text. Inhalte kommen von Serkan.
export default function LegalPlaceholder({ title, note }: LegalPlaceholderProps) {
  return (
    <div className="light" style={{ minHeight: '100vh' }}>
      <div className="wrap sec">
        <p className="label on-light">
          <Link href="/campspilot">CampsPilot</Link>
        </p>
        <h1 className="d2" style={{ marginTop: 18 }}>{title}</h1>
        <p className="lead" style={{ marginTop: 18 }}>
          Dieser Text ist noch nicht freigegeben. Er wird ergänzt, bevor die Seite öffentlich geht.
          {note ? ` ${note}` : ''}
        </p>
        <p style={{ marginTop: 34 }}>
          <Link href="/campspilot" className="btn ghost">Zurück zu CampsPilot</Link>
        </p>
      </div>
    </div>
  )
}
