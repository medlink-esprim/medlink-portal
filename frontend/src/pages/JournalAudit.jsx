// US-35 : journal d'audit — qui a consulté quel dossier, quelle action, quand (journal en ajout seul, US-47).
import { useEffect, useState } from 'react'
import { api } from '../api.js'
import AppLayout from '../components/AppLayout.jsx'
import Alert from '../components/Alert.jsx'

const ACTIONS = {
  consultation_dossier: 'Consultation du dossier', consultation_document: 'Consultation d\'un document',
  telechargement_document: 'Téléchargement', redaction_compte_rendu: 'Rédaction d\'un compte-rendu', publication_document: 'Publication d\'un document',
}
const ROLES = { PATIENT: 'Patient', PRATICIEN: 'Praticien', AGENT_ADMIN: 'Agent', ADMIN: 'Admin', DIRECTION: 'Direction' }
const fmt = (iso) => new Date(iso).toLocaleString('fr-FR', { timeZone: 'Africa/Tunis', dateStyle: 'short', timeStyle: 'medium' })
const VIDE = { utilisateur: '', patient: '', action: '', du: '', au: '' }

function Journal() {
  const [filtres, setFiltres] = useState(VIDE)
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [erreur, setErreur] = useState('')
  const requete = new URLSearchParams(Object.entries(filtres).filter(([, v]) => v))

  useEffect(() => {
    const t = setTimeout(async () => {
      const q = new URLSearchParams(Object.entries(filtres).filter(([, v]) => v)); q.set('page', page)
      const res = await api(`/admin/audit?${q}`)
      if (res.ok) { setData(res.data); setErreur('') } else setErreur(res.data?.message || 'Journal indisponible')
    }, 300)
    return () => clearTimeout(t)
  }, [filtres, page])
  const set = (k) => (e) => { setPage(1); setFiltres({ ...filtres, [k]: e.target.value }) }
  const pages = data ? Math.max(1, Math.ceil(data.total / data.parPage)) : 1

  return (
    <section className="card">
      <div className="filtres-audit">
        <input type="search" aria-label="Utilisateur" placeholder="Utilisateur (nom, e-mail)" value={filtres.utilisateur} onChange={set('utilisateur')} />
        <input type="search" aria-label="Patient" placeholder="Patient (nom, n° de dossier)" value={filtres.patient} onChange={set('patient')} />
        <select aria-label="Action" value={filtres.action} onChange={set('action')}>
          <option value="">Toutes les actions</option>
          {Object.entries(ACTIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input type="date" aria-label="Du" value={filtres.du} onChange={set('du')} />
        <input type="date" aria-label="Au" value={filtres.au} onChange={set('au')} />
      </div>
      {erreur && <Alert type="error">{erreur}</Alert>}
      {data && (
        <>
          <p className="muted">{data.total} accès · <a href={`/api/admin/audit/export.csv?${requete}`}>Exporter en CSV</a></p>
          <table className="table">
            <thead><tr><th>Date et heure</th><th>Utilisateur</th><th>Dossier</th><th>Action</th><th>Adresse IP</th></tr></thead>
            <tbody>
              {data.lignes.map((l) => (
                <tr key={l.id_acces}>
                  <td>{fmt(l.date_acces)}</td>
                  <td><strong>{l.utilisateur_prenom} {l.utilisateur_nom}</strong><br /><span className="muted">{ROLES[l.role] || l.role}</span></td>
                  <td>{l.patient_prenom} {l.patient_nom}<br /><span className="muted">{l.numero_dossier}</span></td>
                  <td>{ACTIONS[l.action] || l.action}{l.document && <><br /><span className="muted">« {l.document} »</span></>}</td>
                  <td className="muted">{l.adresse_ip || '—'}</td>
                </tr>
              ))}
              {data.lignes.length === 0 && <tr><td colSpan="5" className="muted">Aucun accès ne correspond à ces critères.</td></tr>}
            </tbody>
          </table>
          <div className="actions-ligne">
            <button className="btn-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Plus récents</button>
            <span className="muted">Page {page} / {pages}</span>
            <button className="btn-secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>Plus anciens →</button>
          </div>
        </>
      )}
      <p className="small-note">Le journal est en ajout seul : aucune ligne ne peut être modifiée ni supprimée. Chaque consultation de ce journal est elle-même tracée.</p>
    </section>
  )
}

export default function JournalAudit() {
  return (
    <AppLayout title="Journal d'audit" subtitle="Qui a consulté quel dossier, et quand" roles={['ADMIN']}>
      {/* ===== ALERTES DE SÉCURITÉ ===== */}
      <Journal />
    </AppLayout>
  )
}
