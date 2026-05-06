'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { formatDateDE } from '../lib/formatDate'

interface Registration {
  id: string
  created_at: string
  child_first_name: string
  child_last_name: string
  birth_date: string
  parent_name: string
  email: string
  phone: string
  selected_camp_week: string
  jersey_size: string | null
  allergies: string | null
  notes: string | null
  consent_privacy: boolean
  photo_permission: boolean
  status: string
  payment_status: string
  paid_at: string | null
  email_sent_at: string | null
}

const STATUS_LABELS: Record<string, string> = {
  registered: 'Angemeldet',
  confirmed: 'Bestätigt',
  cancelled: 'Storniert',
  waitlist: 'Warteliste',
}

const PAYMENT_LABELS: Record<string, string> = {
  open:      'Offen',
  paid:      'Bezahlt',
  refunded:  'Erstattet',
  waived:    'Erlassen',
  cancelled: 'Storniert',
}

const STATUS_COLORS: Record<string, string> = {
  registered: 'bg-yellow-100 text-yellow-800',
  confirmed:  'bg-green-100 text-green-800',
  cancelled:  'bg-red-100 text-red-700',
  waitlist:   'bg-blue-100 text-blue-800',
}

const PAYMENT_COLORS: Record<string, string> = {
  open:      'bg-orange-100 text-orange-800',
  paid:      'bg-green-100 text-green-800',
  refunded:  'bg-gray-100 text-gray-700',
  waived:    'bg-purple-100 text-purple-800',
  cancelled: 'bg-red-100 text-red-700',
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-md ${color}`}>
      {label}
    </span>
  )
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'
const SESSION_KEY = 'admin_session_token'

/** Liest das gespeicherte Session-Token aus dem localStorage. */
function getStoredToken(): string {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem(SESSION_KEY) ?? ''
}

/** Löscht das Session-Token (Logout). */
function clearToken(): void {
  localStorage.removeItem(SESSION_KEY)
}

/** Sendet einen Admin-Request mit Bearer-Token. */
async function adminFetch(path: string, token: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
  })
}

export default function AdminPage() {
  const [token, setToken] = useState('')
  const [passwordInput, setPasswordInput] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)

  const [registrations, setRegistrations] = useState<Registration[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [updatingPaymentId, setUpdatingPaymentId] = useState<string | null>(null)
  const [campFilter, setCampFilter] = useState('')
  const [paymentFilter, setPaymentFilter] = useState('')

  const passwordRef = useRef<HTMLInputElement>(null)

  // Session-Token beim ersten Render aus localStorage laden
  useEffect(() => {
    const stored = getStoredToken()
    if (stored) setToken(stored)
  }, [])

  // ── Daten laden ─────────────────────────────────────────────────────────────

  const fetchRegistrations = useCallback(async (sessionToken: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await adminFetch('/registrations', sessionToken)

      if (res.status === 401) {
        // Token abgelaufen oder ungültig → automatisch ausloggen
        clearToken()
        setToken('')
        setError('Sitzung abgelaufen. Bitte neu anmelden.')
        return
      }
      if (!res.ok) {
        setError(`Serverfehler (${res.status}). Bitte später erneut versuchen.`)
        return
      }
      const data: Registration[] = await res.json()
      setRegistrations(data)
    } catch {
      setError('Verbindung zum Server fehlgeschlagen.')
    } finally {
      setLoading(false)
    }
  }, [])

  // Automatisch laden, sobald ein Token vorliegt
  useEffect(() => {
    if (token) fetchRegistrations(token)
  }, [token, fetchRegistrations])

  // ── Login ────────────────────────────────────────────────────────────────────

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    const pw = passwordInput.trim()
    if (!pw) return

    setLoginLoading(true)
    setLoginError(null)

    try {
      const res = await fetch(`${API_URL}/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      })

      if (res.status === 401) {
        setLoginError('Falsches Passwort. Bitte erneut versuchen.')
        setPasswordInput('')
        passwordRef.current?.focus()
        return
      }
      if (!res.ok) {
        setLoginError(`Anmeldung fehlgeschlagen (${res.status}).`)
        return
      }

      const data = await res.json()
      localStorage.setItem(SESSION_KEY, data.token)
      setToken(data.token)
      setPasswordInput('')
    } catch {
      setLoginError('Verbindung zum Server fehlgeschlagen.')
    } finally {
      setLoginLoading(false)
    }
  }

  // ── Löschen ──────────────────────────────────────────────────────────────────

  async function handleDelete(id: string) {
    setDeleting(true)
    setError(null)
    try {
      const res = await adminFetch(`/registrations/${id}`, token, { method: 'DELETE' })

      if (res.status === 401) {
        clearToken()
        setToken('')
        setError('Sitzung abgelaufen. Bitte neu anmelden.')
        return
      }
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(data?.detail ?? `Löschen fehlgeschlagen (${res.status}).`)
        return
      }
      setRegistrations(prev => prev.filter(r => r.id !== id))
    } catch {
      setError('Verbindung zum Server fehlgeschlagen.')
    } finally {
      setDeleting(false)
      setDeleteId(null)
    }
  }

  // ── Zahlungsstatus ───────────────────────────────────────────────────────────

  async function handlePaymentStatus(id: string, newStatus: 'paid' | 'open' | 'cancelled') {
    setUpdatingPaymentId(id)
    setError(null)
    try {
      const res = await adminFetch(`/admin/registrations/${id}/payment-status`, token, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_status: newStatus }),
      })
      if (res.status === 401) { clearToken(); setToken(''); setError('Sitzung abgelaufen.'); return }
      if (!res.ok) {
        const d = await res.json().catch(() => null)
        setError(d?.detail ?? `Fehler beim Aktualisieren (${res.status}).`)
        return
      }
      const updated: Registration = await res.json()
      setRegistrations(prev => prev.map(r => r.id === id ? { ...r, payment_status: updated.payment_status, paid_at: updated.paid_at } : r))
    } catch {
      setError('Verbindung zum Server fehlgeschlagen.')
    } finally {
      setUpdatingPaymentId(null)
    }
  }

  // ── CSV-Export ───────────────────────────────────────────────────────────────

  async function handleCsvExport() {
    try {
      const res = await adminFetch('/registrations/export/csv', token)
      if (res.status === 401) {
        clearToken(); setToken('')
        setError('Sitzung abgelaufen. Bitte neu anmelden.')
        return
      }
      if (!res.ok) { setError('CSV-Export fehlgeschlagen.'); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `anmeldungen-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('CSV-Download fehlgeschlagen.')
    }
  }

  function handleLogout() {
    clearToken()
    setToken('')
    setRegistrations([])
    setError(null)
  }

  const campWeeks = Array.from(new Set(registrations.map(r => r.selected_camp_week))).sort()
  const filtered = registrations.filter(r => {
    if (campFilter && r.selected_camp_week !== campFilter) return false
    if (paymentFilter && r.payment_status !== paymentFilter) return false
    return true
  })

  // ── Login-Screen ─────────────────────────────────────────────────────────────

  if (!token) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="w-full max-w-sm bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
          <div className="mb-6 text-center">
            <p className="text-xs font-semibold text-[#CC0000] tracking-widest uppercase mb-1">Admin</p>
            <h1 className="text-xl font-bold text-gray-900">KSV Baunatal – Anmeldungen</h1>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Admin-Passwort
              </label>
              <input
                ref={passwordRef}
                type="password"
                value={passwordInput}
                onChange={e => { setPasswordInput(e.target.value); setLoginError(null) }}
                autoFocus
                required
                autoComplete="current-password"
                placeholder="Passwort eingeben"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm
                           focus:outline-none focus:ring-2 focus:ring-black focus:border-black
                           focus:bg-white transition-all"
              />
            </div>
            {loginError && (
              <p role="alert" className="text-sm text-red-600">{loginError}</p>
            )}
            <button
              type="submit"
              disabled={loginLoading}
              className="w-full bg-black text-white font-semibold py-3 rounded-xl
                         hover:opacity-90 disabled:opacity-50 transition-opacity text-sm"
            >
              {loginLoading ? 'Anmelden …' : 'Anmelden'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  // ── Hauptansicht ─────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-[#CC0000] tracking-widest uppercase">Admin</p>
            <h1 className="text-lg font-bold text-gray-900">KSV Baunatal – Anmeldungen</h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => fetchRegistrations(token)}
              disabled={loading}
              className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors disabled:opacity-40"
            >
              {loading ? 'Lädt …' : 'Aktualisieren'}
            </button>
            <button
              onClick={handleLogout}
              className="text-sm font-medium text-red-600 hover:text-red-800 transition-colors"
            >
              Abmelden
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* Statistik-Karten */}
        {!loading && registrations.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Anmeldungen',    value: registrations.length },
              { label: 'Bezahlt',        value: registrations.filter(r => r.payment_status === 'paid').length },
              { label: 'Zahlung offen',  value: registrations.filter(r => r.payment_status === 'open').length },
              { label: 'Storniert',      value: registrations.filter(r => r.payment_status === 'cancelled').length },
            ].map(stat => (
              <div key={stat.label} className="bg-white rounded-xl border border-gray-200 px-5 py-4">
                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{stat.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Fehler */}
        {error && (
          <div role="alert" className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Filter + Export */}
        {registrations.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={campFilter}
              onChange={e => setCampFilter(e.target.value)}
              className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-700
                         focus:outline-none focus:ring-2 focus:ring-black"
            >
              <option value="">Alle Termine</option>
              {campWeeks.map(w => (
                <option key={w} value={w}>{w}</option>
              ))}
            </select>
            <select
              value={paymentFilter}
              onChange={e => setPaymentFilter(e.target.value)}
              className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-700
                         focus:outline-none focus:ring-2 focus:ring-black"
            >
              <option value="">Alle Zahlungsstatus</option>
              <option value="open">Offen</option>
              <option value="paid">Bezahlt</option>
              <option value="cancelled">Storniert</option>
              <option value="refunded">Erstattet</option>
              <option value="waived">Erlassen</option>
            </select>
            <span className="text-sm text-gray-500">
              {filtered.length} Anmeldung{filtered.length !== 1 ? 'en' : ''}
            </span>
            <button
              onClick={handleCsvExport}
              className="ml-auto text-sm font-semibold text-gray-700 border border-gray-200 bg-white
                         px-4 py-2 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-colors"
            >
              CSV exportieren
            </button>
          </div>
        )}

        {/* Tabelle */}
        {loading ? (
          <div className="text-center py-20 text-gray-400 text-sm">Lädt …</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-gray-400 text-sm">Keine Anmeldungen vorhanden.</div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {['Datum', 'Kind', 'Geburtsdatum', 'Elternteil', 'E-Mail', 'Telefon', 'Termin', 'Größe', 'Fotos', 'Status', 'Zahlung', 'Mail', ''].map(h => (
                      <th key={h} className="px-4 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map(r => (
                    <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                        {formatDateDE(r.created_at)}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                        {r.child_first_name} {r.child_last_name}
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {formatDateDE(r.birth_date)}
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{r.parent_name}</td>
                      <td className="px-4 py-3 text-gray-600">
                        <a href={`mailto:${r.email}`} className="hover:text-gray-900 hover:underline">{r.email}</a>
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{r.phone}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{r.selected_camp_week}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{r.jersey_size ?? '–'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-md ${r.photo_permission ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
                          {r.photo_permission ? 'Ja' : 'Nein'}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Badge label={STATUS_LABELS[r.status] ?? r.status} color={STATUS_COLORS[r.status] ?? 'bg-gray-100 text-gray-700'} />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                          <Badge label={PAYMENT_LABELS[r.payment_status] ?? r.payment_status} color={PAYMENT_COLORS[r.payment_status] ?? 'bg-gray-100 text-gray-700'} />
                          {r.payment_status !== 'paid' ? (
                            <button
                              onClick={() => handlePaymentStatus(r.id, 'paid')}
                              disabled={updatingPaymentId === r.id}
                              className="text-xs text-green-700 hover:text-green-900 font-medium disabled:opacity-40 text-left"
                            >
                              {updatingPaymentId === r.id ? '…' : 'Als bezahlt markieren'}
                            </button>
                          ) : (
                            <button
                              onClick={() => handlePaymentStatus(r.id, 'open')}
                              disabled={updatingPaymentId === r.id}
                              className="text-xs text-gray-500 hover:text-gray-800 font-medium disabled:opacity-40 text-left"
                            >
                              {updatingPaymentId === r.id ? '…' : 'Auf offen setzen'}
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        {r.email_sent_at ? (
                          <span
                            title={`Gesendet: ${new Date(r.email_sent_at).toLocaleString('de-DE')}`}
                            className="text-green-600 font-semibold text-sm cursor-default"
                          >
                            ✓
                          </span>
                        ) : (
                          <span className="text-gray-300 text-sm">–</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <button
                          onClick={() => setDeleteId(r.id)}
                          className="text-xs text-red-500 hover:text-red-700 transition-colors font-medium"
                        >
                          Löschen
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Allergien & Notizen */}
            {filtered.some(r => r.allergies || r.notes) && (
              <div className="border-t border-gray-200 px-4 py-4 space-y-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Allergien & Notizen</p>
                {filtered.filter(r => r.allergies || r.notes).map(r => (
                  <div key={r.id} className="text-sm text-gray-700">
                    <span className="font-medium">{r.child_first_name} {r.child_last_name}:</span>
                    {r.allergies && <span className="ml-2 text-orange-700">Allergien: {r.allergies}</span>}
                    {r.notes && <span className="ml-2 text-gray-500">Notiz: {r.notes}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Lösch-Bestätigungsdialog */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full">
            <h2 className="text-lg font-bold text-gray-900 mb-2">Anmeldung löschen?</h2>
            <p className="text-sm text-gray-500 mb-6">Diese Aktion kann nicht rückgängig gemacht werden.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteId(null)}
                disabled={deleting}
                className="flex-1 border border-gray-200 text-gray-700 font-medium py-2.5 rounded-xl
                           hover:bg-gray-50 transition-colors text-sm"
              >
                Abbrechen
              </button>
              <button
                onClick={() => handleDelete(deleteId)}
                disabled={deleting}
                className="flex-1 bg-red-600 text-white font-semibold py-2.5 rounded-xl
                           hover:bg-red-700 transition-colors disabled:opacity-50 text-sm"
              >
                {deleting ? 'Wird gelöscht …' : 'Löschen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
