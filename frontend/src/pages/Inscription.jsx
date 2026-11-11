// US-01 : inscription d'un patient (+ règles du mot de passe en direct, US-42)
// US-04 : case de consentement obligatoire, liée à la version de la politique en vigueur
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import AuthLayout from '../components/AuthLayout.jsx'
import Alert from '../components/Alert.jsx'
import PasswordRules, { passwordIsValid } from '../components/PasswordRules.jsx'

const EMPTY = { nom: '', prenom: '', email: '', telephone: '', password: '', consentement: false }

export default function Inscription() {
  const [form, setForm] = useState(EMPTY)
  const [serverRules, setServerRules] = useState([])
  const [message, setMessage] = useState(null)
  const [busy, setBusy] = useState(false)
  const [version, setVersion] = useState('')
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  useEffect(() => {
    api('/auth/politique').then((res) => res.ok && setVersion(res.data.version))
  }, [])

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setMessage(null); setServerRules([])
    const res = await api('/auth/inscription', { method: 'POST', body: form })
    setBusy(false)
    if (res.status === 202) { setForm(EMPTY); return setMessage({ type: 'ok', text: res.data.message }) }
    if (res.status === 422) setServerRules(res.data.regles || [])
    setMessage({ type: 'error', text: res.data?.message || 'Inscription impossible' })
  }

  return (
    <AuthLayout title="Créer mon espace patient" subtitle="Tous les champs sont obligatoires.">
      <form onSubmit={submit}>
        <div className="row">
          <div><label htmlFor="nom">Nom</label><input id="nom" required value={form.nom} onChange={set('nom')} /></div>
          <div><label htmlFor="prenom">Prénom</label><input id="prenom" required value={form.prenom} onChange={set('prenom')} /></div>
        </div>
        <label htmlFor="email">Adresse e-mail</label>
        <input id="email" type="email" required value={form.email} onChange={set('email')} />
        <label htmlFor="telephone">Téléphone mobile</label>
        <input id="telephone" placeholder="+216 98 000 000" required value={form.telephone} onChange={set('telephone')} />
        <label htmlFor="password">Mot de passe</label>
        <input id="password" type="password" autoComplete="new-password" required value={form.password} onChange={set('password')} />
        <PasswordRules password={form.password} serverErrors={serverRules} />
        <label className="consentement">
          <input type="checkbox" required checked={form.consentement} onChange={(e) => setForm({ ...form, consentement: e.target.checked })} />
          <span>
            J'ai lu la <Link to="/politique-confidentialite" target="_blank" rel="noopener">politique de protection des données</Link>
            {version && ` (version ${version})`} et j'accepte que MedLink traite mes données de santé pour gérer mes rendez-vous et mon dossier.
          </span>
        </label>
        {message && <Alert type={message.type}>{message.text}</Alert>}
        <button className="btn-primary" disabled={busy || !passwordIsValid(form.password) || !form.consentement}>Créer mon compte</button>
      </form>
      <p className="center muted">Déjà inscrit ? <Link to="/connexion">Se connecter</Link></p>
    </AuthLayout>
  )
}
