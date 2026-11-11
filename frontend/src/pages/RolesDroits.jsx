// US-33 : « Rôles et droits » — matrice permissions x rôles (cf. maquette)
import { useEffect, useState } from 'react'
import { api } from '../api.js'
import AppLayout from '../components/AppLayout.jsx'
import Alert from '../components/Alert.jsx'

const VERROU = ['ADMIN', 'ROLES_GERER']   // l'administrateur garde toujours la gestion des droits

function Contenu() {
  const [donnees, setDonnees] = useState(null)
  const [matrice, setMatrice] = useState({})
  const [message, setMessage] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api('/admin/roles').then((res) => {
      if (!res.ok) return setMessage({ type: 'error', text: res.data?.message || 'Accès refusé' })
      setDonnees(res.data)
      setMatrice(res.data.matrice)
    })
  }, [])

  const coche = (role, perm) => (matrice[role] || []).includes(perm)
  function basculer(role, perm) {
    const liste = matrice[role] || []
    setMatrice({ ...matrice, [role]: coche(role, perm) ? liste.filter((p) => p !== perm) : [...liste, perm] })
    setMessage(null)
  }

  async function enregistrer() {
    setBusy(true)
    const res = await api('/admin/roles', { method: 'PUT', body: { matrice } })
    setBusy(false)
    if (!res.ok) return setMessage({ type: 'error', text: res.data?.message || 'Enregistrement impossible' })
    setMatrice(res.data.matrice)
    const n = res.data.changements.length
    setMessage({ type: 'ok', text: n ? `${n} rôle(s) modifié(s). Effet à la prochaine connexion des utilisateurs concernés.` : 'Aucune modification.' })
  }

  if (!donnees) return <Alert type={message?.type}>{message?.text}</Alert>
  return (
    <section className="card">
      <table className="table matrice">
        <thead>
          <tr><th>Permission</th>{donnees.roles.map((r) => <th key={r.code}>{r.libelle}</th>)}</tr>
        </thead>
        <tbody>
          {donnees.permissions.map((p) => (
            <tr key={p.code}>
              <td>{p.description}</td>
              {donnees.roles.map((r) => (
                <td key={r.code} className="center">
                  <input
                    type="checkbox"
                    aria-label={`${p.description} — ${r.libelle}`}
                    checked={coche(r.code, p.code)}
                    disabled={r.code === VERROU[0] && p.code === VERROU[1]}
                    onChange={() => basculer(r.code, p.code)}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {message && <Alert type={message.type}>{message.text}</Alert>}
      <div className="actions">
        <button className="btn-primary btn-auto" disabled={busy} onClick={enregistrer}>Enregistrer les modifications</button>
        <span className="muted small-note">Aucun rôle d'administration n'a accès aux données médicales nominatives.</span>
      </div>
    </section>
  )
}

export default function RolesDroits() {
  return (
    <AppLayout title="Rôles et droits" subtitle="Principe du moindre privilège · les modifications s'appliquent aux prochaines connexions">
      <Contenu />
    </AppLayout>
  )
}
