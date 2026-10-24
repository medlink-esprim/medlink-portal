import { Navigate, Route, Routes } from 'react-router-dom'
import Health from './pages/Health.jsx'
import Inscription from './pages/Inscription.jsx'
import Verification from './pages/Verification.jsx'
// ===== IMPORTS DES PAGES =====

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/health" replace />} />
      <Route path="/health" element={<Health />} />                               {/* US-56 */}
      <Route path="/inscription" element={<Inscription />} />                     {/* US-01 */}
      <Route path="/verification" element={<Verification />} />                   {/* US-01 */}
      {/* ===== ROUTES DES PAGES ===== */}
      <Route path="*" element={<Navigate to="/health" replace />} />
    </Routes>
  )
}
