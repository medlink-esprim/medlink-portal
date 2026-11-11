// US-13 : « Mes résultats et documents » — uniquement les documents du patient connecté (cf. maquette)
import { useEffect, useState } from 'react'
import { api } from '../api.js'
import AppLayout from '../components/AppLayout.jsx'
import Alert from '../components/Alert.jsx'

const TYPES = { resultat: "Résultat d'examen", compte_rendu: 'Compte-rendu', ordonnance: 'Ordonnance', autre: 'Document' }
const ICONES = { resultat: 'PDF', compte_rendu: 'CR', ordonnance: 'PDF', autre: 'PDF' }
const fmtDate = (iso) => new Date(iso).toLocaleDateString('fr-FR', { timeZone: 'Africa/Tunis' })
const recent = (iso) => Date.now() - new Date(iso).getTime() < 7 * 86400000

function Contenu() {
  const [docs, setDocs] = useState(null)
  const [type, setType] = useState('')
  const [annee, setAnnee] = useState('')
  const [erreur, setErreur] = useState('')

  useEffect(() => {
    api('/patients/moi/documents').then((res) => (res.ok ? setDocs(res.data) : setErreur(res.data?.message || 'Chargement impossible')))
  }, [])

  if (!docs) return <Alert type="error">{erreur}</Alert>
  const annees = [...new Set(docs.map((d) => new Date(d.date_publication).getFullYear()))]
  const visibles = docs.filter((d) => (!type || d.type === type) && (!annee || new Date(d.date_publication).getFullYear() === Number(annee)))

  return (
    <div className="two-cols two-cols-resultats">
      <section className="card">
        <h2>Documents disponibles</h2>
        {visibles.length === 0 && <p className="muted">Aucun document pour le moment. Vos résultats apparaîtront ici dès leur publication par votre praticien.</p>}
        <ul className="documents">
          {visibles.map((d) => (
            <li key={d.id_document}>
              <span className="doc-icone">{ICONES[d.type]}</span>
              <span className="doc-texte">
                <strong>{d.titre}</strong>{recent(d.date_publication) && <span className="pill pill-new">Nouveau</span>}
                <br /><span className="muted">{TYPES[d.type]} · publié le {fmtDate(d.date_publication)}</span>
              </span>
              <span className="actions-ligne">
                {/* ===== ACTIONS SUR UN DOCUMENT ===== */}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <div className="colonne">
        <section className="card">
          <h2>Filtrer</h2>
          <label htmlFor="type">Type</label>
          <select id="type" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Tous les documents</option>
            {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <label htmlFor="annee">Année</label>
          <select id="annee" value={annee} onChange={(e) => setAnnee(e.target.value)}>
            <option value="">Toutes</option>
            {annees.map((a) => <option key={a}>{a}</option>)}
          </select>
        </section>
        <Alert type="info">Les documents sont stockés chiffrés (AES-256) et transmis uniquement par connexion sécurisée.</Alert>
      </div>
    </div>
  )
}

export default function MesResultats() {
  return (
    <AppLayout title="Mes résultats et documents" subtitle="Seuls vos propres documents sont visibles · chaque téléchargement est tracé" roles={['PATIENT']}>
      <Contenu />
    </AppLayout>
  )
}
