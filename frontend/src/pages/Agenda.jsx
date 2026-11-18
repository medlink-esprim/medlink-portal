// US-19 : agenda unifié du praticien — une semaine, ses trois cliniques dans une seule vue
// (couleur par clinique, filtre). US-20 : alertes d'annulation et de report ; un créneau annulé
// redevient « libre » dans l'agenda.
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import AppLayout from '../components/AppLayout.jsx'
import Alert from '../components/Alert.jsx'

const TZ = 'Africa/Tunis'
const jourIso = (iso) => new Date(iso).toLocaleDateString('sv-SE', { timeZone: TZ })   // AAAA-MM-JJ à Tunis
const heure = (iso) => new Date(iso).toLocaleTimeString('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })
const ajouterJours = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const libelleJour = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('fr-FR', { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: '2-digit' })
const longue = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('fr-FR', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' })
const dateHeure = (iso) => new Date(iso).toLocaleString('fr-FR', { timeZone: TZ, weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const couleur = (ville) => `clinique-${(ville || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()}`

function Alertes({ data, onLues }) {
  if (!data || data.alertes.length === 0) return null
  return (
    <section className="card alertes">
      <div className="entete-alertes">
        <h2>Alertes {data.nonLues > 0 && <span className="pill pill-ko">{data.nonLues} nouvelle{data.nonLues > 1 ? 's' : ''}</span>}</h2>
        {data.nonLues > 0 && <button className="btn-secondary btn-mini" onClick={onLues}>Tout marquer comme lu</button>}
      </div>
      <ul>
        {data.alertes.slice(0, 6).map((a) => (
          <li key={a.id_notification} className={a.lue_le ? 'lue' : ''}>
            <strong>{a.prenom} {a.nom}</strong>{' '}
            {a.nature === 'annulation' && <>a annulé son rendez-vous du {dateHeure(a.debut)} ({a.ville}) — <em>créneau libéré</em></>}
            {a.nature === 'report' && <>a reporté son rendez-vous{a.ancienne_date ? ` du ${dateHeure(a.ancienne_date)}` : ''} au {dateHeure(a.debut)} ({a.ville})</>}
            {a.nature === 'autre' && <>a modifié son rendez-vous du {dateHeure(a.debut)}</>}
          </li>
        ))}
      </ul>
    </section>
  )
}

function Contenu() {
  const [semaine, setSemaine] = useState('')        // lundi (AAAA-MM-JJ) ; vide = semaine en cours
  const [clinique, setClinique] = useState('')
  const [agenda, setAgenda] = useState(null)
  const [alertes, setAlertes] = useState(null)
  const [erreur, setErreur] = useState('')

  const charger = useCallback(async () => {
    const q = new URLSearchParams()
    if (semaine) q.set('debut', semaine)
    if (clinique) q.set('clinique', clinique)
    const [a, al] = await Promise.all([api(`/praticien/agenda?${q}`), api('/praticien/alertes')])
    if (a.ok) setAgenda(a.data); else setErreur(a.data?.message || 'Agenda indisponible')
    if (al.ok) setAlertes(al.data)
  }, [semaine, clinique])
  useEffect(() => { charger() }, [charger])

  async function marquerLues() {
    await api('/praticien/alertes/lues', { method: 'POST' })
    charger()
  }

  if (!agenda) return erreur ? <Alert type="error">{erreur}</Alert> : null
  const jours = Array.from({ length: 7 }, (_, i) => ajouterJours(agenda.semaine, i))
  const parJour = Object.fromEntries(jours.map((j) => [j, agenda.creneaux.filter((c) => jourIso(c.debut) === j)]))
  const rdv = agenda.creneaux.filter((c) => c.id_rdv)
  const aujourdhui = new Date().toLocaleDateString('sv-SE', { timeZone: TZ })

  return (
    <>
      <Alertes data={alertes} onLues={marquerLues} />
      <section className="card">
        <div className="barre-agenda">
          <div className="actions-ligne">
            <button className="btn-secondary" onClick={() => setSemaine(ajouterJours(agenda.semaine, -7))}>← Précédente</button>
            <button className="btn-secondary" onClick={() => setSemaine('')}>Cette semaine</button>
            <button className="btn-secondary" onClick={() => setSemaine(ajouterJours(agenda.semaine, 7))}>Suivante →</button>
          </div>
          <strong>Semaine du {longue(agenda.semaine)} · {rdv.length} rendez-vous</strong>
          <div className="filtres-cliniques">
            <button className={clinique === '' ? 'actif' : ''} onClick={() => setClinique('')}>Toutes</button>
            {agenda.cliniques.map((c) => (
              <button key={c.id_clinique} className={`${clinique === c.id_clinique ? 'actif' : ''} ${couleur(c.ville)}`} onClick={() => setClinique(c.id_clinique)}>
                <span className="pastille" />{c.ville}{!c.actif && ' (retirée)'}
              </button>
            ))}
          </div>
        </div>
        <div className="semaine">
          {jours.map((j) => (
            <div key={j} className={`jour-agenda ${j === aujourdhui ? 'aujourdhui' : ''}`}>
              <h3>{libelleJour(j)}</h3>
              {parJour[j].length === 0 && <p className="muted vide">—</p>}
              {parJour[j].map((c) => (
                <div key={c.id_creneau} className={`creneau-agenda ${couleur(c.ville)} ${c.id_rdv ? 'occupe' : 'libre'}`}>
                  <span className="heure">{heure(c.debut)} · {c.ville}</span>
                  {c.id_rdv ? (
                    <>
                      <Link to={`/praticien/patients/${c.id_patient}`}>{c.prenom} {c.nom}</Link>
                      <span className="etiquettes">
                        {c.origine === 'accueil' && <span className="pill pill-new">Accueil</span>}
                        {c.statut_rdv === 'honore' && <span className="pill pill-ok">Honoré</span>}
                        {c.statut_rdv === 'manque' && <span className="pill pill-ko">Manqué</span>}
                        {c.compte_rendu && <span className="pill">CR</span>}
                      </span>
                    </>
                  ) : <span className="muted">{c.statut === 'bloque' ? 'Bloqué' : 'Libre'}</span>}
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>
    </>
  )
}

export default function Agenda() {
  return (
    <AppLayout title="Mon agenda" subtitle="Vos rendez-vous de toutes vos cliniques dans une seule vue" roles={['PRATICIEN']}>
      <Contenu />
    </AppLayout>
  )
}
