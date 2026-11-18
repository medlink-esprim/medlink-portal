// US-23 : dossier du patient reçu en consultation (identité, rendez-vous avec moi, documents).
// L'API refuse (403 journalisé) tout patient sans rendez-vous avec le praticien ; chaque ouverture
// du dossier et chaque document consulté sont enregistrés dans le journal des accès (US-47).
// US-24 : rédaction du compte-rendu d'une consultation commencée (une fois par rendez-vous).
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
  const [lecture, setLecture] = useState(null)        // rendez-vous dont on lit le compte-rendu
  const [redaction, setRedaction] = useState(null)    // rendez-vous dont on rédige le compte-rendu
  const [texte, setTexte] = useState('')
  const [visible, setVisible] = useState(true)
  const [message, setMessage] = useState(null)
  const [busy, setBusy] = useState(false)

  const charger = useCallback(async () => {
    const res = await api(`/praticien/patients/${id}/dossier`)
    if (res.ok) setDossier(res.data)
    else setErreur(res.status === 403 ? "Ce patient n'a pas de rendez-vous avec vous : son dossier ne vous est pas accessible." : res.data?.message || 'Dossier introuvable')
  }, [id])
  useEffect(() => { charger() }, [charger])

  function rediger(r) {
    setLecture(null); setRedaction(r); setTexte(''); setVisible(true); setMessage(null)
  }

  async function enregistrerCompteRendu(e) {
    e.preventDefault()
    setBusy(true)
    const res = await api(`/praticien/rendez-vous/${redaction.id_rdv}/compte-rendu`, { method: 'POST', body: { contenu: texte, visiblePatient: visible } })
    setBusy(false)
    setMessage({ type: res.ok ? 'ok' : 'error', text: res.data?.message || 'Enregistrement impossible' })
    if (res.ok) { setRedaction(null); charger() }
  }

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
              <thead><tr><th>Date</th><th>Clinique</th><th>Motif</th><th>Statut</th><th>Compte-rendu</th></tr></thead>
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
                      <td>
                        {r.compteRendu && <button className="btn-secondary btn-mini" onClick={() => { setRedaction(null); setLecture(lecture?.id_rdv === r.id_rdv ? null : r) }}>Lire</button>}
                        {r.redigeable && <button className="btn-primary btn-mini" onClick={() => rediger(r)}>Rédiger</button>}
                        {!r.compteRendu && !r.redigeable && <span className="muted">—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {message && <Alert type={message.type}>{message.text}</Alert>}
            {lecture && (
              <div className="compte-rendu">
                <h3>Compte-rendu du {fmtDateHeure(lecture.debut)}</h3>
                <p className="muted">Rédigé le {fmtDateHeure(lecture.compteRendu.date)} · {lecture.compteRendu.visiblePatient ? 'visible du patient (PDF dans son dossier)' : 'non visible du patient'}</p>
                <div className="texte-compte-rendu">{lecture.compteRendu.contenu}</div>
              </div>
            )}
            {redaction && (
              <form className="compte-rendu" onSubmit={enregistrerCompteRendu}>
                <h3>Compte-rendu de la consultation du {fmtDateHeure(redaction.debut)}</h3>
                <label htmlFor="texte-cr">Observations, diagnostic, conduite à tenir</label>
                <textarea id="texte-cr" rows={9} required minLength={10} maxLength={8000} value={texte} onChange={(e) => setTexte(e.target.value)} />
                <label className="case"><input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} />
                  Visible du patient (publié en PDF dans « Mes résultats »)</label>
                <div className="actions">
                  <button type="button" className="btn-secondary btn-auto" onClick={() => setRedaction(null)}>Annuler</button>
                  <button className="btn-primary btn-auto" disabled={busy || texte.trim().length < 10}>{busy ? 'Enregistrement…' : 'Valider le compte-rendu'}</button>
                </div>
                <p className="small-note">Le compte-rendu est chiffré en base et ne peut plus être modifié après validation.</p>
              </form>
            )}
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
