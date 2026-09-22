import type { Metadata } from 'next'
import { Archivo } from 'next/font/google'
import './marketing.css'

// Scoped to /campspilot only — the KSV/JK site keeps its Geist fonts and
// Tailwind utilities (app/layout.tsx). This nested layout adds Archivo and
// the marketing tokens without touching anything outside this route group.
const archivo = Archivo({
  subsets: ['latin'],
  axes: ['wdth'],
  display: 'swap',
  variable: '--font-archivo',
})

const title = 'CampsPilot'
const description = 'Anmeldung und Verwaltung für Fußballcamps. Ein System statt fünf.'

export const metadata: Metadata = {
  title,
  description,
  icons: { icon: '/brand/campspilot-favicon.svg' },
  openGraph: {
    title,
    description,
    siteName: 'CampsPilot',
    locale: 'de_DE',
    type: 'website',
  },
}

export default function CampsPilotLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${archivo.variable} cp-scope`}>{children}</div>
}
