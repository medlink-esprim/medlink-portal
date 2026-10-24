// US-03 : demande de lien de réinitialisation (réponse toujours identique)
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import AuthLayout from '../components/AuthLayout.jsx'
import Alert from '../components/Alert.jsx'

export default function MotDePasseOublie() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState(null)

  async function submit(e) {
    e.preventDefault()
    const res = await api('/auth/mot-de-passe-oublie', { method: 'POST', body: { email } })
    setMessage(res.ok ? { type: 'ok', text: res.data.message } : { type: 'error', text: res.data?.message || 'Erreur' })
  }

  return (
    <AuthLayout title="Mot de passe oublié"
      subtitle="Saisissez l'adresse e-mail de votre compte. Si elle est connue, vous recevrez un lien valable 30 minutes.">
      <form onSubmit={submit}>
        <label htmlFor="email">Adresse e-mail</label>
        <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <button className="btn-primary">Envoyer le lien</button>
      </form>
      {message && <Alert type={message.type}>{message.text}</Alert>}
      <p className="center"><Link to="/connexion">← Retour à la connexion</Link></p>
    </AuthLayout>
  )
}
