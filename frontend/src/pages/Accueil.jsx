// US-02 / US-40 : tableau de bord après connexion (raccourcis selon le rôle)
import { Link, useLocation } from 'react-router-dom'
import AppLayout, { useUser } from '../components/AppLayout.jsx'

// ===== RACCOURCIS : chaque user story ajoute les siens =====
const RACCOURCIS = {
  PATIENT: [['/patient/rendez-vous/nouveau', 'Prendre rendez-vous']],
  PRATICIEN: [['/praticien/disponibilites', 'Publier mes disponibilités']],
  AGENT_ADMIN: [['/back-office/comptes/nouveau', 'Créer un compte praticien ou agent']],
  ADMIN: [['/back-office/comptes/nouveau', 'Créer un compte praticien ou agent']],
}

function Contenu() {
  const user = useUser()
  const { state } = useLocation()
  const liens = RACCOURCIS[user.role] || []
  const restants = state?.codesSecoursRestants
  return (
    <div className="cards">
      {restants !== undefined && (
        <div className="alert alert-info">Connexion avec un code de secours : il vous en reste {restants}.</div>
      )}
      {liens.map(([to, label]) => (
        <Link key={to} className="card card-link" to={to}>{label} →</Link>
      ))}
      <div className="card muted">Votre session expire après {user.inactiviteMin} minutes d'inactivité.</div>
    </div>
  )
}

export default function Accueil() {
  return (
    <AppLayout title="Tableau de bord" subtitle="Bienvenue sur votre espace MedLink.">
      <Contenu />
    </AppLayout>
  )
}
