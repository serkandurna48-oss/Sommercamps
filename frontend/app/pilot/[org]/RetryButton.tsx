'use client'

export default function RetryButton() {
  return <button className="btn primary btn-pill" type="button" onClick={() => window.location.reload()}>Erneut versuchen</button>
}
