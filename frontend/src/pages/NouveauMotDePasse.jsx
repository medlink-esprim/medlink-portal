// Formulaire partagé : choisir un mot de passe à partir d'un jeton reçu par e-mail.
// Utilisé par Reinitialisation (US-03) et Activation (US-27).
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api.js'
import AuthLayout from '../components/AuthLayout.jsx'
import Alert from '../components/Alert.jsx'
import PasswordRules, { passwordIsValid } from '../components/PasswordRules.jsx'

export default function NouveauMotDePasse({ title, endpoint, successText }) {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [serverRules, setServerRules] = useState([])
  const [result, setResult] = useState(null)

  async function submit(e) {
    e.preventDefault()
    const res = await api(endpoint, { method: 'POST', body: { token, password } })
    setServerRules(res.status === 422 ? res.data.regles || [] : [])
    setResult(res)
  }

  if (result && result.ok) {
    return (
      <AuthLayout title={title}>
        <Alert type="ok">{successText}</Alert>
        <p className="center"><Link to="/connexion">Se connecter</Link></p>
      </AuthLayout>
    )
  }
  return (
    <AuthLayout title={title} subtitle="Choisissez un mot de passe respectant toutes les règles.">
      {!token && <Alert type="error">Lien incomplet.</Alert>}
      <form onSubmit={submit}>
        <label htmlFor="password">Nouveau mot de passe</label>
        <input id="password" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <PasswordRules password={password} serverErrors={serverRules} />
        <label htmlFor="confirm">Confirmation</label>
        <input id="confirm" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        {confirm && confirm !== password && <Alert type="error">Les deux mots de passe sont différents.</Alert>}
        {result && !result.ok && <Alert type="error">{result.data?.message}</Alert>}
        <button className="btn-primary" disabled={!token || !passwordIsValid(password) || password !== confirm}>Valider</button>
      </form>
    </AuthLayout>
  )
}
