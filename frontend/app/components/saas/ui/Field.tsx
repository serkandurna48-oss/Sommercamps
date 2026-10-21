import { Children, cloneElement, isValidElement, type HTMLAttributes, type ReactNode } from 'react'

type ControlProps = Pick<HTMLAttributes<HTMLElement>, 'id' | 'children' | 'aria-describedby' | 'aria-invalid'>

interface FieldProps {
  label: string
  htmlFor: string
  hint?: string
  error?: string
  children: ReactNode
}

/** Label + Control + Hinweis + Fehler. Control (Input/Select/Textarea) wird
 * als Kind übergeben und muss selbst >=16px Schriftgröße setzen (sonst
 * zoomt iOS beim Fokussieren, Abschnitt 3.2) und >=46px Höhe (Abschnitt 5). */
export default function Field({ label, htmlFor, hint, error, children }: FieldProps) {
  const hintId = `${htmlFor}-hint`
  const errorId = `${htmlFor}-error`
  // Match only the labelled control, including controls inside layout wrappers.
  // Preserve any descriptions provided by the caller.
  function connect(nodes: ReactNode): ReactNode {
    return Children.map(nodes, node => {
      if (!isValidElement<ControlProps>(node)) return node
      if (node.props.id === htmlFor) {
        const describedBy = [node.props['aria-describedby'], hint && hintId, error && errorId].filter(Boolean).join(' ')
        return cloneElement(node, {
          'aria-describedby': describedBy || undefined,
          'aria-invalid': error ? true : node.props['aria-invalid'],
        })
      }
      return node.props.children ? cloneElement(node, {}, connect(node.props.children)) : node
    })
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="cp-label" style={{ color: 'var(--cp-ink-2)' }}>
        {label}
      </label>
      {connect(children)}
      {hint && (
        <p id={hintId} className="cp-chip" style={{ color: 'var(--cp-muted)' }}>
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="cp-chip" style={{ color: 'var(--cp-error)' }} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
