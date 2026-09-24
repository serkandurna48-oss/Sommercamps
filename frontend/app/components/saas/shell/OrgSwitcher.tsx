'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useIsPlatformOwner } from './ViewerContext'

/**
 * Zeigt die aktuelle Organisation im Band. Bewusst OHNE Dropdown-Pfeil oder
 * sonstige Wechsel-Andeutung: es gibt (noch) keinen "alle Organisationen"-
 * Endpunkt (siehe organizations_repo — "No list all organizations endpoint,
 * das würde die Mandantenliste leaken"), ein echter Wechsler wäre also ein
 * UI-Element, das eine nicht existierende Funktion vortäuscht (Abschnitt 11,
 * Akzeptanzkriterium "Kein sichtbares Element suggeriert eine Funktion, die
 * es nicht gibt"). Umbenannt von "OrgSwitcher": zeigt nur Identität, wechselt
 * nichts — Funktionsname bewusst als Auftrags-Referenz beibehalten.
 *
 * "Zur Plattform"-Link (MVP-Oberflächenauftrag) NUR für platform_owner: ein
 * echter org_admin hat dort nichts zu suchen (require_platform_owner würde
 * ihn ohnehin abweisen) — der Link existiert nicht als tote/verwirrende
 * Abkürzung, sondern nur, wenn er tatsächlich funktioniert. Macht zugleich
 * sichtbar, ALS WER man diesen Verein gerade sieht.
 */
export default function OrgSwitcher({ name, logoUrl, orgSlug }: { name: string; logoUrl: string | null; orgSlug: string }) {
  const initial = name.trim().charAt(0).toUpperCase()
  const isPlatformOwner = useIsPlatformOwner()
  return (
    <div className="flex items-center gap-2.5">
      <span
        className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md"
        style={{ background: 'var(--cp-band-2)' }}
      >
        {logoUrl ? (
          <Image src={logoUrl} alt="" fill unoptimized className="object-contain p-1" />
        ) : (
          <span className="cp-label" style={{ color: 'var(--cp-on-band)' }}>
            {initial}
          </span>
        )}
      </span>
      <div className="flex flex-col">
        <span className="cp-subheading" style={{ color: 'var(--cp-on-band)' }}>
          {name}
        </span>
        {isPlatformOwner && (
          <Link
            href={`/platform/${orgSlug}`}
            className="cp-chip underline"
            style={{ color: 'var(--cp-on-band-2)' }}
          >
            ← Zur Plattform
          </Link>
        )}
      </div>
    </div>
  )
}
