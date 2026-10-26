// US-17 / US-34 : activation du second facteur à la première connexion (QR code + premier code),
// puis affichage UNIQUE des 10 codes de secours.
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api.js'
import AuthLayout from '../components/AuthLayout.jsx'
import Alert from '../components/Alert.jsx'
import CodeSixChiffres from '../components/CodeSixChiffres.jsx'

export default function EnrolementMfa() {
  const navigate = useNavigate()
  const [qr, setQr] = useState(null)
  const [code, setCode] = useState('')
  const [codes, setCodes] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api('/auth/mfa/enrolement', { method: 'POST' }).then((res) => (res.ok ? setQr(res.data) : setError(res.data?.message || 'Erreur')))
  }, [])

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setError('')
    const res = await api('/auth/mfa/enrolement/confirmation', { method: 'POST', body: { code } })
    setBusy(false)
    if (res.ok) return setCodes(res.data.codesSecours)
    setCode('')
    setError(res.data?.message || 'Code invalide')
  }

  if (codes) {
    return (
      <AuthLayout title="Codes de secours" subtitle="Le second facteur est activé. Notez ces codes et gardez-les en lieu sûr.">
        <ul className="codes-secours">{codes.map((c) => <li key={c}><code>{c}</code></li>)}</ul>
        <Alert type="info">Chaque code permet une seule connexion si vous n'avez plus votre téléphone. Ils ne seront plus affichés.</Alert>
        <button className="btn-primary" onClick={() => navigate('/accueil')}>J'ai noté mes codes</button>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Activer la vérification en deux étapes" subtitle="Obligatoire pour les comptes praticiens et administrateurs.">
      {!qr && !error && <p className="muted">Préparation…</p>}
      {qr && (
        <>
          <ol className="steps">
            <li>Installez une application d'authentification (Google Authenticator, FreeOTP…).</li>
            <li>Scannez ce QR code avec l'application.</li>
          </ol>
          <img className="qr" src={qr.qr} alt="QR code à scanner" width="220" height="220" />
          <p className="center muted">Saisie manuelle : <code className="secret">{qr.secret}</code></p>
          <form onSubmit={submit}>
            <label>3. Saisissez le code à 6 chiffres affiché</label>
            <CodeSixChiffres value={code} onChange={setCode} />
            <button className="btn-primary" disabled={busy || code.length !== 6}>Activer</button>
          </form>
        </>
      )}
      <Alert type="error">{error}</Alert>
      {error && <p className="center"><Link to="/connexion">Revenir à la connexion</Link></p>}
    </AuthLayout>
  )
}
