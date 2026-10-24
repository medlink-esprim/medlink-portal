// US-02 : page d'accueil après connexion (espace selon le rôle)
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api.js'
import AuthLayout from '../components/AuthLayout.jsx'

const LIBELLES = {
  PATIENT: 'Patient', PRATICIEN: 'Praticien', AGENT_ADMIN: 'Agent administratif',
  ADMIN: 'Administrateur du portail', DIRECTION: 'Direction',
}

export default function Accueil() {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)

  useEffect(() => {
    api('/auth/me').then((res) => (res.ok ? setUser(res.data) : navigate('/connexion')))
  }, [navigate])

  async function logout() {
    await api('/auth/logout', { method: 'POST' })
    navigate('/connexion')
  }

  if (!user) return null
  const backOffice = ['AGENT_ADMIN', 'ADMIN'].includes(user.role)
  return (
    <AuthLayout title={`Bonjour ${user.prenom}`} subtitle={`Espace ${LIBELLES[user.role] || user.role}`}>
      <p>Vous êtes connecté. Votre session expire après 15 minutes d'inactivité.</p>
      {backOffice && <p><Link to="/back-office/comptes/nouveau">Créer un compte praticien ou agent</Link></p>}
      <button className="btn-secondary" onClick={logout}>Se déconnecter</button>
    </AuthLayout>
  )
}
