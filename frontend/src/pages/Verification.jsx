// US-01 : activation du compte depuis le lien reçu par e-mail.
// L'activation se fait sur un clic (et non au chargement) pour qu'un antivirus
// qui « visite » le lien ne consomme pas le jeton à la place du patient.
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api.js'
import AuthLayout from '../components/AuthLayout.jsx'
import Alert from '../components/Alert.jsx'

export default function Verification() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const [result, setResult] = useState(null)

  async function activer() {
    setResult(await api('/auth/verification', { method: 'POST', body: { token } }))
  }

  return (
    <AuthLayout title="Vérification de l'adresse e-mail">
      {!token && <Alert type="error">Lien incomplet.</Alert>}
      {token && !result && <button className="btn-primary" onClick={activer}>Activer mon compte</button>}
      {result && result.ok && (
        <><Alert type="ok">Compte activé.</Alert><p className="center"><Link to="/connexion">Se connecter</Link></p></>
      )}
      {result && !result.ok && <Alert type="error">{result.data?.message}</Alert>}
    </AuthLayout>
  )
}
