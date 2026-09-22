import { logoutAction } from './logoutAction'

export default function LogoutButton({ orgSlug }: { orgSlug: string }) {
  return (
    <form action={logoutAction.bind(null, orgSlug)}>
      <button
        type="submit"
        className="cp-label rounded-[var(--cp-r-chip)] border px-3 py-1.5 focus-visible:outline focus-visible:outline-2"
        style={{ color: 'var(--cp-on-band-2)', borderColor: 'var(--cp-band-line)' }}
      >
        Abmelden
      </button>
    </form>
  )
}
