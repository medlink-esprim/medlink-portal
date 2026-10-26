// US-02 : connexion (message d'erreur générique, cf. maquette)
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api.js'
import AuthLayout from '../components/AuthLayout.jsx'
import Alert from '../components/Alert.jsx'

export default function Connexion() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const expiree = params.get('expiree') === '1'   // US-40 : retour après 15 min d'inactivité
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setError('')
    const res = await api('/auth/login', { method: 'POST', body: { email, password } })
    setBusy(false)
    if (res.ok) return navigate('/accueil')
    setError(res.data?.message || 'Connexion impossible')
  }

  return (
    <AuthLayout title="Connexion" subtitle="Accédez à votre espace sécurisé.">
      {expiree && <Alert type="info">Votre session a expiré après 15 minutes d'inactivité. Veuillez vous reconnecter.</Alert>}
      <form onSubmit={submit}>
        <label htmlFor="email">Adresse e-mail</label>
        <input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <label htmlFor="password">Mot de passe</label>
        <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <p className="right"><Link to="/mot-de-passe-oublie">Mot de passe oublié ?</Link></p>
        <Alert type="error">{error}</Alert>
        <button className="btn-primary" disabled={busy}>Se connecter</button>
      </form>
      <p className="center muted">Nouveau patient ? <Link to="/inscription">Créer un compte</Link></p>
    </AuthLayout>
  )
}
