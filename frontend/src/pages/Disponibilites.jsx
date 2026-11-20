// US-18 : « Mes disponibilités » — le praticien publie ses plages par clinique (cf. maquette)
import { useEffect, useState } from 'react'
import { api } from '../api.js'
import AppLayout from '../components/AppLayout.jsx'
import Alert from '../components/Alert.jsx'

const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']
const DUREES = [15, 20, 30, 45, 60]

const enMinutes = (h) => { const [a, b] = h.split(':').map(Number); return a * 60 + b }
const dansTroisMois = () => { const d = new Date(); d.setMonth(d.getMonth() + 3); return d.toISOString().slice(0, 10) }
const jourMois = (iso) => iso.split('-').reverse().slice(0, 2).join('/')

function Contenu() {
  const [cliniques, setCliniques] = useState([])
  const [plages, setPlages] = useState([])
  const [form, setForm] = useState({ idClinique: '', jourSemaine: 1, heureDebut: '08:30', heureFin: '12:30', dureeCreneau: 30, dateFin: dansTroisMois() })
  const [message, setMessage] = useState(null)
  const [nouvelle, setNouvelle] = useState(null)
  const [busy, setBusy] = useState(false)
  const set = (k, num) => (e) => setForm({ ...form, [k]: num ? Number(e.target.value) : e.target.value })

  async function charger() {
    const [c, p] = await Promise.all([api('/disponibilites/cliniques'), api('/disponibilites')])
    if (c.ok) {
      setCliniques(c.data)
      setForm((f) => ({ ...f, idClinique: f.idClinique || c.data[0]?.id_clinique || '' }))
    }
    if (p.ok) setPlages(p.data)
  }
  useEffect(() => { charger() }, [])

  const parSemaine = Math.max(0, Math.floor((enMinutes(form.heureFin) - enMinutes(form.heureDebut)) / form.dureeCreneau))

  async function publier(e) {
    e.preventDefault()
    setBusy(true); setMessage(null)
    const res = await api('/disponibilites', { method: 'POST', body: form })
    setBusy(false)
    if (res.status === 201) {
      setNouvelle(res.data.idPlage)
      setMessage({ type: 'ok', text: `Plage publiée : ${res.data.creneauxGeneres} créneaux réservables.` })
      charger()
    } else {
      setMessage({ type: 'error', text: res.data?.message || 'Publication impossible' })
    }
  }

  return (
    <div className="two-cols two-cols-even">
      <form className="card" onSubmit={publier}>
        <h2>Nouvelle plage</h2>
        {cliniques.length === 0 && <Alert type="info">Aucune clinique ne vous est encore affectée : contactez l'administration.</Alert>}
        <label htmlFor="clinique">Clinique</label>
        <select id="clinique" required value={form.idClinique} onChange={set('idClinique')}>
          {cliniques.map((c) => <option key={c.id_clinique} value={c.id_clinique}>{c.nom}</option>)}
        </select>
        <label htmlFor="jour">Jour</label>
        <select id="jour" value={form.jourSemaine} onChange={set('jourSemaine', true)}>
          {JOURS.map((j, i) => <option key={j} value={i + 1}>{j}</option>)}
        </select>
        <div className="row">
          <div><label htmlFor="debut">Début</label><input id="debut" type="time" required value={form.heureDebut} onChange={set('heureDebut')} /></div>
          <div><label htmlFor="fin">Fin</label><input id="fin" type="time" required value={form.heureFin} onChange={set('heureFin')} /></div>
        </div>
        <div className="row">
          <div><label htmlFor="duree">Durée d'un créneau</label>
            <select id="duree" value={form.dureeCreneau} onChange={set('dureeCreneau', true)}>
              {DUREES.map((d) => <option key={d} value={d}>{d} min</option>)}
            </select></div>
          <div><label htmlFor="jusquau">Valable jusqu'au</label><input id="jusquau" type="date" required value={form.dateFin} onChange={set('dateFin')} /></div>
        </div>
        <Alert type="info">{parSemaine} créneau{parSemaine > 1 ? 'x' : ''} par semaine {parSemaine > 1 ? 'seront générés' : 'sera généré'}.</Alert>
        {message && <Alert type={message.type}>{message.text}</Alert>}
        <button className="btn-primary" disabled={busy || !form.idClinique || parSemaine === 0}>Publier la plage</button>
      </form>

      <section className="card">
        <h2>Plages publiées</h2>
        <table className="table">
          <thead><tr><th>Clinique</th><th>Jour</th><th>Horaire</th><th>Créneau</th><th>Période</th><th>Réservés</th></tr></thead>
          <tbody>
            {plages.map((p) => (
              <tr key={p.id_plage}>
                <td>{p.ville}</td>
                <td>{JOURS[p.jour_semaine - 1]}</td>
                <td>{p.heure_debut} – {p.heure_fin}</td>
                <td>{p.duree_creneau} min</td>
                <td>jusqu'au {jourMois(p.date_fin)}</td>
                <td>{p.id_plage === nouvelle ? <span className="pill pill-new">Nouveau</span> : `${p.creneaux_reserves} / ${p.creneaux_a_venir}`}</td>
              </tr>
            ))}
            {plages.length === 0 && <tr><td colSpan="6" className="muted">Aucune plage publiée.</td></tr>}
          </tbody>
        </table>
        <p className="muted">Vous n'apparaissez que dans les cliniques auxquelles l'administration vous a affecté.</p>
      </section>
      <Absences />
    </div>
  )
}

// US-21 : absences et congés — les créneaux libres de la période sont bloqués
const fmtJour = (iso) => new Date(iso).toLocaleDateString('fr-FR', { timeZone: 'Africa/Tunis', weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })
const veille = (iso) => new Date(new Date(iso).getTime() - 1000).toISOString()
const fmtHeure = (iso) => new Date(iso).toLocaleString('fr-FR', { timeZone: 'Africa/Tunis', dateStyle: 'short', timeStyle: 'short' })

function Absences() {
  const [absences, setAbsences] = useState([])
  const [form, setForm] = useState({ dateDebut: '', dateFin: '', motif: '' })
  const [message, setMessage] = useState(null)
  const [aPrevenir, setAPrevenir] = useState([])
  const charger = () => api('/disponibilites/absences').then((r) => r.ok && setAbsences(r.data))
  useEffect(() => { charger() }, [])
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  async function bloquer(e) {
    e.preventDefault()
    const res = await api('/disponibilites/absences', { method: 'POST', body: form })
    if (!res.ok) { setMessage({ type: 'error', text: res.data?.message || 'Enregistrement impossible' }); return }
    setMessage({ type: 'ok', text: `Absence enregistrée : ${res.data.creneauxBloques} créneau(x) bloqué(s), plus aucune réservation possible sur la période.` })
    setAPrevenir(res.data.rendezVousAPrevenir)
    setForm({ dateDebut: '', dateFin: '', motif: '' })
    charger()
  }
  async function supprimer(id) {
    const res = await api(`/disponibilites/absences/${id}`, { method: 'DELETE' })
    setMessage({ type: res.ok ? 'ok' : 'error', text: res.ok ? `Absence supprimée : ${res.data.creneauxLiberes} créneau(x) de nouveau réservable(s).` : res.data?.message || 'Suppression impossible' })
    setAPrevenir([])
    charger()
  }

  return (
    <section className="card">
      <h2>Absences et congés</h2>
      <form onSubmit={bloquer}>
        <div className="row">
          <div><label htmlFor="abs-debut">Du</label><input id="abs-debut" type="date" required value={form.dateDebut} onChange={set('dateDebut')} /></div>
          <div><label htmlFor="abs-fin">Au (inclus)</label><input id="abs-fin" type="date" required min={form.dateDebut} value={form.dateFin} onChange={set('dateFin')} /></div>
        </div>
        <label htmlFor="abs-motif">Motif (facultatif)</label>
        <input id="abs-motif" maxLength={120} placeholder="Congé, formation…" value={form.motif} onChange={set('motif')} />
        <div className="actions"><button className="btn-primary btn-auto">Bloquer la période</button></div>
      </form>
      {message && <Alert type={message.type}>{message.text}</Alert>}
      {aPrevenir.length > 0 && (
        <Alert type="error">
          {aPrevenir.length} rendez-vous déjà pris sur cette période : reportez-les ou annulez-les avec les patients.
          <ul>{aPrevenir.map((r) => <li key={r.id_rdv}>{fmtHeure(r.debut)} · {r.ville} · {r.prenom} {r.nom}</li>)}</ul>
        </Alert>
      )}
      <table className="table">
        <thead><tr><th>Période</th><th>Motif</th><th>Créneaux bloqués</th><th></th></tr></thead>
        <tbody>
          {absences.map((a) => (
            <tr key={a.id_absence}>
              <td>{fmtJour(a.debut)} → {fmtJour(veille(a.fin))}</td>
              <td>{a.motif || '—'}</td>
              <td>{a.creneaux_bloques}</td>
              <td className="right"><button className="btn-secondary btn-mini" onClick={() => supprimer(a.id_absence)}>Supprimer</button></td>
            </tr>
          ))}
          {absences.length === 0 && <tr><td colSpan="4" className="muted">Aucune absence prévue.</td></tr>}
        </tbody>
      </table>
    </section>
  )
}

export default function Disponibilites() {
  return (
    <AppLayout title="Mes disponibilités" subtitle="Publiez vos plages de consultation par clinique — elles deviennent réservables par les patients" roles={['PRATICIEN']}>
      <Contenu />
    </AppLayout>
  )
}
