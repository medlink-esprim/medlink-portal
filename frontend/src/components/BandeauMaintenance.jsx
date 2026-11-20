// US-38 : bandeau de maintenance, visible de tous (même non connectés) dès 48 h avant le début.
import { useEffect, useState } from 'react'

const fmt = (iso) => new Date(iso).toLocaleString('fr-FR', { timeZone: 'Africa/Tunis', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

export default function BandeauMaintenance() {
  const [annonce, setAnnonce] = useState(null)
  const [masque, setMasque] = useState(false)
  useEffect(() => {
    const charger = () => fetch('/api/maintenance/annonce', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : { annonce: null })).then((d) => setAnnonce(d.annonce)).catch(() => {})
    charger()
    const t = setInterval(charger, 15 * 60 * 1000)
    return () => clearInterval(t)
  }, [])
  if (!annonce || masque) return null
  return (
    <div className="bandeau-maintenance" role="alert">
      <strong>Maintenance prévue</strong> du {fmt(annonce.debut)} au {fmt(annonce.fin)} : {annonce.message}
      <button aria-label="Masquer" onClick={() => setMasque(true)}>×</button>
    </div>
  )
}
