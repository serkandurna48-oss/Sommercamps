'use client'

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import Button from './Button'

/** Inline desktop actions become a non-modal action popover on phones.
 * A dialog supports both links and confirmation forms without fake menuitems.
 * `menu`: a "Mehr" button at every width (compact desktop tables); on phones the
 * panel still opens inline below the trigger. Escape and the trigger close it and
 * return focus; confirmations stay inline (ActionForm), never window.confirm. */
export default function RowOverflow({ children, label, menu = false, triggerLabel }: {
  children: ReactNode
  label: string
  menu?: boolean
  /** Visible trigger text; the accessible name (`label`) must contain it. */
  triggerLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const wrapper = useRef<HTMLDivElement>(null)
  const focusedAction = useRef<HTMLElement | null>(null)
  const focusedActionIndex = useRef(0)

  useEffect(() => {
    if (!open) return
    panel.current?.querySelector<HTMLElement>('button, a[href], input')?.focus()
    const outside = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false)
    }
    const wide = window.matchMedia('(min-width: 640px)')
    const resize = () => { if (wide.matches && !menu) setOpen(false) }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setOpen(false)
      trigger.current?.focus()
    }
    // Confirmation forms may replace the focused button. Keep focus in the
    // popover instead of losing it to the document body after that replacement.
    const observer = new MutationObserver(() => {
      if (focusedAction.current && !focusedAction.current.isConnected && document.activeElement === document.body) {
        const actions = panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled)')
        ;(actions?.[focusedActionIndex.current] ?? actions?.[0])?.focus()
      }
    })
    if (panel.current) observer.observe(panel.current, { childList: true, subtree: true })
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    wide.addEventListener('change', resize)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
      wide.removeEventListener('change', resize)
      observer.disconnect()
    }
  }, [open, menu])

  return <div ref={wrapper} className="cp-row-overflow" data-menu={menu || undefined} onFocusCapture={event => {
    if (panel.current?.contains(event.target)) {
      focusedAction.current = event.target
      focusedActionIndex.current = [...panel.current.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled)')].indexOf(event.target)
    }
  }} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
  }}>
    <Button ref={trigger} type="button" className={menu ? 'cp-overflow-trigger' : 'cp-mobile-only'} aria-haspopup="dialog"
      aria-expanded={open} aria-controls={id} aria-label={label} onClick={() => setOpen(value => !value)}>
      {triggerLabel ?? (menu ? 'Mehr' : 'Weitere Aktionen')}
    </Button>
    <div ref={panel} id={id} className="cp-overflow-panel" data-open={open}
      role={open ? 'dialog' : undefined} aria-label={open ? label : undefined}>
      {children}
    </div>
  </div>
}
