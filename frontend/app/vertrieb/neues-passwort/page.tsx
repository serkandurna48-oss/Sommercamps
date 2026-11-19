import type { Metadata } from 'next'
import SalesPasswordForm from './SalesPasswordForm'

export const metadata: Metadata = { title: 'Passwort festlegen – CampsPilot Vertrieb', referrer: 'no-referrer' }

/** Target of sales invite links (backend settings.sales_url("/neues-passwort")). */
export default function SalesNewPasswordPage() {
  return (
    <main className="mx-auto w-full max-w-[440px] px-4 py-12">
      <SalesPasswordForm />
    </main>
  )
}
