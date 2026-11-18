// US-15 : « Mon profil » — coordonnées et sécurité (cf. maquette)
// US-12 : préférences de notification (e-mail, SMS, rappel la veille)
// US-04 : consentement à la politique de protection des données
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import AppLayout from '../components/AppLayout.jsx'
import Alert from '../components/Alert.jsx'

const fmtDate = (iso) => new Date(iso).toLocaleDateString('fr-FR', { timeZone: 'Africa/Tunis' })

function Interrupteur({ id, label, checked, onChange }) {
  return (
    <label className="interrupteur" htmlFor={id}>
      <span>{label}</span>
      <input id={id} type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}

function Contenu() {
  const [profil, setProfil] = useState(null)
  const [coord, setCoord] = useState({ email: '', telephone: '', motDePasseActuel: '' })
  const [prefs, setPrefs] = useState(null)
  const [msgCoord, setMsgCoord] = useState(null)
  const [msgPrefs, setMsgPrefs] = useState(null)

  async function charger() {
    const res = await api('/patients/moi')
    if (!res.ok) return
    setProfil(res.data)
    setCoord({ email: res.data.email, telephone: res.data.telephone || '', motDePasseActuel: '' })
    setPrefs(res.data.preferences)
  }
  useEffect(() => { charger() }, [])

  async function enregistrerCoord(e) {
    e.preventDefault()
    const res = await api('/patients/moi/coordonnees', { method: 'PUT', body: coord })
    setMsgCoord({ type: res.ok ? 'ok' : 'error', text: res.data?.message || 'Enregistrement impossible' })
    if (res.ok) charger()
  }

  async function changerPref(cle, valeur) {
    const suivant = { ...prefs, [cle]: valeur }
    const res = await api('/patients/moi/preferences', { method: 'PUT', body: suivant })
    if (res.ok) setPrefs(suivant)
    setMsgPrefs({ type: res.ok ? 'ok' : 'error', text: res.data?.message || 'Enregistrement impossible' })
  }

  async function consentir() {
    const res = await api('/patients/moi/consentement', { method: 'POST' })
    if (res.ok) charger()
  }

  if (!profil) return null
  const emailChange = coord.email.trim().toLowerCase() !== profil.email
  const consentementAJour = profil.consentement && profil.consentement.version === profil.politiqueVersion

  return (
    <div className="two-cols two-cols-profil">
      <form className="card" onSubmit={enregistrerCoord}>
        <h2>Coordonnées</h2>
        <div className="row">
          <div><label htmlFor="email">Adresse e-mail</label>
            <input id="email" type="email" required value={coord.email} onChange={(e) => setCoord({ ...coord, email: e.target.value })} /></div>
          <div><label htmlFor="tel">Téléphone mobile</label>
            <input id="tel" required placeholder="+216 98 000 000" value={coord.telephone} onChange={(e) => setCoord({ ...coord, telephone: e.target.value })} /></div>
        </div>
        {emailChange && (
          <>
            <label htmlFor="mdp">Mot de passe actuel (obligatoire pour changer d'adresse e-mail)</label>
            <input id="mdp" type="password" autoComplete="current-password" required value={coord.motDePasseActuel}
              onChange={(e) => setCoord({ ...coord, motDePasseActuel: e.target.value })} />
            <Alert type="info">Un lien de confirmation sera envoyé à la nouvelle adresse. Vous devrez l'ouvrir avant votre prochaine connexion.</Alert>
          </>
        )}
        <h2 className="sous-titre">Sécurité</h2>
        <Link className="btn-secondary btn-auto btn-link" to="/mot-de-passe-oublie">Changer mon mot de passe</Link>
        {msgCoord && <Alert type={msgCoord.type}>{msgCoord.text}</Alert>}
        <div className="actions"><button className="btn-primary btn-auto">Enregistrer</button></div>
      </form>

      <div className="colonne">
        <section className="card">
          <h2>Notifications</h2>
          <Interrupteur id="p-email" label="Messages par e-mail (confirmations, reports, annulations)" checked={prefs.emailActif} onChange={(v) => changerPref('emailActif', v)} />
          <Interrupteur id="p-sms" label="Messages par SMS" checked={prefs.smsActif} onChange={(v) => changerPref('smsActif', v)} />
          <Interrupteur id="p-rappel" label="Rappel la veille du rendez-vous" checked={prefs.rappelActif} onChange={(v) => changerPref('rappelActif', v)} />
          {msgPrefs && <Alert type={msgPrefs.type}>{msgPrefs.text}</Alert>}
        </section>
        <section className="card">
          <h2>Consentement INPDP</h2>
          {profil.consentement
            ? <p>Politique de protection des données <strong>v{profil.consentement.version}</strong> acceptée le {fmtDate(profil.consentement.date)}.</p>
            : <p>Aucun consentement enregistré.</p>}
          {!consentementAJour && (
            <button className="btn-primary btn-auto" onClick={consentir}>Accepter la politique v{profil.politiqueVersion}</button>
          )}
          <p><Link to="/politique-confidentialite">Lire la politique</Link></p>
        </section>
        <AccesDossier />
      </div>
    </div>
  )
}

// US-47 : qui a consulté mon dossier (journal des accès, en ajout seul)
const ACTIONS = {
  consultation_dossier: 'a consulté votre dossier',
  consultation_document: 'a consulté',
  telechargement_document: 'a téléchargé',
  redaction_compte_rendu: 'a rédigé un compte-rendu',
  publication_document: 'a publié',
}
const fmtDateHeure = (iso) => new Date(iso).toLocaleString('fr-FR', { timeZone: 'Africa/Tunis', dateStyle: 'short', timeStyle: 'short' })

function AccesDossier() {
  const [acces, setAcces] = useState(null)
  useEffect(() => { api('/patients/moi/acces').then((res) => setAcces(res.ok ? res.data : [])) }, [])
  if (!acces) return null
  return (
    <section className="card">
      <h2>Accès à mon dossier</h2>
      {acces.length === 0 && <p className="muted">Aucun accès enregistré pour le moment.</p>}
      <ul className="journal-acces">
        {acces.slice(0, 8).map((a, i) => (
          <li key={i}>
            <strong>{a.auteur}</strong> {ACTIONS[a.action] || a.action}{a.document ? ` « ${a.document} »` : ''}
            <br /><span className="muted">{fmtDateHeure(a.date_acces)}</span>
          </li>
        ))}
      </ul>
      <p className="small-note">Chaque accès à votre dossier médical est enregistré et ne peut pas être effacé.</p>
    </section>
  )
}

export default function MonProfil() {
  return (
    <AppLayout title="Mon profil" subtitle="Coordonnées, préférences de notification et consentement" roles={['PATIENT']}>
      <Contenu />
    </AppLayout>
  )
}
