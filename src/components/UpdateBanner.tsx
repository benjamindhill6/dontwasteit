import { useEffect, useState } from 'react'
import { applyUpdate, isUpdateReady, onUpdateReady } from '../lib/appUpdate'

/** Big banner at the top when a newer version of the app is ready. Tapping it reloads. */
export default function UpdateBanner() {
  const [show, setShow] = useState(isUpdateReady)
  const [busy, setBusy] = useState(false)

  useEffect(() => onUpdateReady(() => setShow(true)), [])

  if (!show) return null
  return (
    <button
      type="button"
      className="update-banner"
      disabled={busy}
      onClick={() => { setBusy(true); void applyUpdate() }}
    >
      <strong>{busy ? 'Updating...' : 'Update available'}</strong>
      {!busy && <span>Tap here to refresh</span>}
    </button>
  )
}
