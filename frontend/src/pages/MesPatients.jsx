// US-22 : « Mes patients » — le praticien retrouve un de SES patients par nom ou numéro de dossier.
// Seuls les patients ayant (eu) un rendez-vous avec lui sont renvoyés par l'API.
import { useEffect, useState } from 'react'
import { api } from '../api.js'
import AppLayout from '../components/AppLayout.jsx'
import Alert from '../components/Alert.jsx'

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { timeZone: 'Africa/Tunis' }) : '—')
const fmtNaissance = (d) => (d ? d.split('-').reverse().join('/') : '—')

function Contenu() {
  const [q, setQ] = useState('')
  const [patients, setPatients] = useState(null)
  const [erreur, setErreur] = useState('')

  // recherche lancée 300 ms après la dernière frappe
  useEffect(() => {
    const t = setTimeout(async () => {
      const res = await api(`/praticien/patients?q=${encodeURIComponent(q.trim())}`)
      if (res.ok) { setPatients(res.data); setErreur('') } else setErreur(res.data?.message || 'Recherche impossible')
    }, 300)
    return () => clearTimeout(t)
  }, [q])

  return (
    <section className="card">
      <label htmlFor="recherche">Rechercher un patient</label>
      <input id="recherche" type="search" autoFocus placeholder="Nom, prénom ou numéro de dossier (ex. P-2026-000123)"
        value={q} onChange={(e) => setQ(e.target.value)} />
      {erreur && <Alert type="error">{erreur}</Alert>}
      {patients && patients.length === 0 && (
        <p className="muted">{q ? 'Aucun de vos patients ne correspond à cette recherche.' : "Vous n'avez encore reçu aucun patient."}</p>
      )}
      {patients && patients.length > 0 && (
        <table className="table">
          <thead>
            <tr><th>Patient</th><th>N° de dossier</th><th>Naissance</th><th>Dernier RDV</th><th>Prochain RDV</th>
              {/* ===== COLONNE ACTIONS ===== */}</tr>
          </thead>
          <tbody>
            {patients.map((p) => (
              <tr key={p.id_patient}>
                <td><strong>{p.nom.toUpperCase()}</strong> {p.prenom}</td>
                <td>{p.numero_dossier}</td>
                <td>{fmtNaissance(p.date_naissance)}</td>
                <td>{fmtDate(p.dernier_rdv)}</td>
                <td>{p.prochain_rdv ? <span className="pill pill-ok">{fmtDate(p.prochain_rdv)}</span> : '—'}</td>
                {/* ===== ACTIONS SUR UN PATIENT ===== */}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="small-note">Seuls les patients que vous avez reçus ou qui ont un rendez-vous avec vous apparaissent.</p>
    </section>
  )
}

export default function MesPatients() {
  return (
    <AppLayout title="Mes patients" subtitle="Recherche par nom ou par numéro de dossier" roles={['PRATICIEN']}>
      <Contenu />
    </AppLayout>
  )
}
