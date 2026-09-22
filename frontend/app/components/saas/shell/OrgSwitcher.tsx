import Image from 'next/image'

/**
 * Zeigt die aktuelle Organisation im Band. Bewusst OHNE Dropdown-Pfeil oder
 * sonstige Wechsel-Andeutung: es gibt (noch) keinen "alle Organisationen"-
 * Endpunkt (siehe organizations_repo — "No list all organizations endpoint,
 * das würde die Mandantenliste leaken"), ein echter Wechsler wäre also ein
 * UI-Element, das eine nicht existierende Funktion vortäuscht (Abschnitt 11,
 * Akzeptanzkriterium "Kein sichtbares Element suggeriert eine Funktion, die
 * es nicht gibt"). Umbenannt von "OrgSwitcher": zeigt nur Identität, wechselt
 * nichts — Funktionsname bewusst als Auftrags-Referenz beibehalten.
 */
export default function OrgSwitcher({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  const initial = name.trim().charAt(0).toUpperCase()
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
      <span className="cp-subheading" style={{ color: 'var(--cp-on-band)' }}>
        {name}
      </span>
    </div>
  )
}
