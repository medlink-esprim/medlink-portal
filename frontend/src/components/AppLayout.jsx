// Mise en page des espaces connectés : menu latéral avec icônes, barre supérieure (date, session), menu mobile.
// US-40 : minuteur d'inactivité côté client. Il repart à zéro à chaque appel réussi à l'API
// (comme derniere_activite côté serveur) ; à 0, l'utilisateur est déconnecté.
import { createContext, useContext, useEffect, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { api, EVENEMENT_ACTIVITE } from '../api.js'
import Icone, { LogoCroix } from './Icone.jsx'
import InstallerApp from './InstallerApp.jsx'

const UserContext = createContext(null)
export const useUser = () => useContext(UserContext)

const LIBELLES = {
  PATIENT: 'Patient', PRATICIEN: 'Praticien', AGENT_ADMIN: 'Agent administratif',
  ADMIN: 'Administrateur du portail', DIRECTION: 'Direction',
}

// ===== MENUS : chaque user story ajoute ses entrées [chemin, libellé, permission requise] =====
// US-33 : une entrée n'est affichée que si le rôle a reçu la permission correspondante.
const MENUS = {
  PATIENT: [['/accueil', 'Tableau de bord'], ['/patient/rendez-vous/nouveau', 'Prendre rendez-vous', 'RDV_PRENDRE'], ['/patient/rendez-vous', 'Mes rendez-vous', 'RDV_PRENDRE'], ['/patient/resultats', 'Mes résultats', 'DOSSIER_PROPRE'], ['/patient/profil', 'Mon profil']],
  PRATICIEN: [['/accueil', 'Tableau de bord'], ['/praticien/agenda', 'Mon agenda', 'DISPONIBILITES_GERER'], ['/praticien/patients', 'Mes patients', 'DOSSIER_PATIENTS'], ['/praticien/disponibilites', 'Disponibilités', 'DISPONIBILITES_GERER']],
  AGENT_ADMIN: [['/accueil', 'Tableau de bord'], ['/back-office/supervision', 'Supervision', 'SUPERVISION_CONSULTER'], ['/back-office/rendez-vous', 'Rendez-vous patient', 'RDV_POUR_PATIENT'], ['/back-office/comptes', 'Comptes', 'COMPTES_GERER'], ['/back-office/comptes/nouveau', 'Créer un compte', 'COMPTES_GERER']],
  ADMIN: [['/accueil', 'Tableau de bord'], ['/back-office/supervision', 'Supervision', 'SUPERVISION_CONSULTER'], ['/back-office/comptes', 'Comptes', 'COMPTES_GERER'], ['/back-office/comptes/nouveau', 'Créer un compte', 'COMPTES_GERER'], ['/admin/roles', 'Rôles et droits', 'ROLES_GERER'], ['/admin/audit', "Journal d'audit", 'AUDIT_CONSULTER'], ['/admin/maintenance', 'Maintenance', 'MAINTENANCE_GERER'], ['/admin/demandes', 'Demandes INPDP', 'DEMANDES_TRAITER']],
  DIRECTION: [['/accueil', 'Tableau de bord'], ['/back-office/supervision', 'Supervision', 'SUPERVISION_CONSULTER'], ['/direction/synthese', 'Synthèse', 'SYNTHESE_CONSULTER']],
}

// icône de chaque entrée du menu (par chemin)
const ICONES_MENU = {
  '/accueil': 'accueil', '/patient/rendez-vous/nouveau': 'calendrierPlus', '/patient/rendez-vous': 'calendrier', '/patient/resultats': 'document',
  '/patient/profil': 'utilisateur', '/praticien/agenda': 'calendrier', '/praticien/patients': 'utilisateurs', '/praticien/disponibilites': 'horloge',
  '/back-office/supervision': 'graphique', '/back-office/rendez-vous': 'calendrierPlus', '/back-office/comptes': 'utilisateurs',
  '/back-office/comptes/nouveau': 'plus', '/admin/roles': 'cle', '/admin/audit': 'bouclier', '/admin/maintenance': 'outil',
  '/admin/demandes': 'boite', '/direction/synthese': 'tendance',
}
// libellés courts de la barre de navigation mobile (4 premières entrées du menu)
const COURTS = {
  '/accueil': 'Accueil', '/patient/rendez-vous/nouveau': 'Réserver', '/patient/rendez-vous': 'Rendez-vous', '/patient/resultats': 'Résultats',
  '/patient/profil': 'Profil', '/praticien/agenda': 'Agenda', '/praticien/patients': 'Patients', '/praticien/disponibilites': 'Horaires',
  '/back-office/supervision': 'Supervision', '/back-office/rendez-vous': 'RDV', '/back-office/comptes': 'Comptes',
  '/back-office/comptes/nouveau': 'Créer', '/admin/roles': 'Rôles', '/admin/audit': 'Audit', '/admin/maintenance': 'Maintenance',
  '/admin/demandes': 'INPDP', '/direction/synthese': 'Synthèse',
}
const initiales = (u) => `${(u.prenom || '?')[0]}${(u.nom || '')[0] || ''}`.toUpperCase()

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
  const [menuOuvert, setMenuOuvert] = useState(false)
  const { pathname } = useLocation()
  useEffect(() => { setMenuOuvert(false) }, [pathname])

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

  if (!user) return <div className="chargement" aria-busy="true">Chargement…</div>
  const autorise = !roles || roles.includes(user.role)
  const entrees = (MENUS[user.role] || []).filter(([, , perm]) => !perm || (user.permissions || []).includes(perm))
  const date = new Date().toLocaleDateString('fr-FR', { timeZone: 'Africa/Tunis', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  return (
    <UserContext.Provider value={user}>
      <div className={`app${menuOuvert ? ' menu-ouvert' : ''}`}>
        <aside className="sidebar" aria-label="Menu principal">
          <div className="logo"><span className="logo-mark"><LogoCroix /></span>MedLink</div>
          <p className="nav-section">{LIBELLES[user.role] || 'Navigation'}</p>
          <nav>
            {entrees.map(([to, label]) => (
              <NavLink key={to} to={to} end><Icone nom={ICONES_MENU[to] || 'document'} />{label}</NavLink>
            ))}
          </nav>
          <div className="sidebar-foot">
            <InstallerApp />
            <div className="carte-utilisateur">
              <span className="avatar">{initiales(user)}</span>
              <div><strong>{user.prenom} {user.nom}</strong><span>{sousTitre(user)}</span></div>
            </div>
            <button className="link-light" onClick={logout}><Icone nom="deconnexion" />Se déconnecter</button>
          </div>
        </aside>
        <div className="voile-menu" onClick={() => setMenuOuvert(false)} aria-hidden="true" />
        <main className="app-main">
          <header className="topbar">
            <button className="bouton-menu" onClick={() => setMenuOuvert(true)} aria-label="Ouvrir le menu"><Icone nom="menu" /></button>
            <span className="date-du-jour">{date}</span>
            <span className="espace" />
            <span className={`puce-session${resteMin <= 3 ? ' bientot' : ''}`} title="La session se ferme après une période d'inactivité">
              <Icone nom="cadenas" />Session : {resteMin} min
            </span>
          </header>
          <div className="contenu-page">
            <div className="entete-page">
              <h1 className="page-title">{title}</h1>
              {subtitle && <p className="muted">{subtitle}</p>}
            </div>
            {autorise ? children : <div className="alert alert-error">Cette page est réservée à un autre profil.</div>}
          </div>
        </main>
        <nav className="barre-mobile" aria-label="Navigation rapide">
          {entrees.slice(0, 4).map(([to, label]) => (
            <NavLink key={to} to={to} end aria-label={label}><Icone nom={ICONES_MENU[to] || 'document'} /><span>{COURTS[to] || label}</span></NavLink>
          ))}
          <button type="button" onClick={() => setMenuOuvert(true)} aria-label="Ouvrir le menu"><Icone nom="menu" /><span>Menu</span></button>
        </nav>
      </div>
    </UserContext.Provider>
  )
}
