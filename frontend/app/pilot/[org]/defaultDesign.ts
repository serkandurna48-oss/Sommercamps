import type { OrganizationPublic } from '../../lib/saasApi'

/** Vereine mit eigener, abgestimmter Gestaltung behalten ihr Theme (KSV). */
const OWN_DESIGN_SLUGS = new Set(['ksv-baunatal'])

/**
 * Standard-Elterndesign (Serkan 10.11.): Das Layout der JK Academy (Theme "akademie": dunkel, Glas,
 * Foto-Hero, Vereinsfarbe als Akzent) gilt fuer alle Vereine ohne eigene Gestaltung. Das gespeicherte
 * Standard-Theme "tradition" wird dafuer wie "akademie" dargestellt. Vereinsfarbe und Logo kommen vom
 * Verein selbst; ohne Bild/Text faellt die Seite auf eine Farbflaeche zurueck (kein JK-Inhalt).
 * Bewusst gewaehlte Themes (akademie, kompakt) und KSV bleiben unveraendert.
 */
export function effectiveTheme(org: Pick<OrganizationPublic, 'slug' | 'theme'>): OrganizationPublic['theme'] {
  if (OWN_DESIGN_SLUGS.has(org.slug)) return org.theme
  return org.theme === 'tradition' ? 'akademie' : org.theme
}

export function withDefaultDesign<T extends Pick<OrganizationPublic, 'slug' | 'theme'>>(org: T): T {
  const theme = effectiveTheme(org)
  return theme === org.theme ? org : { ...org, theme }
}
