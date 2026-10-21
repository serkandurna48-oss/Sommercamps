'use client'

import { useEffect, type RefObject } from 'react'

/** Share actual bar heights with the content and other fixed bars, even after text zoom. */
export function useBarHeight(ref: RefObject<HTMLElement | null>, property: string, visible = true) {
  useEffect(() => {
    const element = ref.current
    const scope = element?.closest<HTMLElement>('.cp-scope')
    if (!visible || !element || !scope || typeof ResizeObserver === 'undefined') return
    const update = () => scope.style.setProperty(property, `${element.getBoundingClientRect().height}px`)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element, { box: 'border-box' })
    return () => {
      observer.disconnect()
      scope.style.removeProperty(property)
    }
  }, [ref, property, visible])
}
