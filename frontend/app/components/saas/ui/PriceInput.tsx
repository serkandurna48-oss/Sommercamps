'use client'

import type { InputHTMLAttributes } from 'react'
import { INPUT_CLASS, INPUT_STYLE } from './formFieldStyles'

/** Keep decimal input textual so mobile keyboards accept a German comma. */
export default function PriceInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} type="text" inputMode="decimal" pattern="[0-9]+([,.][0-9]{1,2})?" placeholder="189,00"
    className={INPUT_CLASS} style={INPUT_STYLE}
    onBlur={event => {
      const value = event.currentTarget.value.trim()
      if (/^\d+([,.]\d{1,2})?$/.test(value)) {
        event.currentTarget.value = Number(value.replace(',', '.')).toFixed(2).replace('.', ',')
      }
      props.onBlur?.(event)
    }} />
}
