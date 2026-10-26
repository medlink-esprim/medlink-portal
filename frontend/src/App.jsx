import { Navigate, Route, Routes } from 'react-router-dom'
import Health from './pages/Health.jsx'
import Connexion from './pages/Connexion.jsx'
import Accueil from './pages/Accueil.jsx'
import Inscription from './pages/Inscription.jsx'
import Verification from './pages/Verification.jsx'
import MotDePasseOublie from './pages/MotDePasseOublie.jsx'
import Reinitialisation from './pages/Reinitialisation.jsx'
import Activation from './pages/Activation.jsx'
import CreationCompte from './pages/CreationCompte.jsx'
import VerificationMfa from './pages/VerificationMfa.jsx'
import EnrolementMfa from './pages/EnrolementMfa.jsx'
// ===== IMPORTS DES PAGES =====

export default function App() {
  return (
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
      {/* ===== ROUTES DES PAGES ===== */}
      <Route path="*" element={<Navigate to="/connexion" replace />} />
    </Routes>
  )
}
