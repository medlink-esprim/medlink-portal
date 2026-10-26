// US-17 / US-34 : vérification en deux étapes (code TOTP ou code de secours), cf. maquette
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api.js'
import AuthLayout from '../components/AuthLayout.jsx'
import Alert from '../components/Alert.jsx'
import CodeSixChiffres from '../components/CodeSixChiffres.jsx'

export default function VerificationMfa() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [secours, setSecours] = useState(false)
  const [codeSecours, setCodeSecours] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setError('')
    const body = secours ? { codeSecours } : { code }
    const res = await api('/auth/mfa', { method: 'POST', body })
    setBusy(false)
    if (res.ok) return navigate('/accueil', { state: { codesSecoursRestants: res.data.codesSecoursRestants } })
    setCode('')
    setError(res.data?.message || 'Vérification impossible')
  }

  return (
    <AuthLayout
      title="Vérification en deux étapes"
      subtitle={secours
        ? 'Saisissez un de vos codes de secours (chaque code ne fonctionne qu\'une fois).'
        : 'Saisissez le code à 6 chiffres affiché dans votre application d\'authentification (Google Authenticator, FreeOTP...).'}
    >
      <form onSubmit={submit}>
        {secours ? (
          <>
            <label htmlFor="secours">Code de secours</label>
            <input id="secours" autoComplete="off" placeholder="ABCD-EFGH" value={codeSecours} onChange={(e) => setCodeSecours(e.target.value)} />
          </>
        ) : (
          <>
            <CodeSixChiffres value={code} onChange={setCode} />
            <p className="center muted">Le code change toutes les 30 secondes.</p>
          </>
        )}
        <Alert type="error">{error}</Alert>
        <button className="btn-primary" disabled={busy || (secours ? !codeSecours : code.length !== 6)}>Vérifier</button>
      </form>
      <Alert type="info">Le second facteur est obligatoire pour les comptes praticiens et administrateurs.</Alert>
      <p className="center">
        <button type="button" className="link" onClick={() => { setSecours(!secours); setError('') }}>
          {secours ? 'Utiliser le code de l\'application' : 'Utiliser un code de secours'}
        </button>
      </p>
      {error.includes('expirée') && <p className="center"><Link to="/connexion">Revenir à la connexion</Link></p>}
    </AuthLayout>
  )
}
