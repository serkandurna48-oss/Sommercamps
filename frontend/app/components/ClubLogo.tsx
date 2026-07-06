'use client'

import Image from 'next/image'
import { CLUB_CONFIG } from '../lib/clubConfig'

interface ClubLogoProps {
  src?: string
  alt?: string
}

export default function ClubLogo({ src = CLUB_CONFIG.logoSrc, alt = CLUB_CONFIG.name }: ClubLogoProps) {
  return (
    <span
      className="relative inline-block h-14 w-14 shrink-0 drop-shadow-sm rounded-lg overflow-hidden"
      style={CLUB_CONFIG.logoChipColor ? { backgroundColor: CLUB_CONFIG.logoChipColor } : undefined}
    >
      <Image
        src={src}
        alt={alt}
        fill
        unoptimized
        className={CLUB_CONFIG.logoChipColor ? 'object-contain p-1' : 'object-contain'}
      />
    </span>
  )
}
