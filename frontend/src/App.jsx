import { Navigate, Route, Routes } from 'react-router-dom'
import Health from './pages/Health.jsx'
// ===== IMPORTS DES PAGES =====

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/health" replace />} />
      <Route path="/health" element={<Health />} />                               {/* US-56 */}
      {/* ===== ROUTES DES PAGES ===== */}
      <Route path="*" element={<Navigate to="/health" replace />} />
    </Routes>
  )
}
