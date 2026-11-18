// US-23 : dossier du patient reçu en consultation (identité, rendez-vous avec moi, documents).
// L'API refuse (403 journalisé) tout patient sans rendez-vous avec le praticien ; chaque ouverture
// du dossier et chaque document consulté sont enregistrés dans le journal des accès (US-47).
import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api.js'
import AppLayout from '../components/AppLayout.jsx'
import Alert from '../components/Alert.jsx'

const TYPES = { resultat: "Résultat d'examen", compte_rendu: 'Compte-rendu', ordonnance: 'Ordonnance', autre: 'Document' }
const STATUTS = {
  planifie: ['Planifié', 'pill-ok'], honore: ['Honoré', 'pill-ok'], manque: ['Manqué', 'pill-ko'],
  annule: ['Annulé', 'pill-ko'], reporte: ['Reporté', 'pill-new'],
}
const fmtDate = (iso) => new Date(iso).toLocaleDateString('fr-FR', { timeZone: 'Africa/Tunis' })
const fmtDateHeure = (iso) => new Date(iso).toLocaleString('fr-FR', { timeZone: 'Africa/Tunis', dateStyle: 'medium', timeStyle: 'short' })
const fmtNaissance = (d) => (d ? d.split('-').reverse().join('/') : '—')
const SEXES = { M: 'Homme', F: 'Femme' }

function Contenu() {
  const { id } = useParams()
  const [dossier, setDossier] = useState(null)
  const [erreur, setErreur] = useState('')

  const charger = useCallback(async () => {
    const res = await api(`/praticien/patients/${id}/dossier`)
    if (res.ok) setDossier(res.data)
    else setErreur(res.status === 403 ? "Ce patient n'a pas de rendez-vous avec vous : son dossier ne vous est pas accessible." : res.data?.message || 'Dossier introuvable')
  }, [id])
  useEffect(() => { charger() }, [charger])

  async function ouvrir(idDoc, inline) {
    const me = await api('/auth/me')
    if (!me.ok) return setErreur('Session expirée, reconnectez-vous.')
    const url = `/api/documents/${idDoc}/fichier${inline ? '?inline=1' : ''}`
    if (inline) return window.open(url, '_blank', 'noopener')
    const a = document.createElement('a')
    a.href = url
    a.download = ''
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  if (!dossier) return erreur ? <><Alert type="error">{erreur}</Alert><Link to="/praticien/patients">← Mes patients</Link></> : null
  const { patient, rendezVous, documents } = dossier

  return (
    <>
      <p><Link to="/praticien/patients">← Mes patients</Link></p>
      <div className="two-cols two-cols-dossier">
        <div className="colonne">
          <section className="card">
            <h2>Rendez-vous avec vous</h2>
            <table className="table">
              <thead><tr><th>Date</th><th>Clinique</th><th>Motif</th><th>Statut</th></tr></thead>
              <tbody>
                {rendezVous.map((r) => {
                  const [libelle, classe] = STATUTS[r.statut] || [r.statut, '']
                  return (
                    <tr key={r.id_rdv}>
                      <td>{fmtDateHeure(r.debut)}</td>
                      <td>{r.ville}</td>
                      <td>{r.motif || <span className="muted">—</span>}</td>
                      <td><span className={`pill ${classe}`}>{libelle}</span>
                        {r.origine === 'accueil' && <span className="pill pill-new">Pris par l'accueil</span>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {/* ===== COMPTES-RENDUS ===== */}
          </section>
          <section className="card">
            <h2>Documents du dossier</h2>
            {documents.length === 0 && <p className="muted">Aucun document dans ce dossier.</p>}
            <ul className="documents">
              {documents.map((d) => (
                <li key={d.id_document}>
                  <span className="doc-icone">{d.type === 'compte_rendu' ? 'CR' : 'PDF'}</span>
                  <span className="doc-texte">
                    <strong>{d.titre}</strong>
                    <br /><span className="muted">{TYPES[d.type]} · {fmtDate(d.date_publication)}{d.auteur ? ` · Dr ${d.auteur}` : ''}</span>
                  </span>
                  <span className="actions-ligne">
                    <button className="btn-secondary" onClick={() => ouvrir(d.id_document, true)}>Consulter</button>
                    <button className="btn-navy" onClick={() => ouvrir(d.id_document, false)}>Télécharger</button>
                  </span>
                </li>
              ))}
            </ul>
          </section>
          {/* ===== PUBLICATION D'UN DOCUMENT ===== */}
        </div>
        <div className="colonne">
          <section className="card">
            <h2>{patient.prenom} {patient.nom.toUpperCase()}</h2>
            <dl className="identite">
              <dt>N° de dossier</dt><dd>{patient.numero_dossier}</dd>
              <dt>Naissance</dt><dd>{fmtNaissance(patient.date_naissance)}</dd>
              <dt>Sexe</dt><dd>{SEXES[patient.sexe] || '—'}</dd>
              <dt>Téléphone</dt><dd>{patient.telephone || '—'}</dd>
              <dt>E-mail</dt><dd>{patient.email}</dd>
            </dl>
          </section>
          <Alert type="info">Votre accès à ce dossier est enregistré dans le journal des accès (date, heure, praticien), consultable par le patient.</Alert>
        </div>
      </div>
    </>
  )
}

export default function DossierPatient() {
  return (
    <AppLayout title="Dossier patient" subtitle="Accès réservé aux praticiens qui suivent ce patient · accès tracé" roles={['PRATICIEN']}>
      <Contenu />
    </AppLayout>
  )
}
