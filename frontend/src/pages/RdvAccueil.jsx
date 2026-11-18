// US-30 : « Rendez-vous pour un patient » — l'agent d'accueil retrouve le dossier du patient qui
// téléphone, choisit un praticien et un créneau libre de SA clinique, et réserve. Le rendez-vous est
// signalé « pris par l'accueil » et le patient reçoit sa confirmation (e-mail / SMS).
import { useEffect, useState } from 'react'
import { api } from '../api.js'
import AppLayout from '../components/AppLayout.jsx'
import Alert from '../components/Alert.jsx'

const TZ = 'Africa/Tunis'
const aujourdhui = () => new Date().toLocaleDateString('sv-SE', { timeZone: TZ })
const ajouterJours = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const jourIso = (iso) => new Date(iso).toLocaleDateString('sv-SE', { timeZone: TZ })
const libelleJour = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('fr-FR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' })
const heure = (iso) => new Date(iso).toLocaleTimeString('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })
const fmtNaissance = (d) => (d ? d.split('-').reverse().join('/') : '—')

function Contenu() {
  const [clinique, setClinique] = useState(null)
  const [erreur, setErreur] = useState('')
  const [q, setQ] = useState('')
  const [patients, setPatients] = useState([])
  const [patient, setPatient] = useState(null)
  const [praticiens, setPraticiens] = useState([])
  const [praticien, setPraticien] = useState('')
  const [debut, setDebut] = useState(aujourdhui())
  const [creneaux, setCreneaux] = useState([])
  const [creneau, setCreneau] = useState(null)
  const [motif, setMotif] = useState('')
  const [resultat, setResultat] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api('/accueil/contexte').then((res) => (res.ok ? setClinique(res.data.clinique) : setErreur(res.data?.message || 'Accès impossible')))
    api('/accueil/praticiens').then((res) => res.ok && setPraticiens(res.data))
  }, [])

  useEffect(() => {
    if (q.trim().length < 2) { setPatients([]); return undefined }
    const t = setTimeout(async () => {
      const res = await api(`/accueil/patients?q=${encodeURIComponent(q.trim())}`)
      if (res.ok) setPatients(res.data)
    }, 300)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    setCreneau(null)
    if (!praticien) { setCreneaux([]); return }
    api(`/accueil/creneaux?praticien=${praticien}&debut=${debut}`).then((res) => setCreneaux(res.ok ? res.data : []))
  }, [praticien, debut])

  async function reserver() {
    setBusy(true)
    const res = await api('/accueil/rendez-vous', { method: 'POST', body: { idPatient: patient.id_patient, idCreneau: creneau.id_creneau, motif } })
    setBusy(false)
    setResultat({ type: res.ok ? 'ok' : 'error', text: res.data?.message || 'Réservation impossible' })
    if (res.ok) {
      setCreneau(null); setMotif('')
      const maj = await api(`/accueil/creneaux?praticien=${praticien}&debut=${debut}`)
      setCreneaux(maj.ok ? maj.data : [])
    } else if (res.status === 409) {
      const maj = await api(`/accueil/creneaux?praticien=${praticien}&debut=${debut}`)
      setCreneaux(maj.ok ? maj.data : [])
    }
  }

  if (erreur) return <Alert type="error">{erreur}</Alert>
  if (!clinique) return null
  const jours = Array.from({ length: 7 }, (_, i) => ajouterJours(debut, i)).filter((j) => creneaux.some((c) => jourIso(c.debut) === j))
  const choisi = praticiens.find((p) => p.id_praticien === praticien)

  return (
    <div className="two-cols two-cols-rdv">
      <div className="colonne">
        <section className="card">
          <h2>1. Le patient</h2>
          {patient ? (
            <div className="patient-choisi">
              <div><strong>{patient.prenom} {patient.nom.toUpperCase()}</strong><br />
                <span className="muted">Dossier {patient.numero_dossier} · né(e) le {fmtNaissance(patient.date_naissance)} · {patient.telephone || 'sans téléphone'}</span></div>
              <button className="btn-secondary btn-mini" onClick={() => { setPatient(null); setResultat(null) }}>Changer</button>
            </div>
          ) : (
            <>
              <label htmlFor="q-patient">Nom, numéro de dossier, téléphone ou e-mail</label>
              <input id="q-patient" type="search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="ex. Ben Ali, P-2026-000123, 98 123 456" />
              <ul className="resultats-patients">
                {patients.map((p) => (
                  <li key={p.id_patient}>
                    <button onClick={() => { setPatient(p); setResultat(null) }}>
                      <strong>{p.prenom} {p.nom.toUpperCase()}</strong> · {p.numero_dossier}
                      <span className="muted"> · {fmtNaissance(p.date_naissance)} · {p.telephone || '—'}</span>
                      {p.statut === 'en_attente' && <span className="pill pill-new">compte non activé</span>}
                    </button>
                  </li>
                ))}
              </ul>
              {q.trim().length >= 2 && patients.length === 0 && <p className="muted">Aucun patient trouvé.</p>}
            </>
          )}
        </section>
        <section className="card">
          <h2>2. Le praticien et le créneau</h2>
          <label htmlFor="praticien">Praticien ({clinique.nom})</label>
          <select id="praticien" value={praticien} onChange={(e) => setPraticien(e.target.value)}>
            <option value="">Choisir un praticien</option>
            {praticiens.map((p) => <option key={p.id_praticien} value={p.id_praticien}>Dr {p.prenom} {p.nom} · {p.specialite} ({p.creneaux_libres} créneaux libres)</option>)}
          </select>
          {praticien && (
            <>
              <div className="actions-ligne navigation-jours">
                <button className="btn-secondary" disabled={debut <= aujourdhui()} onClick={() => setDebut(ajouterJours(debut, -7))}>← 7 jours</button>
                <button className="btn-secondary" onClick={() => setDebut(ajouterJours(debut, 7))}>7 jours →</button>
              </div>
              {jours.length === 0 && <p className="muted">Aucun créneau libre sur ces 7 jours.</p>}
              {jours.map((j) => (
                <div key={j}>
                  <p className="jour">{libelleJour(j)}</p>
                  <div className="grille">
                    {creneaux.filter((c) => jourIso(c.debut) === j).map((c) => (
                      <button key={c.id_creneau} className={`creneau ${creneau?.id_creneau === c.id_creneau ? 'choisi' : ''}`} onClick={() => setCreneau(c)}>{heure(c.debut)}</button>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </section>
      </div>
      <section className="card">
        <h2>3. Confirmer</h2>
        <p><strong>Patient :</strong> {patient ? `${patient.prenom} ${patient.nom}` : '—'}</p>
        <p><strong>Praticien :</strong> {choisi ? `Dr ${choisi.prenom} ${choisi.nom}` : '—'}</p>
        <p><strong>Créneau :</strong> {creneau ? `${libelleJour(jourIso(creneau.debut))} à ${heure(creneau.debut)}` : '—'}</p>
        <p><strong>Clinique :</strong> {clinique.nom}</p>
        <label htmlFor="motif">Motif (facultatif, chiffré)</label>
        <input id="motif" maxLength={500} value={motif} onChange={(e) => setMotif(e.target.value)} />
        {resultat && <Alert type={resultat.type}>{resultat.text}</Alert>}
        <button className="btn-primary" disabled={!patient || !creneau || busy} onClick={reserver}>{busy ? 'Réservation…' : 'Réserver pour le patient'}</button>
        <p className="small-note">Le rendez-vous est signalé « pris par l'accueil ». Le patient reçoit la confirmation selon ses préférences et peut l'annuler en ligne.</p>
      </section>
    </div>
  )
}

export default function RdvAccueil() {
  return (
    <AppLayout title="Rendez-vous pour un patient" subtitle="Patient au téléphone : retrouvez son dossier et un créneau libre de votre clinique" roles={['AGENT_ADMIN']}>
      <Contenu />
    </AppLayout>
  )
}
