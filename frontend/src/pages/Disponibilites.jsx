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
    </div>
  )
}

export default function Disponibilites() {
  return (
    <AppLayout title="Mes disponibilités" subtitle="Publiez vos plages de consultation par clinique — elles deviennent réservables par les patients" roles={['PRATICIEN']}>
      <Contenu />
    </AppLayout>
  )
}
