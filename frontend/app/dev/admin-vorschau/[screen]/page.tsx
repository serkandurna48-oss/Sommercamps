import { renderAdminPreview, type PreviewQuery } from '../PreviewScreen'
import { notFound } from 'next/navigation'

export const metadata = { title: 'Admin-Vorschau – CampsPilot', robots: { index: false, follow: false } }

type Props = {
  params: Promise<{ screen: string }>
  searchParams?: Promise<PreviewQuery>
}

export default async function AdminPreviewPage({ params, searchParams }: Props) {
  if (process.env.NODE_ENV !== 'development') notFound()
  const { screen } = await params
  return renderAdminPreview({ screen, query: await searchParams })
}
