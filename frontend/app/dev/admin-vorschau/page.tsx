import Link from 'next/link'
import { notFound } from 'next/navigation'
import { previewScreens } from './screens'

export const metadata = { title: 'Admin-Vorschau – CampsPilot', robots: { index: false, follow: false } }

export default function AdminPreviewIndex() {
  if (process.env.NODE_ENV !== 'development') notFound()

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold">Admin-Vorschau</h1>
      <p className="mt-3 mb-8">Erfundene Beispieldaten. Änderungen werden nicht gespeichert.</p>
      <ul className="space-y-4">
        {previewScreens.map(([screen, label]) => (
          <li key={screen} className="flex flex-wrap justify-between gap-3 border-b pb-3">
            <Link className="underline" href={`/dev/admin-vorschau/${screen}`}>{label}</Link>
            <Link className="underline" href={`/dev/admin-vorschau/${screen}?leer=1`}>{label}: Leerzustand</Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
