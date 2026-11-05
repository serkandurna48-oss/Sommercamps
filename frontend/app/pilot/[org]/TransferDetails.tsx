'use client'

import { useState } from 'react'

/**
 * Überweisungsdaten (Empfänger, IBAN, Betrag, Verwendungszweck) mit
 * Kopierknöpfen. Von der Camp- und der Training-Bestätigung gemeinsam genutzt.
 */
export default function TransferDetails({
  payTo,
  iban,
  amountText,
  paymentReference,
}: {
  payTo: string
  iban: string
  /** null: kein Betrag bekannt, Zeile entfällt. */
  amountText: string | null
  paymentReference: string
}) {
  const [copiedField, setCopiedField] = useState<'ref' | 'iban' | 'betrag' | null>(null)

  async function handleCopy(field: 'ref' | 'iban' | 'betrag', text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(field)
      setTimeout(() => setCopiedField(null), 1600)
    } catch {
      // Zwischenablage ohne Berechtigung — kein Fehlerzustand nötig, der Wert steht ohnehin sichtbar da.
    }
  }

  return (
    <div className="done-transfer">
      <span className="done-transfer-label">Überweisung</span>
      <dl className="done-transfer-rows">
        <div className="done-transfer-row">
          <dt>Empfänger</dt>
          <dd>{payTo}</dd>
        </div>
        {iban && (
          <div className="done-transfer-row has-copy">
            <dt>IBAN</dt>
            <dd className="num">{iban}</dd>
            <button className="copy" type="button" onClick={() => handleCopy('iban', iban)} aria-label="IBAN kopieren">
              {copiedField === 'iban' ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--ok)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12.5l4.5 4.5L19 7" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ opacity: 0.7 }}>
                  <rect x="9" y="9" width="11" height="11" rx="2" />
                  <path d="M6 15H5a1 1 0 01-1-1V5a1 1 0 011-1h9a1 1 0 011 1v1" />
                </svg>
              )}
            </button>
          </div>
        )}
        {amountText && (
          <div className="done-transfer-row has-copy">
            <dt>Betrag</dt>
            <dd className="num">{amountText}</dd>
            <button className="copy" type="button" onClick={() => handleCopy('betrag', amountText)} aria-label="Betrag kopieren">
              {copiedField === 'betrag' ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--ok)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12.5l4.5 4.5L19 7" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ opacity: 0.7 }}>
                  <rect x="9" y="9" width="11" height="11" rx="2" />
                  <path d="M6 15H5a1 1 0 01-1-1V5a1 1 0 011-1h9a1 1 0 011 1v1" />
                </svg>
              )}
            </button>
          </div>
        )}
      </dl>
      <div style={{ marginTop: 8 }}>
        <span className="done-transfer-label" style={{ fontSize: 11, display: 'block', marginBottom: 6 }}>Verwendungszweck</span>
        <div className="done-ref-wrap">
          <span className="done-ref num">{paymentReference}</span>
          <button className="copy" type="button" onClick={() => handleCopy('ref', paymentReference)} aria-label="Verwendungszweck kopieren">
            {copiedField === 'ref' ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--ok)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12.5l4.5 4.5L19 7" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ opacity: 0.7 }}>
                <rect x="9" y="9" width="11" height="11" rx="2" />
                <path d="M6 15H5a1 1 0 01-1-1V5a1 1 0 011-1h9a1 1 0 011 1v1" />
              </svg>
            )}
          </button>
        </div>
        <p className="done-ref-note" style={{ marginTop: 8 }}>
          Bitte den Verwendungszweck mit angeben — damit ordnet {payTo} die Zahlung Ihrem Kind zu.
        </p>
      </div>
    </div>
  )
}
