// US-05 / US-06 : « Prendre rendez-vous » — recherche d'un praticien puis d'un créneau libre (cf. maquette)
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api.js'
import AppLayout from '../components/AppLayout.jsx'
import Alert from '../components/Alert.jsx'

const TZ = 'Africa/Tunis'
const fmtJour = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' })
const fmtHeure = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })
const cleJour = new Intl.DateTimeFormat('en-CA', { timeZone: TZ })   // AAAA-MM-JJ dans le fuseau tunisien

const aujourdhui = () => cleJour.format(new Date())
const plusJours = (iso, n) => new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10)
const initiales = (p) => `${p.prenom[0] || ''}${p.nom[0] || ''}`.toUpperCase()

function grouperParJour(creneaux) {
  const jours = new Map()
  for (const c of creneaux) {
    const k = cleJour.format(new Date(c.debut))
    if (!jours.has(k)) jours.set(k, [])
    jours.get(k).push(c)
  }
  return [...jours.entries()]
}

function Contenu() {
  const navigate = useNavigate()
  const [filtres, setFiltres] = useState({ specialites: [], cliniques: [] })
  const [specialite, setSpecialite] = useState('')
  const [clinique, setClinique] = useState('')
  const [semaine, setSemaine] = useState(aujourdhui())
  const [praticiens, setPraticiens] = useState(null)
  const [choisi, setChoisi] = useState(null)
  const [creneaux, setCreneaux] = useState([])
  const [selection, setSelection] = useState(null)
  const [erreur, setErreur] = useState('')

  useEffect(() => {
    api('/praticiens/filtres').then((res) => res.ok && setFiltres(res.data))
  }, [])

  async function chargerCreneaux(p, debut = semaine) {
    setChoisi(p); setSelection(null)
    const q = new URLSearchParams({ praticien: p.id_praticien, debut, fin: plusJours(debut, 6) })
    if (clinique) q.set('clinique', clinique)
    const res = await api(`/creneaux?${q}`)
    setCreneaux(res.ok ? res.data : [])
  }

  async function rechercher(e) {
    e?.preventDefault()
    setErreur('')
    const q = new URLSearchParams()
    if (specialite) q.set('specialite', specialite)
    if (clinique) q.set('clinique', clinique)
    const res = await api(`/praticiens?${q}`)
    if (!res.ok) return setErreur(res.data?.message || 'Recherche impossible')
    setPraticiens(res.data)
    if (res.data[0]) chargerCreneaux(res.data[0])
    else { setChoisi(null); setCreneaux([]) }
  }

  function semaineSuivante() {
    const s = plusJours(semaine, 7)
    setSemaine(s)
    if (choisi) chargerCreneaux(choisi, s)
  }

  const nomClinique = filtres.cliniques.find((c) => c.id_clinique === clinique)?.nom
  return (
    <>
      <form className="card filtres" onSubmit={rechercher}>
        <div><label htmlFor="specialite">Spécialité</label>
          <select id="specialite" value={specialite} onChange={(e) => setSpecialite(e.target.value)}>
            <option value="">Toutes</option>
            {filtres.specialites.map((s) => <option key={s}>{s}</option>)}
          </select></div>
        <div><label htmlFor="clinique">Clinique</label>
          <select id="clinique" value={clinique} onChange={(e) => setClinique(e.target.value)}>
            <option value="">Toutes</option>
            {filtres.cliniques.map((c) => <option key={c.id_clinique} value={c.id_clinique}>{c.nom}</option>)}
          </select></div>
        <div><label htmlFor="semaine">Semaine du</label>
          <input id="semaine" type="date" min={aujourdhui()} value={semaine} onChange={(e) => setSemaine(e.target.value)} /></div>
        <button className="btn-navy">Rechercher</button>
      </form>
      <Alert type="error">{erreur}</Alert>

      {praticiens && (
        <div className="two-cols two-cols-rdv">
          <section className="card">
            <h2>{praticiens.length} praticien{praticiens.length > 1 ? 's' : ''} disponible{praticiens.length > 1 ? 's' : ''}</h2>
            {praticiens.length === 0 && <p className="muted">Aucun praticien ne correspond : changez de spécialité ou de clinique.</p>}
            <ul className="praticiens">
              {praticiens.map((p) => (
                <li key={p.id_praticien}>
                  <button type="button" className={choisi?.id_praticien === p.id_praticien ? 'actif' : ''} onClick={() => chargerCreneaux(p)}>
                    <span className="avatar">{initiales(p)}</span>
                    <span><strong>Dr {p.prenom} {p.nom}</strong><br /><span className="muted">{p.specialite} · {p.villes}</span></span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          {choisi && (
            <section className="card">
              <h2>Créneaux libres — Dr {choisi.prenom} {choisi.nom}{nomClinique ? ` · ${nomClinique}` : ''}</h2>
              {creneaux.length === 0 && (
                <Alert type="info">
                  Aucun créneau libre cette semaine. Essayez la semaine suivante ou une autre clinique.{' '}
                  <button type="button" className="link" onClick={semaineSuivante}>Semaine suivante →</button>
                </Alert>
              )}
              {grouperParJour(creneaux).map(([jour, liste]) => (
                <div key={jour}>
                  <h3 className="jour">{fmtJour.format(new Date(liste[0].debut))}</h3>
                  <div className="grille">
                    {liste.map((c) => (
                      <button
                        type="button" key={c.id_creneau}
                        disabled={c.statut !== 'libre'}
                        className={`creneau ${selection?.id_creneau === c.id_creneau ? 'choisi' : ''}`}
                        title={c.statut !== 'libre' ? 'Déjà réservé' : c.clinique}
                        onClick={() => setSelection(c)}
                      >{fmtHeure.format(new Date(c.debut))}</button>
                    ))}
                  </div>
                </div>
              ))}
              <div className="selection">
                <span>{selection ? <>Sélection : <strong>{fmtJour.format(new Date(selection.debut))}, {fmtHeure.format(new Date(selection.debut))}</strong> · {selection.ville}</> : 'Choisissez un créneau.'}</span>
                <button className="btn-primary btn-auto" disabled={!selection}
                  onClick={() => navigate(`/patient/rendez-vous/confirmation?creneau=${selection.id_creneau}`)}>Continuer</button>
              </div>
            </section>
          )}
        </div>
      )}
    </>
  )
}

export default function PrendreRendezVous() {
  return (
    <AppLayout title="Prendre rendez-vous" subtitle="Recherchez un praticien puis choisissez un créneau libre" roles={['PATIENT']}>
      <Contenu />
    </AppLayout>
  )
}
