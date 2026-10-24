// US-27 : création d'un compte praticien ou agent (back-office, cf. maquette)
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api.js'
import Alert from '../components/Alert.jsx'

const EMPTY = { nom: '', prenom: '', email: '', telephone: '', role: 'PRATICIEN', specialite: '', numeroOrdre: '', idClinique: '', fonction: '' }

export default function CreationCompte() {
  const navigate = useNavigate()
  const [form, setForm] = useState(EMPTY)
  const [cliniques, setCliniques] = useState([])
  const [recents, setRecents] = useState([])
  const [message, setMessage] = useState(null)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  async function load() {
    const [c, r] = await Promise.all([api('/comptes/cliniques'), api('/comptes')])
    if (c.status === 401) return navigate('/connexion')
    if (c.status === 403) return setMessage({ type: 'error', text: 'Accès réservé au personnel administratif.' })
    setCliniques(c.data || []); setRecents(r.data || [])
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(e) {
    e.preventDefault()
    const body = { nom: form.nom, prenom: form.prenom, email: form.email, telephone: form.telephone, role: form.role }
    if (form.role === 'PRATICIEN') Object.assign(body, { specialite: form.specialite, numeroOrdre: form.numeroOrdre })
    else Object.assign(body, { idClinique: form.idClinique, fonction: form.fonction })
    const res = await api('/comptes', { method: 'POST', body })
    if (res.status === 201) { setForm(EMPTY); load() }
    setMessage({ type: res.status === 201 ? 'ok' : 'error', text: res.data?.message || 'Erreur' })
  }

  const praticien = form.role === 'PRATICIEN'
  return (
    <div className="page">
      <header className="page-head">
        <div><h1>Nouveau compte utilisateur</h1><p className="muted">Une invitation d'activation (72 h) est envoyée par e-mail.</p></div>
        <Link to="/accueil">← Accueil</Link>
      </header>
      <div className="two-cols">
        <form className="card" onSubmit={submit}>
          <h2>Identité</h2>
          <div className="row">
            <div><label htmlFor="nom">Nom</label><input id="nom" required value={form.nom} onChange={set('nom')} /></div>
            <div><label htmlFor="prenom">Prénom</label><input id="prenom" required value={form.prenom} onChange={set('prenom')} /></div>
          </div>
          <div className="row">
            <div><label htmlFor="email">E-mail professionnel</label><input id="email" type="email" required value={form.email} onChange={set('email')} /></div>
            <div><label htmlFor="telephone">Téléphone</label><input id="telephone" value={form.telephone} onChange={set('telephone')} /></div>
          </div>
          <h2>Rôle et rattachement</h2>
          <label htmlFor="role">Rôle</label>
          <select id="role" value={form.role} onChange={set('role')}>
            <option value="PRATICIEN">Praticien</option>
            <option value="AGENT_ADMIN">Agent administratif</option>
          </select>
          {praticien ? (
            <div className="row">
              <div><label htmlFor="specialite">Spécialité</label>
                <select id="specialite" required value={form.specialite} onChange={set('specialite')}>
                  <option value="">Choisir…</option>
                  <option>Médecine générale</option><option>Cardiologie</option><option>Pédiatrie</option>
                </select></div>
              <div><label htmlFor="ordre">N° d'inscription à l'Ordre</label><input id="ordre" value={form.numeroOrdre} onChange={set('numeroOrdre')} /></div>
            </div>
          ) : (
            <div className="row">
              <div><label htmlFor="clinique">Clinique</label>
                <select id="clinique" required value={form.idClinique} onChange={set('idClinique')}>
                  <option value="">Choisir…</option>
                  {cliniques.map((c) => <option key={c.id_clinique} value={c.id_clinique}>{c.nom}</option>)}
                </select></div>
              <div><label htmlFor="fonction">Fonction</label><input id="fonction" value={form.fonction} onChange={set('fonction')} /></div>
            </div>
          )}
          {message && <Alert type={message.type}>{message.text}</Alert>}
          <button className="btn-primary">Créer et envoyer l'invitation</button>
        </form>
        <aside className="card">
          <h2>Derniers comptes créés</h2>
          <table>
            <tbody>
              {recents.map((u) => (
                <tr key={`${u.nom}-${u.date_creation}`}>
                  <td>{u.prenom} {u.nom}<br /><span className="muted">{u.role}</span></td>
                  <td><span className={`pill ${u.statut === 'actif' ? 'pill-ok' : 'pill-wait'}`}>{u.statut === 'actif' ? 'Actif' : 'En attente'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </aside>
      </div>
    </div>
  )
}
