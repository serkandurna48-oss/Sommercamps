/** Geteilter Input-Stil für Konfigurationsformulare (Cleanup nach
 * Review-Fund: stand vorher identisch in CampConfigForm.tsx und
 * OrganizationConfigForm.tsx). >=16px Schriftgröße verhindert iOS-Zoom
 * beim Fokussieren (Abschnitt 3.2), passend zu Field.tsx's eigener
 * Anforderung an sein Kind-Element. */
export const INPUT_CLASS = 'cp-focus cp-input w-full min-w-0 rounded-[var(--cp-r-field)] border px-4 py-3'
export const INPUT_STYLE = { borderColor: 'var(--cp-field-line)', fontSize: '16px' }
