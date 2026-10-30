import { notFound } from 'next/navigation'
import DruckTestClient from './DruckTestClient'

export const metadata = { title: 'Druck-Test – CampsPilot (Dev)', robots: { index: false, follow: false } }

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function DruckTestPage({ searchParams }: Props) {
  if (process.env.NODE_ENV !== 'development') notFound()
  const params = await searchParams
  return <DruckTestClient params={params} />
}
