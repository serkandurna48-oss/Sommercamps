import type { Metadata } from 'next'
import { pageMetadata } from '../../lib/seo'

export async function marketingMetadata(
  path: string,
  title: string,
  description: string,
  index = false,
): Promise<Metadata> {
  return {
    ...pageMetadata(path, title, description, '/campspilot/opengraph-image.png'),
    robots: { index, follow: true },
  }
}
