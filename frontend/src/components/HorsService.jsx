// US-49 : hors de la plage d'ouverture (6 h – 22 h, heure de Tunis), le portail affiche un message
// au lieu des pages ; l'état est revérifié toutes les 5 minutes.
import { useEffect, useState } from 'react'

export default function HorsService({ children }) {
  const [etat, setEtat] = useState(null)
  useEffect(() => {
    const verifier = () => fetch('/api/horaires', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null)).then((d) => d && setEtat(d)).catch(() => {})
    verifier()
    const t = setInterval(verifier, 5 * 60 * 1000)
    return () => clearInterval(t)
  }, [])
  if (!etat || etat.ouvert) return children
  const h = (v) => v.replace(':00', ' h').replace(':', ' h ')
  return (
    <main className="hors-service">
      <section className="card">
        <h1>MedLink est fermé pour le moment</h1>
        <p>Le portail est accessible tous les jours de <strong>{h(etat.ouverture)}</strong> à <strong>{h(etat.fermeture)}</strong> (heure de Tunis).</p>
        <p>En cas d'urgence, appelez directement votre clinique ou le 190 (SAMU).</p>
      </section>
    </main>
  )
}
