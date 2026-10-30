import Link from 'next/link'

export const metadata = {
  title: 'Online-Zahlung – CampsPilot',
  robots: { index: false, follow: false },
}

export default async function PaymentReturn({
  params, searchParams,
}: {
  params: Promise<{ org: string }>
  searchParams: Promise<{ result?: string }>
}) {
  const { org } = await params
  const { result } = await searchParams
  const cancelled = result === 'cancel'
  return (
    <main className="mx-auto max-w-xl px-6 py-20 text-center">
      <h1 className="text-3xl font-bold">
        {cancelled ? 'Zahlung nicht abgeschlossen' : 'Zurück von Stripe'}
      </h1>
      <p className="mt-5 text-base leading-relaxed">
        {cancelled
          ? 'Es wurde keine Online-Zahlung abgeschlossen. Falls eine Überweisung möglich ist, nutzen Sie die Angaben aus Ihrer Anmeldebestätigung.'
          : 'Vielen Dank! Ihre Zahlung wird über die sichere Stripe-Bestätigung geprüft. Erst der automatische Zahlungsabgleich bestätigt den Eingang – die Weiterleitung allein ist noch kein Zahlungsbeleg.'}
      </p>
      <Link
        href={`/pilot/${encodeURIComponent(org)}`}
        className="mt-8 inline-block rounded-lg border border-current px-5 py-3 font-medium"
      >
        Zur Vereinsübersicht
      </Link>
    </main>
  )
}
