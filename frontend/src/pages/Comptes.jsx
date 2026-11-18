// US-28 : « Comptes » — rechercher, modifier ou désactiver un compte (back-office).
// La désactivation empêche toute connexion et ferme les sessions ouvertes ; l'historique est conservé.
// US-29 : affectation d'un praticien à une ou plusieurs cliniques (il ne publie que là où il est affecté).
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import AppLayout from '../components/AppLayout.jsx'
import Alert from '../components/Alert.jsx'

const ROLES = { PATIENT: 'Patient', PRATICIEN: 'Praticien', AGENT_ADMIN: 'Agent administratif', ADMIN: 'Administrateur', DIRECTION: 'Direction' }
const STATUTS = { actif: ['Actif', 'pill-ok'], en_attente: ['En attente', 'pill-new'], desactive: ['Désactivé', 'pill-ko'] }
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { timeZone: 'Africa/Tunis' }) : '—')

function Statut({ statut }) {
  const [libelle, classe] = STATUTS[statut] || [statut, '']
  return <span className={`pill ${classe}`}>{libelle}</span>
}

function AffectationCliniques({ idPraticien }) {
  const [liste, setListe] = useState(null)
  const [choix, setChoix] = useState([])
  const [message, setMessage] = useState(null)

  const charger = useCallback(async () => {
    const res = await api(`/comptes/${idPraticien}/cliniques`)
    if (res.ok) { setListe(res.data); setChoix(res.data.filter((c) => c.affecte).map((c) => c.id_clinique)) }
  }, [idPraticien])
  useEffect(() => { charger() }, [charger])

  if (!liste) return null
  const basculer = (id) => setChoix(choix.includes(id) ? choix.filter((x) => x !== id) : [...choix, id])

  async function enregistrer() {
    const res = await api(`/comptes/${idPraticien}/cliniques`, { method: 'PUT', body: { cliniques: choix } })
    setMessage({ type: res.ok ? 'ok' : 'error', text: res.data?.message || 'Enregistrement impossible' })
    if (res.ok) charger()
  }

  return (
    <div className="affectations">
      <h3 className="sous-titre">Cliniques d'exercice</h3>
      {liste.map((c) => (
        <label key={c.id_clinique} className="case">
          <input type="checkbox" checked={choix.includes(c.id_clinique)} onChange={() => basculer(c.id_clinique)} />
          {c.nom}{c.rdv_a_venir > 0 && <span className="muted"> · {c.rdv_a_venir} rendez-vous à venir</span>}
        </label>
      ))}
      {message && <Alert type={message.type}>{message.text}</Alert>}
      <button className="btn-navy btn-auto" disabled={choix.length === 0} onClick={enregistrer}>Enregistrer les affectations</button>
      <p className="small-note">Le praticien publie ses disponibilités dans ces cliniques. Une clinique ne peut être retirée qu'une fois ses rendez-vous à venir reportés ou annulés.</p>
    </div>
  )
}

