import { Oswald, Work_Sans } from 'next/font/google'

// Scoped to /pilot only — the legacy KSV/JK site keeps its own Geist fonts
// (app/layout.tsx). Oswald (condensed, scoreboard/kit-numbering register)
// carries camp titles, dates and the org identity; Work Sans carries body
// copy and form fields. Two families, clearly distinct roles.
const oswald = Oswald({
  variable: '--font-pilot-display',
  subsets: ['latin'],
  weight: ['500', '600', '700'],
})

const workSans = Work_Sans({
  variable: '--font-pilot-body',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
})

export default function PilotLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${oswald.variable} ${workSans.variable} [font-family:var(--font-pilot-body)]`}>
      {children}
    </div>
  )
}
