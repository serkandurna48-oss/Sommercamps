import type { ReactNode } from 'react'

/** Kleine Linien-Icons (24er Raster), eigene Zeichnungen, keine Icon-Bibliothek. */
function Svg({ children, size = 22 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      {children}
    </svg>
  )
}

export const IconCalendar = () => <Svg><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4M9 15l2 2 4-4" /></Svg>
export const IconCard = () => <Svg><rect x="2.5" y="5" width="19" height="14" rx="3" /><path d="M2.5 10h19M6 15h4" /></Svg>
export const IconPalette = () => <Svg><path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-1 1.6-2.1-.4-1.1.3-2.4 1.6-2.4H17a4 4 0 0 0 4-4C21 6.8 17 3 12 3z" /><circle cx="7.5" cy="11" r="1" /><circle cx="10.5" cy="7.5" r="1" /><circle cx="15" cy="8" r="1" /></Svg>
export const IconSheet = () => <Svg><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4M9 12h6M9 16h6" /></Svg>
export const IconPeople = () => <Svg><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 5.3a3.2 3.2 0 0 1 0 5.4M18 14.4c1.8.8 3 2.6 3 5.6" /></Svg>
export const IconShield = () => <Svg><path d="M12 3l8 3v6c0 4.4-3.1 8-8 9-4.9-1-8-4.6-8-9V6z" /><path d="M9 12l2 2 4-4" /></Svg>
export const IconPin = () => <Svg><path d="M12 21s7-6 7-11a7 7 0 0 0-14 0c0 5 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" /></Svg>
export const IconLock = () => <Svg><rect x="4.5" y="10" width="15" height="11" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></Svg>
export const IconClipboard = () => <Svg><rect x="5" y="4" width="14" height="17" rx="3" /><path d="M9 4h6v3H9zM9 13l2 2 4-4" /></Svg>
export const IconPhone = () => <Svg><rect x="7" y="2.5" width="10" height="19" rx="3" /><path d="M11 18.5h2" /></Svg>
export const IconEye = () => <Svg><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></Svg>
export const IconSliders = () => <Svg><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></Svg>
export const IconCheck = () => <Svg size={15}><path d="M5 12.5l4.5 4.5L19 7" /></Svg>
