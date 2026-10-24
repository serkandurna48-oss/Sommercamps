'use client'

import { useRouter } from 'next/navigation'
import { archivo } from '../fonts'
import '../tokens.css'
import AdminRouteState from './AdminRouteState'
import PlatformRouteState from './PlatformRouteState'

/** Layout failures sit outside the same segment's error.tsx boundary. */
export default function AdminLayoutUnavailable({ platform = false }: { platform?: boolean }) {
  const router = useRouter()
  return <div className={archivo.variable + ' cp-scope min-h-screen'}>
    {platform ? <PlatformRouteState reset={() => router.refresh()} /> : <AdminRouteState reset={() => router.refresh()} />}
  </div>
}
