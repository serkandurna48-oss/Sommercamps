'use client'

import Image from 'next/image'
import { useEffect, useRef, type ReactNode } from 'react'
import type { OrganizationPublic } from '../../lib/saasApi'

/** Inherits the public theme; unknown organizations stay deliberately neutral. */
export default function PublicState({ org, title, message, instruction, children, inline = false }: {
  org?: Pick<OrganizationPublic, 'name' | 'logo_url'>
  title: string
  message: string
  instruction: string
  children: ReactNode
  inline?: boolean
}) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => { if (!inline) headingRef.current?.focus() }, [inline, title])
  const Heading = inline ? 'h3' : 'h1'
  return (
    <section className="public-state" lang="de" aria-label={title}>
      <div className="public-state-brand">
        {org?.logo_url && <Image src={org.logo_url} alt={org.name} width={48} height={48} unoptimized />}
        <span>{org?.name ?? 'CampsPilot'}</span>
      </div>
      <Heading className="d2" ref={headingRef} tabIndex={inline ? undefined : -1}>{title}</Heading>
      <p>{message}</p>
      <p>{instruction}</p>
      <div className="public-state-action">{children}</div>
    </section>
  )
}
