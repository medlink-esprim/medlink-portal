// US-11 : « Mes rendez-vous » — à venir, passés, annulés (cf. maquette)
// US-09 : annulation jusqu'à 24 h avant
// US-10 : report sur un créneau libre du même praticien
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import AppLayout from '../components/AppLayout.jsx'
import Alert from '../components/Alert.jsx'

const TZ = 'Africa/Tunis'
const fmtJour = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' })
const fmtHeure = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })
const dateHeure = (iso) => `${fmtJour.format(new Date(iso))} · ${fmtHeure.format(new Date(iso))}`
const fmtLong = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, day: 'numeric', month: 'long' })
const isoJour = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d)

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
  const [aReporter, setAReporter] = useState(null)       // rendez-vous en cours de report
  const [libres, setLibres] = useState([])
  const [choisi, setChoisi] = useState(null)
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

  // US-10 : créneaux libres du même praticien sur les 30 prochains jours
  async function ouvrirReport(r) {
    setAReporter(r); setChoisi(null); setMessage(null); setAAnnuler(null)
    const debut = new Date()
    const fin = new Date(debut.getTime() + 30 * 86400000)
    const q = new URLSearchParams({ praticien: r.id_praticien, debut: isoJour(debut), fin: isoJour(fin) })
    const res = await api(`/creneaux?${q}`)
    setLibres(res.ok ? res.data.filter((c) => c.statut === 'libre').slice(0, 15) : [])
  }

  async function confirmerReport() {
    const res = await api(`/rendez-vous/${aReporter.id_rdv}/report`, { method: 'PATCH', body: { idCreneau: choisi.id_creneau } })
    if (res.ok) {
      setMessage({ type: 'ok', text: `Rendez-vous reporté au ${dateHeure(choisi.debut)}. L'ancien créneau a été libéré et le praticien prévenu.` })
      setAReporter(null)
      return charger()
    }
    setMessage({ type: 'error', text: res.data?.message || 'Report impossible' })
    if (res.status === 409) ouvrirReport(aReporter)   // le créneau vient d'être pris : on recharge la liste
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
                        <button className="btn-secondary" onClick={() => ouvrirReport(r)}>Reporter</button>
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
        {aReporter && (
          <section className="card">
            <h2>Reporter le rendez-vous du {fmtLong.format(new Date(aReporter.debut))}</h2>
            <p className="muted">Créneaux libres chez le même praticien (Dr {aReporter.praticien_prenom} {aReporter.praticien_nom})</p>
            <div className="grille">
              {libres.map((c) => (
                <button key={c.id_creneau} type="button" className={`creneau ${choisi?.id_creneau === c.id_creneau ? 'choisi' : ''}`}
                  title={c.clinique} onClick={() => setChoisi(c)}>{dateHeure(c.debut)}</button>
              ))}
            </div>
            {libres.length === 0 && <p className="muted">Aucun créneau libre sur les 30 prochains jours.</p>}
            <div className="actions">
              <button className="btn-primary btn-auto" disabled={!choisi} onClick={confirmerReport}>Confirmer le report</button>
              <button className="btn-secondary btn-auto" onClick={() => setAReporter(null)}>Fermer</button>
            </div>
          </section>
        )}
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
