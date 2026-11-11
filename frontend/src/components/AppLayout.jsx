// Mise en page des espaces connectés (menu latéral des maquettes).
// US-40 : minuteur d'inactivité côté client. Il repart à zéro à chaque appel réussi à l'API
// (comme derniere_activite côté serveur) ; à 0, l'utilisateur est déconnecté.
import { createContext, useContext, useEffect, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { api, EVENEMENT_ACTIVITE } from '../api.js'

const UserContext = createContext(null)
export const useUser = () => useContext(UserContext)

const LIBELLES = {
  PATIENT: 'Patient', PRATICIEN: 'Praticien', AGENT_ADMIN: 'Agent administratif',
  ADMIN: 'Administrateur du portail', DIRECTION: 'Direction',
}

// ===== MENUS : chaque user story ajoute ses entrées [chemin, libellé, permission requise] =====
// US-33 : une entrée n'est affichée que si le rôle a reçu la permission correspondante.
const MENUS = {
  PATIENT: [['/accueil', 'Tableau de bord'], ['/patient/rendez-vous/nouveau', 'Prendre rendez-vous', 'RDV_PRENDRE'], ['/patient/rendez-vous', 'Mes rendez-vous', 'RDV_PRENDRE'], ['/patient/profil', 'Mon profil']],
  PRATICIEN: [['/accueil', 'Tableau de bord'], ['/praticien/disponibilites', 'Disponibilités', 'DISPONIBILITES_GERER']],
  AGENT_ADMIN: [['/accueil', 'Tableau de bord'], ['/back-office/comptes/nouveau', 'Créer un compte', 'COMPTES_GERER']],
  ADMIN: [['/accueil', 'Tableau de bord'], ['/back-office/comptes/nouveau', 'Créer un compte', 'COMPTES_GERER'], ['/admin/roles', 'Rôles et droits', 'ROLES_GERER']],
  DIRECTION: [['/accueil', 'Tableau de bord']],
}

function sousTitre(user) {
  if (user.role === 'PATIENT') return `Patient · dossier ${user.numeroDossier || '—'}`
  if (user.role === 'PRATICIEN') return `${user.specialite || 'Praticien'}${user.mfaActive ? ' · MFA actif' : ''}`
  return LIBELLES[user.role] || user.role
}

export default function AppLayout({ title, subtitle, roles, children }) {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [derniereActivite, setDerniereActivite] = useState(Date.now())
  const [maintenant, setMaintenant] = useState(Date.now())

  useEffect(() => {
    api('/auth/me').then((res) => (res.ok ? setUser(res.data) : navigate('/connexion?expiree=1')))
  }, [navigate])

  useEffect(() => {
    const surActivite = () => setDerniereActivite(Date.now())
    window.addEventListener(EVENEMENT_ACTIVITE, surActivite)
    const t = setInterval(() => setMaintenant(Date.now()), 15000)
    return () => { window.removeEventListener(EVENEMENT_ACTIVITE, surActivite); clearInterval(t) }
  }, [])

  const limiteMs = (user?.inactiviteMin || 15) * 60 * 1000
  const resteMin = Math.max(0, Math.ceil((derniereActivite + limiteMs - maintenant) / 60000))

  useEffect(() => {
    if (user && resteMin === 0) {
      api('/auth/logout', { method: 'POST' }).finally(() => navigate('/connexion?expiree=1'))
    }
  }, [user, resteMin, navigate])

  async function logout() {
    await api('/auth/logout', { method: 'POST' })
    navigate('/connexion')
  }

  if (!user) return null
  const autorise = !roles || roles.includes(user.role)
  return (
    <UserContext.Provider value={user}>
      <div className="app">
        <aside className="sidebar">
          <div className="logo logo-light"><span className="logo-mark">+</span>MedLink</div>
          <nav>
            {(MENUS[user.role] || []).filter(([, , perm]) => !perm || (user.permissions || []).includes(perm)).map(([to, label]) => (
              <NavLink key={to} to={to} end>{label}</NavLink>
            ))}
          </nav>
          <div className="sidebar-foot">
            <strong>{user.prenom} {user.nom}</strong>
            <span>{sousTitre(user)}</span>
            <span>Session : expire dans {resteMin} min</span>
            <button className="link-light" onClick={logout}>Se déconnecter</button>
          </div>
        </aside>
        <main className="app-main">
          <h1 className="page-title">{title}</h1>
          {subtitle && <p className="muted">{subtitle}</p>}
          {autorise ? children : <div className="alert alert-error">Cette page est réservée à un autre profil.</div>}
        </main>
      </div>
    </UserContext.Provider>
  )
}
