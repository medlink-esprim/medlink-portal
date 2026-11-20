// US-63 : chaque page est chargée à la demande (React.lazy) ; seule la connexion est dans le premier fichier
import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Connexion from './pages/Connexion.jsx'
import BandeauMaintenance from './components/BandeauMaintenance.jsx'
import HorsService from './components/HorsService.jsx'

const Health = lazy(() => import('./pages/Health.jsx'))
const Accueil = lazy(() => import('./pages/Accueil.jsx'))
const Inscription = lazy(() => import('./pages/Inscription.jsx'))
const Verification = lazy(() => import('./pages/Verification.jsx'))
const MotDePasseOublie = lazy(() => import('./pages/MotDePasseOublie.jsx'))
const Reinitialisation = lazy(() => import('./pages/Reinitialisation.jsx'))
const Activation = lazy(() => import('./pages/Activation.jsx'))
const CreationCompte = lazy(() => import('./pages/CreationCompte.jsx'))
const VerificationMfa = lazy(() => import('./pages/VerificationMfa.jsx'))
const EnrolementMfa = lazy(() => import('./pages/EnrolementMfa.jsx'))
const Disponibilites = lazy(() => import('./pages/Disponibilites.jsx'))
const PrendreRendezVous = lazy(() => import('./pages/PrendreRendezVous.jsx'))
const ConfirmerRendezVous = lazy(() => import('./pages/ConfirmerRendezVous.jsx'))
const RolesDroits = lazy(() => import('./pages/RolesDroits.jsx'))
const Politique = lazy(() => import('./pages/Politique.jsx'))
const MesRendezVous = lazy(() => import('./pages/MesRendezVous.jsx'))
const MonProfil = lazy(() => import('./pages/MonProfil.jsx'))
const MesResultats = lazy(() => import('./pages/MesResultats.jsx'))
const MesPatients = lazy(() => import('./pages/MesPatients.jsx'))
const DossierPatient = lazy(() => import('./pages/DossierPatient.jsx'))
const Agenda = lazy(() => import('./pages/Agenda.jsx'))
const Comptes = lazy(() => import('./pages/Comptes.jsx'))
const RdvAccueil = lazy(() => import('./pages/RdvAccueil.jsx'))
const JournalAudit = lazy(() => import('./pages/JournalAudit.jsx'))
const Maintenance = lazy(() => import('./pages/Maintenance.jsx'))
const DemandesDonnees = lazy(() => import('./pages/DemandesDonnees.jsx'))
const Supervision = lazy(() => import('./pages/Supervision.jsx'))
const Synthese = lazy(() => import('./pages/Synthese.jsx'))
// ===== IMPORTS DES PAGES (const Page = lazy(() => import('./pages/Page.jsx'))) =====

export default function App() {
  return (
    <HorsService>                                                               {/* US-49 */}
    <BandeauMaintenance />
    <Suspense fallback={<div className="chargement" aria-busy="true">Chargement…</div>}>
    <Routes>
      <Route path="/" element={<Navigate to="/connexion" replace />} />
      <Route path="/health" element={<Health />} />                               {/* US-56 */}
      <Route path="/connexion" element={<Connexion />} />                         {/* US-02 */}
      <Route path="/accueil" element={<Accueil />} />                             {/* US-02 */}
      <Route path="/inscription" element={<Inscription />} />                     {/* US-01 */}
      <Route path="/verification" element={<Verification />} />                   {/* US-01 */}
      <Route path="/mot-de-passe-oublie" element={<MotDePasseOublie />} />        {/* US-03 */}
      <Route path="/reinitialisation" element={<Reinitialisation />} />           {/* US-03 */}
      <Route path="/activation" element={<Activation />} />                       {/* US-27 */}
      <Route path="/back-office/comptes/nouveau" element={<CreationCompte />} />  {/* US-27 */}
      <Route path="/connexion/verification" element={<VerificationMfa />} />      {/* US-17, US-34 */}
      <Route path="/connexion/enrolement" element={<EnrolementMfa />} />          {/* US-17, US-34 */}
      <Route path="/praticien/disponibilites" element={<Disponibilites />} />     {/* US-18 */}
      <Route path="/patient/rendez-vous/nouveau" element={<PrendreRendezVous />} />{/* US-05, US-06 */}
      <Route path="/patient/rendez-vous/confirmation" element={<ConfirmerRendezVous />} />{/* US-07 */}
      <Route path="/admin/roles" element={<RolesDroits />} />                     {/* US-33 */}
      <Route path="/politique-confidentialite" element={<Politique />} />         {/* US-04 */}
      <Route path="/patient/rendez-vous" element={<MesRendezVous />} />           {/* US-11 */}
      <Route path="/patient/profil" element={<MonProfil />} />                    {/* US-12, US-15 */}
      <Route path="/patient/resultats" element={<MesResultats />} />              {/* US-13 */}
      <Route path="/praticien/patients" element={<MesPatients />} />            {/* US-22 */}
      <Route path="/praticien/patients/:id" element={<DossierPatient />} />     {/* US-23 */}
      <Route path="/praticien/agenda" element={<Agenda />} />                   {/* US-19, US-20 */}
      <Route path="/back-office/comptes" element={<Comptes />} />               {/* US-28, US-29 */}
      <Route path="/back-office/rendez-vous" element={<RdvAccueil />} />        {/* US-30 */}
      <Route path="/admin/audit" element={<JournalAudit />} />                 {/* US-35, US-36 */}
      <Route path="/admin/maintenance" element={<Maintenance />} />           {/* US-38 */}
      <Route path="/admin/demandes" element={<DemandesDonnees />} />           {/* US-16 */}
      <Route path="/back-office/supervision" element={<Supervision />} />      {/* US-31, US-32 */}
      <Route path="/direction/synthese" element={<Synthese />} />      {/* US-50, US-51 */}
      {/* ===== ROUTES DES PAGES ===== */}
      <Route path="*" element={<Navigate to="/connexion" replace />} />
    </Routes>
    </Suspense>
    </HorsService>
  )
}
