'use client'

import { useState, useSyncExternalStore } from 'react'
import Button, { ButtonLink } from '../ui/Button'
import { buildOfferUrl, buildWhatsAppUrl } from './trainingLogic'

const subscribe = () => () => {}
const clientOrigin = () => window.location.origin
const serverOrigin = () => ''

/** "Link kopieren" und WhatsApp für die öffentliche Angebotsseite. Nur
 * sinnvoll bei veröffentlichten Angeboten; sonst Hinweis statt Buttons. */
export default function ShareActions({ orgSlug, offerSlug, title, published }: {
  orgSlug: string
  offerSlug: string
  title: string
  published: boolean
}) {
  const origin = useSyncExternalStore(subscribe, clientOrigin, serverOrigin)
  const [copy, setCopy] = useState<'idle' | 'copied' | 'error'>('idle')
  const url = buildOfferUrl(origin, orgSlug, offerSlug)

  if (!published) {
    return <p className="cp-chip" style={{ color: 'var(--cp-muted)' }}>Teilen ist möglich, sobald das Angebot veröffentlicht ist.</p>
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(buildOfferUrl(window.location.origin, orgSlug, offerSlug))
      setCopy('copied')
    } catch {
      setCopy('error')
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={copyLink} aria-label={`${copy === 'copied' ? 'Link kopiert' : 'Link kopieren'}: ${title}`}>
          {copy === 'copied' ? 'Link kopiert' : 'Link kopieren'}
        </Button>
        {origin && (
          <ButtonLink href={buildWhatsAppUrl(title, url)} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp: ${title}`}>
            WhatsApp
          </ButtonLink>
        )}
      </div>
      {copy === 'copied' && <p role="status" className="cp-chip" style={{ color: 'var(--cp-ok)' }}>Link in der Zwischenablage.</p>}
      {copy === 'error' && (
        <p role="alert" className="cp-chip" style={{ color: 'var(--cp-error)' }}>
          Kopieren nicht möglich. Bitte den Link markieren und kopieren: <span className="cp-code break-all">{url}</span>
        </p>
      )}
    </div>
  )
}