function Detail({ id, cliniques, onChange }) {
  const [compte, setCompte] = useState(null)
  const [form, setForm] = useState(null)
  const [message, setMessage] = useState(null)
  const [confirmer, setConfirmer] = useState(false)

  const charger = useCallback(async () => {
    const res = await api(`/comptes/${id}`)
    if (!res.ok) return setMessage({ type: 'error', text: res.data?.message || 'Compte introuvable' })
    const c = res.data
    setCompte(c)
    setForm({
      nom: c.nom, prenom: c.prenom, telephone: c.telephone || '',
      ...(c.role === 'PRATICIEN' ? { specialite: c.specialite || '', numeroOrdre: c.numero_ordre || '' } : {}),
      ...(c.role === 'AGENT_ADMIN' ? { fonction: c.fonction || '', idClinique: c.id_clinique || '' } : {}),
    })
    setConfirmer(false)
  }, [id])
  useEffect(() => { setMessage(null); charger() }, [charger])

  if (!compte || !form) return message ? <Alert type={message.type}>{message.text}</Alert> : null
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  async function enregistrer(e) {
    e.preventDefault()
    const body = { ...form }
    if (body.idClinique === '') delete body.idClinique
    if (body.specialite === '') delete body.specialite
    const res = await api(`/comptes/${id}`, { method: 'PUT', body })
    setMessage({ type: res.ok ? 'ok' : 'error', text: res.data?.message || 'Modification impossible' })
    if (res.ok) { charger(); onChange() }
  }

  async function changerStatut(statut) {
    const res = await api(`/comptes/${id}/statut`, { method: 'PATCH', body: { statut } })
    setMessage({ type: res.ok ? 'ok' : 'error', text: res.data?.message || 'Opération impossible' })
    setConfirmer(false)
    if (res.ok) { charger(); onChange() }
  }

  return (
    <section className="card">
      <h2>{compte.prenom} {compte.nom}</h2>
      <p className="muted">{ROLES[compte.role]} · {compte.email} · créé le {fmtDate(compte.date_creation)}</p>
      <p><Statut statut={compte.statut} />{compte.date_desactivation && <span className="muted"> depuis le {fmtDate(compte.date_desactivation)}</span>}
        {compte.numero_dossier && <span className="muted"> · dossier {compte.numero_dossier}</span>}</p>
      <form onSubmit={enregistrer}>
        <div className="row">
          <div><label htmlFor="c-prenom">Prénom</label><input id="c-prenom" required maxLength={80} value={form.prenom} onChange={set('prenom')} /></div>
          <div><label htmlFor="c-nom">Nom</label><input id="c-nom" required maxLength={80} value={form.nom} onChange={set('nom')} /></div>
        </div>
        <label htmlFor="c-tel">Téléphone</label>
        <input id="c-tel" placeholder="+216 98 000 000" value={form.telephone} onChange={set('telephone')} />
        {compte.role === 'PRATICIEN' && (
          <div className="row">
            <div><label htmlFor="c-spec">Spécialité</label><input id="c-spec" maxLength={60} value={form.specialite} onChange={set('specialite')} /></div>
            <div><label htmlFor="c-ordre">N° d'ordre</label><input id="c-ordre" maxLength={20} value={form.numeroOrdre} onChange={set('numeroOrdre')} /></div>
          </div>
        )}
        {compte.role === 'AGENT_ADMIN' && (
          <div className="row">
            <div><label htmlFor="c-fonction">Fonction</label><input id="c-fonction" maxLength={60} value={form.fonction} onChange={set('fonction')} /></div>
            <div><label htmlFor="c-clinique">Clinique</label>
              <select id="c-clinique" value={form.idClinique} onChange={set('idClinique')}>
                {cliniques.map((c) => <option key={c.id_clinique} value={c.id_clinique}>{c.ville}</option>)}
              </select></div>
          </div>
        )}
        <div className="actions"><button className="btn-primary btn-auto">Enregistrer les modifications</button></div>
      </form>
      {compte.role === 'PRATICIEN' && <AffectationCliniques idPraticien={compte.id_utilisateur} />}
      {message && <Alert type={message.type}>{message.text}</Alert>}
      <h3 className="sous-titre">Accès au portail</h3>
      {compte.statut === 'desactive'
        ? <button className="btn-secondary btn-auto" onClick={() => changerStatut('actif')}>Réactiver le compte</button>
        : !confirmer
          ? <button className="btn-danger btn-auto" onClick={() => setConfirmer(true)}>Désactiver le compte</button>
          : (
            <div className="confirmation">
              <p>Désactiver ce compte ? La personne ne pourra plus se connecter et ses sessions ouvertes seront fermées. Son historique (rendez-vous, dossiers, journal) est conservé.
                {compte.rdv_a_venir > 0 && <strong> Attention : {compte.rdv_a_venir} rendez-vous à venir doivent d'abord être annulés ou reportés.</strong>}</p>
              <div className="actions-ligne">
                <button className="btn-secondary" onClick={() => setConfirmer(false)}>Annuler</button>
                <button className="btn-danger" onClick={() => changerStatut('desactive')}>Confirmer la désactivation</button>
              </div>
            </div>
          )}
    </section>
  )
}

function Contenu() {
  const [filtres, setFiltres] = useState({ q: '', role: '', statut: '' })
  const [comptes, setComptes] = useState([])
  const [cliniques, setCliniques] = useState([])
  const [choisi, setChoisi] = useState(null)
  const [version, setVersion] = useState(0)

  useEffect(() => { api('/comptes/cliniques').then((res) => res.ok && setCliniques(res.data)) }, [])
  useEffect(() => {
    const t = setTimeout(async () => {
      const q = new URLSearchParams(Object.entries(filtres).filter(([, v]) => v))
      const res = await api(`/comptes/recherche?${q}`)
      if (res.ok) setComptes(res.data)
    }, 300)
    return () => clearTimeout(t)
  }, [filtres, version])
  const set = (k) => (e) => setFiltres({ ...filtres, [k]: e.target.value })

  return (
    <div className="two-cols two-cols-comptes">
      <section className="card">
        <div className="filtres-comptes">
          <input type="search" aria-label="Rechercher" placeholder="Nom, e-mail ou numéro de dossier" value={filtres.q} onChange={set('q')} />
          <select aria-label="Rôle" value={filtres.role} onChange={set('role')}>
            <option value="">Tous les rôles</option>
            {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select aria-label="Statut" value={filtres.statut} onChange={set('statut')}>
            <option value="">Tous les statuts</option>
            {Object.entries(STATUTS).map(([k, [v]]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <table className="table table-cliquable">
          <thead><tr><th>Nom</th><th>Rôle</th><th>Statut</th><th>Créé le</th></tr></thead>
          <tbody>
            {comptes.map((c) => (
              <tr key={c.id_utilisateur} className={choisi === c.id_utilisateur ? 'choisi' : ''} onClick={() => setChoisi(c.id_utilisateur)}>
                <td><strong>{c.prenom} {c.nom}</strong><br /><span className="muted">{c.email}</span></td>
                <td>{ROLES[c.role]}{c.specialite ? ` · ${c.specialite}` : ''}{c.clinique ? ` · ${c.clinique}` : ''}</td>
                <td><Statut statut={c.statut} /></td>
                <td>{fmtDate(c.date_creation)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {comptes.length === 0 && <p className="muted">Aucun compte ne correspond à ces critères.</p>}
        <p className="small-note">50 résultats au maximum : précisez la recherche si besoin. <Link to="/back-office/comptes/nouveau">Créer un compte praticien ou agent</Link></p>
      </section>
      <div className="colonne">
        {choisi
          ? <Detail key={choisi} id={choisi} cliniques={cliniques} onChange={() => setVersion((v) => v + 1)} />
          : <section className="card"><p className="muted">Sélectionnez un compte pour le modifier ou le désactiver.</p></section>}
      </div>
    </div>
  )
}

export default function Comptes() {
  return (
    <AppLayout title="Comptes utilisateurs" subtitle="Modifier ou désactiver un compte · l'historique est toujours conservé" roles={['AGENT_ADMIN', 'ADMIN']}>
      <Contenu />
    </AppLayout>
  )
}
