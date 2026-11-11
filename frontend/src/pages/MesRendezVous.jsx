// US-11 : « Mes rendez-vous » — à venir, passés, annulés (cf. maquette)
// US-09 : annulation jusqu'à 24 h avant
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import AppLayout from '../components/AppLayout.jsx'
import Alert from '../components/Alert.jsx'

const TZ = 'Africa/Tunis'
const fmtJour = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' })
const fmtHeure = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })
const dateHeure = (iso) => `${fmtJour.format(new Date(iso))} · ${fmtHeure.format(new Date(iso))}`

const STATUTS = {
  planifie: ['Planifié', 'pill-ok'],
  reporte: ['Reporté', 'pill-new'],
  annule: ['Annulé', 'pill-ko'],
  honore: ['Honoré', 'pill-ok'],
  manque: ['Manqué', 'pill-ko'],
}

function onglet(r) {
  if (r.statut === 'annule' || r.statut === 'reporte') return 'annules'
  return r.statut === 'planifie' && new Date(r.debut) > new Date() ? 'avenir' : 'passes'
}

function Statut({ r }) {
  const [libelle, classe] = STATUTS[r.statut] || [r.statut, '']
  if (r.statut === 'planifie' && r.id_rdv_origine) return <span className="pill pill-new">Reporté → nouveau</span>
  return <span className={`pill ${classe}`}>{libelle}</span>
}

function Contenu() {
  const [rdvs, setRdvs] = useState(null)
  const [tab, setTab] = useState('avenir')
  const [aAnnuler, setAAnnuler] = useState(null)
  const [message, setMessage] = useState(null)

  async function charger() {
    const res = await api('/patients/moi/rendez-vous')
    setRdvs(res.ok ? res.data : [])
  }
  useEffect(() => { charger() }, [])

  async function annuler(id) {
    const res = await api(`/rendez-vous/${id}/annulation`, { method: 'PATCH' })
    setAAnnuler(null)
    setMessage(res.ok
      ? { type: 'ok', text: 'Rendez-vous annulé. Le créneau a été libéré et le praticien prévenu.' }
      : { type: 'error', text: res.data?.message || 'Annulation impossible' })
    charger()
  }

  if (!rdvs) return null
  const parOnglet = { avenir: [], passes: [], annules: [] }
  for (const r of rdvs) parOnglet[onglet(r)].push(r)
  parOnglet.avenir.reverse()   // le plus proche en premier
  const liste = parOnglet[tab]

  return (
    <>
      <div className="tabs">
        {[['avenir', 'À venir'], ['passes', 'Passés'], ['annules', 'Annulés']].map(([k, label]) => (
          <button key={k} className={tab === k ? 'actif' : ''} onClick={() => setTab(k)}>{label} ({parOnglet[k].length})</button>
        ))}
      </div>
      {message && <Alert type={message.type}>{message.text}</Alert>}
      <section className="card">
        <table className="table">
          <thead><tr><th>Date</th><th>Praticien</th><th>Clinique</th><th>Statut</th><th className="right">Actions</th></tr></thead>
          <tbody>
            {liste.map((r) => (
              <tr key={r.id_rdv}>
                <td><strong>{dateHeure(r.debut)}</strong></td>
                <td>Dr {r.praticien_prenom} {r.praticien_nom}<br /><span className="muted">{r.specialite}</span></td>
                <td>{r.ville}</td>
                <td><Statut r={r} /></td>
                <td className="right">
                  {tab === 'avenir' && (r.modifiable ? (
                    aAnnuler === r.id_rdv ? (
                      <span className="actions-ligne">
                        <button className="btn-danger" onClick={() => annuler(r.id_rdv)}>Confirmer l'annulation</button>
                        <button className="btn-secondary" onClick={() => setAAnnuler(null)}>Garder</button>
                      </span>
                    ) : (
                      <span className="actions-ligne">
                        {/* ===== ACTIONS SUR UN RENDEZ-VOUS ===== */}
                        <button className="btn-secondary btn-rouge" onClick={() => { setAAnnuler(r.id_rdv); setMessage(null) }}>Annuler</button>
                      </span>
                    )
                  ) : <span className="muted" title="Moins de 24 h avant le rendez-vous">Appelez la clinique</span>)}
                </td>
              </tr>
            ))}
            {liste.length === 0 && (
              <tr><td colSpan="5" className="muted">
                Aucun rendez-vous. {tab === 'avenir' && <Link to="/patient/rendez-vous/nouveau">Prendre rendez-vous</Link>}
              </td></tr>
            )}
          </tbody>
        </table>
      </section>
      <div className="two-cols">
        {/* ===== PANNEAU DE REPORT ===== */}
        <aside className="card">
          <h2>Rappels</h2>
          <p className="muted">Un rappel vous est envoyé la veille de chaque rendez-vous, sur les canaux choisis dans « Mon profil ». En cas d'annulation, le créneau est libéré et le praticien prévenu automatiquement.</p>
        </aside>
      </div>
    </>
  )
}

export default function MesRendezVous() {
  return (
    <AppLayout title="Mes rendez-vous" subtitle="Annulez ou reportez jusqu'à 24 h avant le rendez-vous" roles={['PATIENT']}>
      <Contenu />
    </AppLayout>
  )
}
