'use client'

import Image from 'next/image'
import { CLUB_CONFIG } from '../lib/clubConfig'

interface ClubLogoProps {
  src?: string
  alt?: string
}

export default function ClubLogo({ src = CLUB_CONFIG.logoSrc, alt = CLUB_CONFIG.name }: ClubLogoProps) {
  return (
    <Image
      src={src}
      alt={alt}
      width={56}
      height={56}
      className="shrink-0 drop-shadow-sm"
      unoptimized
    />
  )
}
