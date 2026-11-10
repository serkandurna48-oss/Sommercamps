'use client'

import { useState } from 'react'
import { euro, roi } from './roiLogic'

function Slider({ label, value, min, max, step, suffix, onChange }: {
  label: string; value: number; min: number; max: number; step: number; suffix: string; onChange: (n: number) => void
}) {
  const id = `roi-${label.replace(/\W+/g, '-').toLowerCase()}`
  return (
    <div>
      <div className="lp-slider-row">
        <label htmlFor={id}>{label}</label>
        <span className="lp-mono">{value}{suffix}</span>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  )
}

export default function RoiCalculator() {
  const [camps, setCamps] = useState(3)
  const [kids, setKids] = useState(25)
  const [price, setPrice] = useState(180)
  const [hours, setHours] = useState(4)
  const r = roi({ camps, kids, price, hours })

  return (
    <div className="lp-card lp-roi">
      <div className="lp-roi-inputs">
        <Slider label="Camps pro Jahr" value={camps} min={1} max={12} step={1} suffix="" onChange={setCamps} />
        <Slider label="Teilnehmer pro Camp" value={kids} min={8} max={80} step={1} suffix="" onChange={setKids} />
        <Slider label="Preis pro Kind" value={price} min={50} max={400} step={5} suffix=" €" onChange={setPrice} />
        <Slider label="Orga-Stunden pro Camp (bisher)" value={hours} min={1} max={20} step={1} suffix=" h" onChange={setHours} />
      </div>
      <div className="lp-roi-out" aria-live="polite">
        <p className="lp-muted">Umsatz über CampsPilot</p>
        <p className="lp-roi-big num" data-testid="roi-revenue">{euro(r.umsatzCents)}</p>
        <dl>
          <div><dt>Gebühren, Paket {r.paket} (inkl. Zahlung)</dt><dd data-testid="roi-fee">{euro(r.gebuehrCents)}</dd></div>
          <div><dt>Gesparte Orga-Zeit</dt><dd>≈ {r.gespartStunden} Std.</dd></div>
          <div><dt>Zusatzumsatz durch volle Camps*</dt><dd className="lp-accent">+ {euro(r.zusatzCents)}</dd></div>
        </dl>
        <p className="lp-fine">*Beispielrechnung auf Basis von Annahmen, keine Garantie. Alle Beträge zzgl. USt.</p>
      </div>
    </div>
  )
}
