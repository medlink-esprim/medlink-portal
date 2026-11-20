// US-50 : synthèse de la Direction (chiffres clés par clinique et par mois)
// US-51 : suivi de la baisse des appels (part des rendez-vous pris en ligne et son évolution)
import { useEffect, useState } from 'react'
import { api } from '../api.js'
import AppLayout from '../components/AppLayout.jsx'
import Alert from '../components/Alert.jsx'

const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
const pct = (v) => (v === null || v === undefined ? '—' : `${String(v).replace('.', ',')} %`)
const anneeCourante = new Date().getFullYear()

function SuiviAppels() {
  const [data, setData] = useState(null)
  const [erreur, setErreur] = useState('')
  useEffect(() => {
    api('/statistiques/appels').then((r) => (r.ok ? setData(r.data) : setErreur(r.data?.message || 'Indicateur indisponible')))
  }, [])
  if (erreur) return <section className="card"><Alert type="error">{erreur}</Alert></section>
  if (!data) return null
  const t = data.total
  return (
    <section className="card">
      <h2>Part des rendez-vous pris en ligne</h2>
      <p>
        <span className="chiffre-cle">{pct(t.part_en_ligne)}</span>{' '}
        sur les 12 derniers mois ({t.en_ligne} en ligne, {t.accueil} par l'accueil) ·{' '}
        <span className={`badge ${t.objectif_atteint ? 'badge-ok' : 'badge-attente'}`}>
          objectif {data.objectif} % {t.objectif_atteint ? 'atteint' : 'non atteint'}
        </span>
      </p>
      <div className="barres" role="img" aria-label="Part en ligne par mois">
        {data.mois.map((m) => (
          <div key={m.mois} className="barre" title={`${m.mois} : ${pct(m.part_en_ligne)}`}>
            <span style={{ height: `${m.part_en_ligne || 0}%` }} className={m.part_en_ligne >= data.objectif ? 'ok' : ''} />
            <small>{MOIS[Number(m.mois.slice(5)) - 1]}</small>
          </div>
        ))}
        <div className="objectif" style={{ bottom: `${data.objectif}%` }}><small>{data.objectif} %</small></div>
      </div>
      <table className="table">
        <thead><tr><th>Mois</th><th>Rendez-vous</th><th>En ligne</th><th>Accueil</th><th>Part en ligne</th><th>Évolution</th></tr></thead>
        <tbody>
          {data.mois.map((m) => (
            <tr key={m.mois}><td>{m.mois}</td><td>{m.rendez_vous}</td><td>{m.en_ligne}</td><td>{m.accueil}</td><td>{pct(m.part_en_ligne)}</td>
              <td>{m.evolution === null ? '—' : `${m.evolution > 0 ? '+' : ''}${String(m.evolution).replace('.', ',')} pt`}</td></tr>
          ))}
          {!data.mois.length && <tr><td colSpan="6" className="muted">Aucun rendez-vous sur la période.</td></tr>}
        </tbody>
      </table>
    </section>
  )
}

function Contenu() {
  const [annee, setAnnee] = useState(anneeCourante)
  const [data, setData] = useState(null)
  const [erreur, setErreur] = useState('')
  useEffect(() => {
    api(`/statistiques/synthese?annee=${annee}`).then((r) => {
      if (r.ok) { setData(r.data); setErreur('') } else setErreur(r.data?.message || 'Synthèse indisponible')
    })
  }, [annee])

  return (
    <>
      <section className="card">
        <div className="barre-agenda">
          <div>
            <label htmlFor="annee">Année</label>
            <select id="annee" value={annee} onChange={(e) => setAnnee(Number(e.target.value))}>
              {[anneeCourante - 2, anneeCourante - 1, anneeCourante, anneeCourante + 1].map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          {data && <p className="muted"><strong>{data.total.rendez_vous}</strong> rendez-vous · {pct(data.total.taux_en_ligne)} en ligne</p>}
        </div>
        {erreur && <Alert type="error">{erreur}</Alert>}
      </section>
      {data && data.cliniques.map((k) => (
        <section key={k.clinique} className="card">
          <h2>{k.nom}</h2>
          <p className="muted">{k.total.rendez_vous} rendez-vous · {k.total.honores} honorés ({pct(k.total.taux_honores)}) · {k.total.manques} manqués · {k.total.annules} annulés · {pct(k.total.taux_en_ligne)} en ligne</p>
          <div className="table-defilante">
            <table className="table compacte">
              <thead><tr><th />{MOIS.map((m) => <th key={m}>{m}</th>)}</tr></thead>
              <tbody>
                {[['rendez_vous', 'Rendez-vous'], ['honores', 'Honorés'], ['manques', 'Manqués'], ['annules', 'Annulés'], ['en_ligne', 'En ligne']].map(([c, l]) => (
                  <tr key={c}><th scope="row">{l}</th>{k.mois.map((m) => <td key={m.mois}>{m[c] || '·'}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      <SuiviAppels />
    </>
  )
}

export default function Synthese() {
  return (
    <AppLayout title="Synthèse d'activité" subtitle="Chiffres clés des trois cliniques" roles={['DIRECTION', 'ADMIN']}>
      <Contenu />
    </AppLayout>
  )
}
