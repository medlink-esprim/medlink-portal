// US-56 : page de test — une donnée lue en base via l'API
import { useEffect, useState } from 'react'
import { api } from '../api.js'
import AuthLayout from '../components/AuthLayout.jsx'
import Alert from '../components/Alert.jsx'

export default function Health() {
  const [result, setResult] = useState(null)
  useEffect(() => { api('/health').then(setResult) }, [])

  return (
    <AuthLayout title="État du portail" subtitle="Page de test de l'environnement (US-56)">
      {!result && <p>Chargement…</p>}
      {result && result.ok && (
        <Alert type="ok">API joignable — {result.data.cliniques} cliniques lues dans PostgreSQL.</Alert>
      )}
      {result && !result.ok && <Alert type="error">L'API ne répond pas (code {result.status}).</Alert>}
    </AuthLayout>
  )
}
