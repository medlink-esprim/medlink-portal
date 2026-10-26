// US-07 : « Confirmer le rendez-vous » — récapitulatif, motif facultatif (stocké chiffré), confirmation
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api.js'
import AppLayout, { useUser } from '../components/AppLayout.jsx'
import Alert from '../components/Alert.jsx'

const TZ = 'Africa/Tunis'
const fmtDate = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' })
const fmtHeure = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })
const duree = (c) => Math.round((new Date(c.fin) - new Date(c.debut)) / 60000)

function Contenu() {
  const user = useUser()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const idCreneau = params.get('creneau')
  const [creneau, setCreneau] = useState(null)
  const [motif, setMotif] = useState('')
  const [etat, setEtat] = useState('saisie')   // saisie | confirme | pris
  const [erreur, setErreur] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!idCreneau) return
    api(`/creneaux/${idCreneau}`).then((res) => {
      if (!res.ok) return setErreur(res.data?.message || 'Créneau introuvable')
      setCreneau(res.data)
      if (res.data.statut !== 'libre') setEtat('pris')
    })
  }, [idCreneau])

  async function confirmer(e) {
    e.preventDefault()
    setBusy(true); setErreur('')
    const res = await api('/rendez-vous', { method: 'POST', body: { idCreneau, motif } })
    setBusy(false)
    if (res.status === 201) return setEtat('confirme')
    if (res.status === 409) return setEtat('pris')
    return setErreur(res.data?.message || 'Réservation impossible')
  }

  if (!idCreneau) return <Alert type="error">Aucun créneau choisi. <Link to="/patient/rendez-vous/nouveau">Rechercher un créneau</Link></Alert>
  if (!creneau) return <Alert type="error">{erreur}</Alert>

  return (
    <div className="two-cols">
      <form className="card" onSubmit={confirmer}>
        <h2>Récapitulatif</h2>
        <table className="recap">
          <tbody>
            <tr><td>Praticien</td><td><strong>Dr {creneau.prenom} {creneau.nom}</strong> — {creneau.specialite}</td></tr>
            <tr><td>Clinique</td><td>{creneau.clinique}</td></tr>
            <tr><td>Date et heure</td><td>{fmtDate.format(new Date(creneau.debut))}, {fmtHeure.format(new Date(creneau.debut))} ({duree(creneau)} min)</td></tr>
            <tr><td>Patient</td><td>{user.prenom} {user.nom}</td></tr>
          </tbody>
        </table>

        {etat === 'saisie' && (
          <>
            <label htmlFor="motif">Motif de consultation (facultatif, stocké chiffré)</label>
            <textarea id="motif" maxLength={500} rows={3} value={motif} onChange={(e) => setMotif(e.target.value)} />
            <Alert type="error">{erreur}</Alert>
            <div className="actions">
              <button className="btn-primary btn-auto" disabled={busy}>Confirmer la réservation</button>
              <button type="button" className="btn-secondary btn-auto" onClick={() => navigate('/patient/rendez-vous/nouveau')}>Modifier le créneau</button>
            </div>
          </>
        )}
        {etat === 'confirme' && (
          <>
            <Alert type="ok">Rendez-vous enregistré. Ce créneau n'est plus proposé aux autres patients.</Alert>
            <div className="actions"><Link className="btn-secondary btn-auto btn-link" to="/accueil">Retour au tableau de bord</Link></div>
          </>
        )}
        {etat === 'pris' && (
          <>
            <Alert type="error">Ce créneau vient d'être réservé par un autre patient.</Alert>
            <div className="actions"><Link className="btn-primary btn-auto btn-link" to="/patient/rendez-vous/nouveau">Choisir un autre créneau</Link></div>
          </>
        )}
      </form>
      <aside className="card">
        <h2>Bon à savoir</h2>
        <ul className="muted">
          <li>Votre motif est chiffré : seul le praticien concerné peut le lire.</li>
          <li>Si le créneau est pris entre-temps, d'autres créneaux vous seront proposés.</li>
        </ul>
      </aside>
    </div>
  )
}

export default function ConfirmerRendezVous() {
  return (
    <AppLayout title="Confirmer le rendez-vous" subtitle="Vérifiez les informations avant de valider" roles={['PATIENT']}>
      <Contenu />
    </AppLayout>
  )
}
