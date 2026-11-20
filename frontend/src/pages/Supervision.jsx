// US-31 : supervision des trois cliniques — taux d'occupation et rendez-vous par clinique sur une période.
import { useEffect, useState } from 'react'
import { api } from '../api.js'
import AppLayout, { useUser } from '../components/AppLayout.jsx'
import Alert from '../components/Alert.jsx'

const pct = (v) => (v === null || v === undefined ? '—' : `${String(v).replace('.', ',')} %`)

function Contenu() {
  const user = useUser()
  const [periode, setPeriode] = useState({ du: '', au: '' })
  const [data, setData] = useState(null)
  const [erreur, setErreur] = useState('')

  useEffect(() => {
    const q = new URLSearchParams(Object.entries(periode).filter(([, v]) => v))
    api(`/statistiques/supervision?${q}`).then((r) => {
      if (r.ok) { setData(r.data); setErreur('') } else setErreur(r.data?.message || 'Statistiques indisponibles')
    })
  }, [periode])
  const set = (k) => (e) => setPeriode({ ...periode, [k]: e.target.value })

  return (
    <>
      <section className="card">
        <div className="barre-agenda">
          <div className="row">
            <div><label htmlFor="s-du">Du</label><input id="s-du" type="date" value={periode.du || data?.du || ''} onChange={set('du')} /></div>
            <div><label htmlFor="s-au">Au</label><input id="s-au" type="date" value={periode.au || data?.au || ''} onChange={set('au')} /></div>
          </div>
          {user?.permissions?.includes('STATS_EXPORTER') && data && (
            <a className="lien-export" href={`/api/statistiques/export.csv?du=${data.du}&au=${data.au}`}>Exporter (CSV anonymisé)</a>
          )}
        </div>
        {erreur && <Alert type="error">{erreur}</Alert>}
      </section>
      {data && (
        <>
          <div className="tuiles">
            {data.cliniques.map((c) => (
              <section key={c.id_clinique} className={`card tuile clinique-${c.ville.toLowerCase()}`}>
                <h2>{c.nom}</h2>
                <div className="chiffre">{pct(c.taux_occupation)}</div>
                <p className="muted">taux d'occupation · {c.creneaux_reserves} / {c.creneaux_ouverts} créneaux</p>
                <div className="jauge"><span style={{ width: `${Math.min(100, c.taux_occupation || 0)}%` }} /></div>
                <p><strong>{c.rendez_vous}</strong> rendez-vous · {c.praticiens} praticien{c.praticiens > 1 ? 's' : ''}</p>
              </section>
            ))}
          </div>
          <section className="card">
            <h2>Rendez-vous par clinique</h2>
            <table className="table">
              <thead><tr><th>Clinique</th><th>Planifiés</th><th>Honorés</th><th>Manqués</th><th>Annulés</th><th>En ligne</th><th>Accueil</th><th>Occupation</th></tr></thead>
              <tbody>
                {data.cliniques.map((c) => (
                  <tr key={c.id_clinique}><td><strong>{c.ville}</strong></td><td>{c.planifies}</td><td>{c.honores}</td><td>{c.manques}</td><td>{c.annules}</td><td>{c.en_ligne}</td><td>{c.accueil}</td><td>{pct(c.taux_occupation)}</td></tr>
                ))}
                <tr className="total"><td><strong>Total</strong></td><td colSpan="3">{data.total.rendez_vous} rendez-vous, {data.total.honores} honorés</td><td>{data.total.annules}</td><td>{data.total.en_ligne}</td><td>{data.total.accueil}</td><td>{pct(data.total.taux_occupation)}</td></tr>
              </tbody>
            </table>
            <p className="small-note">Taux d'occupation = créneaux réservés / créneaux ouverts (hors créneaux bloqués) sur la période. Aucune donnée nominative.</p>
          </section>
        </>
      )}
    </>
  )
}

export default function Supervision() {
  return (
    <AppLayout title="Supervision" subtitle="Activité des trois cliniques" roles={['AGENT_ADMIN', 'ADMIN', 'DIRECTION']}>
      <Contenu />
    </AppLayout>
  )
}
