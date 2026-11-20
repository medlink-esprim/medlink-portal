// US-38 : annoncer une maintenance au moins 48 h à l'avance (bandeau affiché à tous dès 48 h avant).
import { useEffect, useState } from 'react'
import { api } from '../api.js'
import AppLayout from '../components/AppLayout.jsx'
import Alert from '../components/Alert.jsx'

const fmt = (iso) => new Date(iso).toLocaleString('fr-FR', { timeZone: 'Africa/Tunis', dateStyle: 'medium', timeStyle: 'short' })
const local = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)

function Contenu() {
  const dans3j = new Date(Date.now() + 72 * 3600 * 1000); dans3j.setMinutes(0, 0, 0)
  const [form, setForm] = useState({ debut: local(dans3j), fin: local(new Date(dans3j.getTime() + 2 * 3600 * 1000)), message: 'Le portail sera indisponible pendant une opération de maintenance.' })
  const [liste, setListe] = useState([])
  const [message, setMessage] = useState(null)
  const charger = () => api('/maintenance').then((r) => r.ok && setListe(r.data))
  useEffect(() => { charger() }, [])
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  async function publier(e) {
    e.preventDefault()
    const res = await api('/maintenance', { method: 'POST', body: { debut: new Date(form.debut).toISOString(), fin: new Date(form.fin).toISOString(), message: form.message } })
    setMessage({ type: res.ok ? 'ok' : 'error', text: res.data?.message || 'Publication impossible' })
    if (res.ok) charger()
  }
  async function annuler(id) {
    const res = await api(`/maintenance/${id}`, { method: 'DELETE' })
    setMessage({ type: res.ok ? 'ok' : 'error', text: res.data?.message || 'Annulation impossible' })
    charger()
  }

  return (
    <div className="two-cols">
      <form className="card" onSubmit={publier}>
        <h2>Nouvelle annonce</h2>
        <div className="row">
          <div><label htmlFor="m-debut">Début</label><input id="m-debut" type="datetime-local" required value={form.debut} onChange={set('debut')} /></div>
          <div><label htmlFor="m-fin">Fin</label><input id="m-fin" type="datetime-local" required value={form.fin} onChange={set('fin')} /></div>
        </div>
        <label htmlFor="m-message">Message affiché</label>
        <input id="m-message" required minLength={5} maxLength={300} value={form.message} onChange={set('message')} />
        {message && <Alert type={message.type}>{message.text}</Alert>}
        <div className="actions"><button className="btn-primary btn-auto">Publier l'annonce</button></div>
        <p className="small-note">Le début doit être au moins 48 h après maintenant. Le bandeau apparaît sur toutes les pages 48 h avant, jusqu'à la fin.</p>
      </form>
      <section className="card">
        <h2>Annonces</h2>
        <table className="table">
          <thead><tr><th>Période</th><th>Message</th><th></th></tr></thead>
          <tbody>
            {liste.map((a) => (
              <tr key={a.id_annonce}>
                <td>{fmt(a.debut)}<br />→ {fmt(a.fin)}</td>
                <td>{a.message}{a.annulee && <span className="pill pill-ko">annulée</span>}</td>
                <td className="right">{!a.annulee && new Date(a.fin) > new Date() && <button className="btn-secondary btn-mini" onClick={() => annuler(a.id_annonce)}>Annuler</button>}</td>
              </tr>
            ))}
            {liste.length === 0 && <tr><td colSpan="3" className="muted">Aucune annonce.</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  )
}

export default function Maintenance() {
  return (
    <AppLayout title="Maintenance" subtitle="Prévenir les utilisateurs 48 heures avant une indisponibilité" roles={['ADMIN']}>
      <Contenu />
    </AppLayout>
  )
}
