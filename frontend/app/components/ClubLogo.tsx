'use client'

import Image from 'next/image'

export default function ClubLogo() {
  return (
    <Image
      src="/logo.svg"
      alt="KSV Baunatal"
      width={56}
      height={56}
      className="shrink-0 drop-shadow-sm"
      unoptimized
    />
  )
}
