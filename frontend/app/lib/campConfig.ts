export interface CampConfig {
  price_cents: number
  currency: string
}

interface ConfigResponse {
  camp: CampConfig
}

export async function fetchCampConfig(): Promise<CampConfig> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'
  const res = await fetch(`${apiUrl}/config`, { next: { revalidate: 300 } })
  if (!res.ok) {
    throw new Error(`GET /config fehlgeschlagen: ${res.status}`)
  }
  const data: ConfigResponse = await res.json()
  return data.camp
}
