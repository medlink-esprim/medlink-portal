// US-16 : demandes d'export ou de suppression des données (loi INPDP), suivies jusqu'à leur traitement.
import { useEffect, useState } from 'react'
import { api } from '../api.js'
import AppLayout from '../components/AppLayout.jsx'
import Alert from '../components/Alert.jsx'

const STATUTS = { recue: ['Reçue', 'pill-new'], en_cours: ['En cours', 'pill-new'], traitee: ['Traitée', 'pill-ok'], refusee: ['Refusée', 'pill-ko'] }
const fmt = (iso) => (iso ? new Date(iso).toLocaleString('fr-FR', { timeZone: 'Africa/Tunis', dateStyle: 'short', timeStyle: 'short' }) : '—')

function Contenu() {
  const [demandes, setDemandes] = useState([])
  const [reponses, setReponses] = useState({})
  const [message, setMessage] = useState(null)
  const charger = () => api('/admin/demandes').then((r) => r.ok && setDemandes(r.data))
  useEffect(() => { charger() }, [])

  async function traiter(id, statut) {
    const res = await api(`/admin/demandes/${id}`, { method: 'PATCH', body: { statut, reponse: reponses[id] || '' } })
    setMessage({ type: res.ok ? 'ok' : 'error', text: res.data?.message || 'Opération impossible' })
    charger()
  }

  return (
    <section className="card">
      {message && <Alert type={message.type}>{message.text}</Alert>}
      <table className="table">
        <thead><tr><th>Reçue le</th><th>Patient</th><th>Demande</th><th>Statut</th><th>Réponse au patient</th><th></th></tr></thead>
        <tbody>
          {demandes.map((d) => {
            const [libelle, classe] = STATUTS[d.statut]
            const ouverte = ['recue', 'en_cours'].includes(d.statut)
            return (
              <tr key={d.id_demande}>
                <td>{fmt(d.date_demande)}</td>
                <td><strong>{d.prenom} {d.nom}</strong><br /><span className="muted">{d.numero_dossier}</span></td>
                <td>{d.type === 'export' ? 'Export des données' : 'Suppression des données'}{d.message && <><br /><span className="muted">« {d.message} »</span></>}</td>
                <td><span className={`pill ${classe}`}>{libelle}</span>{d.traitant && <><br /><span className="muted">{d.traitant} · {fmt(d.date_traitement)}</span></>}</td>
                <td>{ouverte
                  ? <input aria-label="Réponse" maxLength={500} placeholder="Facultatif (obligatoire pour un refus)" value={reponses[d.id_demande] || ''} onChange={(e) => setReponses({ ...reponses, [d.id_demande]: e.target.value })} />
                  : <span className="muted">{d.reponse || '—'}</span>}</td>
                <td className="actions-colonne">
                  {d.statut === 'recue' && <button className="btn-secondary btn-mini" onClick={() => traiter(d.id_demande, 'en_cours')}>Prendre en charge</button>}
                  {ouverte && <button className="btn-primary btn-mini" onClick={() => traiter(d.id_demande, 'traitee')}>{d.type === 'export' ? "Générer l'export" : 'Désactiver le compte'}</button>}
                  {ouverte && <button className="btn-danger btn-mini" onClick={() => traiter(d.id_demande, 'refusee')}>Refuser</button>}
                </td>
              </tr>
            )
          })}
          {demandes.length === 0 && <tr><td colSpan="6" className="muted">Aucune demande.</td></tr>}
        </tbody>
      </table>
      <p className="small-note">Suppression : le compte est désactivé et les coordonnées de contact effacées ; le dossier médical est conservé (obligation légale). Le patient est informé par e-mail à chaque étape.</p>
    </section>
  )
}

export default function DemandesDonnees() {
  return (
    <AppLayout title="Demandes INPDP" subtitle="Export et suppression des données personnelles des patients" roles={['ADMIN']}>
      <Contenu />
    </AppLayout>
  )
}
