// Tableau de bord après connexion (US-02 / US-40), un par rôle, alimenté par les API existantes :
//   patient : prochain rendez-vous, derniers résultats, accès récents à son dossier, conseils ;
//   praticien : consultations du jour, semaine, alertes d'annulation ;
//   accueil, administration, Direction : activité des trois cliniques (+ alertes, demandes, part en ligne).
import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { api } from '../api.js'
import AppLayout, { useUser } from '../components/AppLayout.jsx'
import Icone, { TraceEcg } from '../components/Icone.jsx'

const TZ = 'Africa/Tunis'
const jourIso = (d) => new Date(d).toLocaleDateString('sv-SE', { timeZone: TZ })
const heure = (d) => new Date(d).toLocaleTimeString('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })
const dateLongue = (d) => new Date(d).toLocaleDateString('fr-FR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' })
const dateCourte = (d) => new Date(d).toLocaleDateString('fr-FR', { timeZone: TZ, day: 'numeric', month: 'short' })
const pct = (v) => (v === null || v === undefined ? '—' : `${String(v).replace('.', ',')} %`)
const salutation = () => {
  const h = Number(new Date().toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }))
  return h < 18 ? 'Bonjour' : 'Bonsoir'
}
const dansJours = (d) => {
  const n = Math.round((new Date(jourIso(d)) - new Date(jourIso(new Date()))) / 86400000)
  return n === 0 ? "aujourd'hui" : n === 1 ? 'demain' : `dans ${n} jours`
}
const peut = (user, perm) => (user.permissions || []).includes(perm)

// petit hook : charge une URL d'API (null pendant le chargement, [] / {} en cas d'échec)
function useApi(url, vide = []) {
  const [data, setData] = useState(null)
  useEffect(() => {
    if (!url) { setData(vide); return undefined }
    let actif = true
    api(url).then((r) => { if (actif) setData(r.ok ? r.data : vide) })
    return () => { actif = false }
  }, [url]) // eslint-disable-line react-hooks/exhaustive-deps
  return data
}

function Stat({ icone, couleur = '', valeur, libelle }) {
  return (
    <div className="card stat">
      <span className={`icone-pastille ${couleur}`}><Icone nom={icone} /></span>
      <div><div className="valeur">{valeur ?? '—'}</div><div className="libelle">{libelle}</div></div>
    </div>
  )
}

function EnteteCarte({ icone, titre, lien, libelleLien = 'Tout voir' }) {
  return (
    <div className="entete-carte">
      <h2><Icone nom={icone} />{titre}</h2>
      {lien && <Link to={lien}>{libelleLien}<Icone nom="fleche" /></Link>}
    </div>
  )
}

const Squelette = () => <><div className="squelette" /><div className="squelette" style={{ width: '70%' }} /><div className="squelette" style={{ width: '85%' }} /></>
const Vide = ({ icone, children }) => <div className="vide-etat"><Icone nom={icone} />{children}</div>

function ActionsRapides({ liens }) {
  return (
    <section className="card">
      <EnteteCarte icone="activite" titre="Accès rapides" />
      <div className="actions-rapides">
        {liens.map(([to, icone, libelle, couleur]) => (
          <Link key={to} to={to} className="action-rapide"><span className={`icone-pastille ${couleur || ''}`}><Icone nom={icone} /></span>{libelle}</Link>
        ))}
      </div>
    </section>
  )
}

function Hero({ titre, texte, actions }) {
  return (
    <section className="accueil-hero">
      <TraceEcg className="ecg" />
      <div style={{ position: 'relative', zIndex: 1 }}><h2>{titre}</h2><p>{texte}</p></div>
      {actions && <div className="actions-hero">{actions}</div>}
    </section>
  )
}

// ===================== Patient =====================
const CONSEILS = [
  ['Préparez votre consultation', 'Apportez votre carte d\'identité, vos ordonnances en cours et vos derniers résultats d\'analyses.'],
  ['Arrivez 10 minutes en avance', 'Le temps de l\'accueil administratif : votre praticien pourra vous recevoir à l\'heure.'],
  ['Un empêchement ?', 'Annulez ou reportez en ligne jusqu\'à 24 h avant : le créneau profite à un autre patient.'],
  ['Vos résultats en sécurité', 'Vos documents sont chiffrés et chaque consultation de votre dossier est visible dans « Mon profil ».'],
]

function TableauPatient({ user }) {
  const rdv = useApi('/patients/moi/rendez-vous')
  const docs = useApi('/patients/moi/documents')
  const acces = useApi('/patients/moi/acces')
  const maintenant = new Date()
  const aVenir = (rdv || []).filter((r) => r.statut === 'planifie' && new Date(r.debut) > maintenant).sort((a, b) => new Date(a.debut) - new Date(b.debut))
  const prochain = aVenir[0]
  const recents = (docs || []).filter((d) => maintenant - new Date(d.date_publication) < 30 * 86400000)
  const conseil = CONSEILS[new Date().getDate() % CONSEILS.length]

  return (
    <>
      <Hero
        titre={`${salutation()}, ${user.prenom}`}
        texte={prochain ? `Votre prochain rendez-vous est ${dansJours(prochain.debut)}, à ${heure(prochain.debut)}, avec le Dr ${prochain.praticien_nom}.` : 'Aucun rendez-vous prévu. Trouvez un praticien et un créneau en quelques clics.'}
        actions={<>
          <Link className="bouton-clair" to="/patient/rendez-vous/nouveau"><Icone nom="calendrierPlus" />Prendre rendez-vous</Link>
          <Link className="bouton-clair transparent" to="/patient/resultats"><Icone nom="document" />Mes résultats</Link>
        </>}
      />
      <div className="stats">
        <Stat icone="calendrier" valeur={rdv ? aVenir.length : null} libelle="rendez-vous à venir" />
        <Stat icone="horloge" couleur="bleu" valeur={prochain ? dateCourte(prochain.debut) : rdv ? '—' : null} libelle="prochaine consultation" />
        <Stat icone="document" couleur="vert" valeur={docs ? docs.length : null} libelle="documents dans votre dossier" />
        <Stat icone="cloche" couleur="orange" valeur={docs ? recents.length : null} libelle="nouveaux ce mois-ci" />
      </div>
      <div className="grille-tableau">
        <div className="colonne">
          <section className="card">
            <EnteteCarte icone="calendrier" titre="Prochain rendez-vous" lien="/patient/rendez-vous" libelleLien="Mes rendez-vous" />
            {!rdv && <Squelette />}
            {rdv && !prochain && <Vide icone="calendrier">Aucun rendez-vous à venir. <Link to="/patient/rendez-vous/nouveau">Prendre rendez-vous</Link></Vide>}
            {prochain && (
              <div className="prochain-rdv">
                <div className="bloc-date">
                  <span className="mois">{new Date(prochain.debut).toLocaleDateString('fr-FR', { timeZone: TZ, month: 'short' })}</span>
                  <span className="jour-num">{new Date(prochain.debut).toLocaleDateString('fr-FR', { timeZone: TZ, day: 'numeric' })}</span>
                  <span className="jour-nom">{new Date(prochain.debut).toLocaleDateString('fr-FR', { timeZone: TZ, weekday: 'long' })}</span>
                </div>
                <div className="details">
                  <strong>Dr {prochain.praticien_prenom} {prochain.praticien_nom}</strong>
                  <p><Icone nom="stethoscope" />{prochain.specialite}</p>
                  <p><Icone nom="horloge" />{heure(prochain.debut)} – {heure(prochain.fin)} · {dansJours(prochain.debut)}</p>
                  <p><Icone nom="lieu" />{prochain.clinique}</p>
                </div>
              </div>
            )}
            {aVenir.length > 1 && (
              <ul className="liste-items" style={{ marginTop: '1rem', borderTop: '1px solid var(--line-soft)' }}>
                {aVenir.slice(1, 4).map((r) => (
                  <li key={r.id_rdv}><span className="heure-rdv">{dateCourte(r.debut)}</span>
                    <div className="texte"><strong>Dr {r.praticien_nom} · {r.specialite}</strong><span>{heure(r.debut)} · {r.ville}</span></div></li>
                ))}
              </ul>
            )}
          </section>
          <section className="card">
            <EnteteCarte icone="document" titre="Derniers résultats" lien="/patient/resultats" />
            {!docs && <Squelette />}
            {docs && docs.length === 0 && <Vide icone="document">Vos résultats et comptes-rendus apparaîtront ici dès leur publication.</Vide>}
            <ul className="liste-items">
              {(docs || []).slice(0, 4).map((d) => (
                <li key={d.id_document}><span className="icone-pastille vert"><Icone nom="document" /></span>
                  <div className="texte"><strong>{d.titre}</strong><span>Publié le {dateCourte(d.date_publication)}</span></div>
                  {recents.includes(d) && <span className="pill pill-new">Nouveau</span>}</li>
              ))}
            </ul>
          </section>
        </div>
        <div className="colonne">
          <ActionsRapides liens={[
            ['/patient/rendez-vous/nouveau', 'calendrierPlus', 'Prendre rendez-vous'],
            ['/patient/rendez-vous', 'calendrier', 'Mes rendez-vous', 'bleu'],
            ['/patient/resultats', 'document', 'Mes résultats', 'vert'],
            ['/patient/profil', 'utilisateur', 'Mon profil', 'violet'],
          ]} />
          <section className="card">
            <EnteteCarte icone="bouclier" titre="Accès à mon dossier" lien="/patient/profil" libelleLien="Historique" />
            {!acces && <Squelette />}
            {acces && acces.length === 0 && <Vide icone="bouclier">Aucun accès enregistré pour le moment.</Vide>}
            <ul className="journal-acces">
              {(acces || []).slice(0, 3).map((a, i) => (
                <li key={i}><strong>{a.auteur}</strong>{a.document ? ` · ${a.document}` : ' · dossier consulté'}<br /><span className="muted">{dateCourte(a.date_acces)} à {heure(a.date_acces)}</span></li>
              ))}
            </ul>
          </section>
          <section className="card conseil">
            <span className="icone-pastille"><Icone nom="coeur" /></span>
            <div><strong>{conseil[0]}</strong><p>{conseil[1]}</p></div>
          </section>
        </div>
      </div>
    </>
  )
}

// ===================== Praticien =====================
function TableauPraticien({ user }) {
  const agenda = useApi('/praticien/agenda', { creneaux: [] })
  const alertes = useApi('/praticien/alertes', { nonLues: 0, alertes: [] })
  const aujourdhui = jourIso(new Date())
  const creneaux = agenda?.creneaux || []
  const rdvSemaine = creneaux.filter((c) => c.id_rdv && c.statut_rdv !== 'annule')
  const duJour = rdvSemaine.filter((c) => jourIso(c.debut) === aujourdhui).sort((a, b) => new Date(a.debut) - new Date(b.debut))
  const libres = creneaux.filter((c) => !c.id_rdv && c.statut === 'libre' && new Date(c.debut) > new Date()).length
  const suivant = duJour.find((c) => new Date(c.fin) > new Date())

  return (
    <>
      <Hero
        titre={`${salutation()}, Dr ${user.nom}`}
        texte={agenda ? (duJour.length ? `${duJour.length} consultation${duJour.length > 1 ? 's' : ''} aujourd'hui${suivant ? `, la prochaine à ${heure(suivant.debut)} (${suivant.ville})` : ''}.` : "Aucune consultation aujourd'hui.") : 'Chargement de votre journée…'}
        actions={<>
          <Link className="bouton-clair" to="/praticien/agenda"><Icone nom="calendrier" />Mon agenda</Link>
          <Link className="bouton-clair transparent" to="/praticien/patients"><Icone nom="utilisateurs" />Mes patients</Link>
        </>}
      />
      <div className="stats">
        <Stat icone="stethoscope" valeur={agenda ? duJour.length : null} libelle="consultations aujourd'hui" />
        <Stat icone="calendrier" couleur="bleu" valeur={agenda ? rdvSemaine.length : null} libelle="rendez-vous cette semaine" />
        <Stat icone="horloge" couleur="vert" valeur={agenda ? libres : null} libelle="créneaux encore libres" />
        <Stat icone="cloche" couleur={alertes?.nonLues ? 'rouge' : 'orange'} valeur={alertes ? alertes.nonLues : null} libelle="alertes non lues" />
      </div>
      <div className="grille-tableau">
        <section className="card">
          <EnteteCarte icone="stethoscope" titre={`Aujourd'hui, ${dateLongue(new Date())}`} lien="/praticien/agenda" libelleLien="Semaine" />
          {!agenda && <Squelette />}
          {agenda && duJour.length === 0 && <Vide icone="calendrier">Pas de consultation prévue aujourd'hui.</Vide>}
          <ul className="liste-items">
            {duJour.map((c) => (
              <li key={c.id_creneau} className={`clinique-${(c.ville || '').toLowerCase()}`}>
                <span className="heure-rdv">{heure(c.debut)}</span>
                <span className="pastille" />
                <div className="texte"><strong>{c.prenom} {c.nom}</strong><span>{c.clinique} · dossier {c.numero_dossier}</span></div>
                {c.compte_rendu ? <span className="pill pill-ok">Compte-rendu</span> : c.statut_rdv === 'manque' ? <span className="pill pill-ko">Absent</span> : c.origine === 'accueil' ? <span className="pill pill-new">Accueil</span> : null}
                <Link className="btn-secondary btn-mini btn-link" to={`/praticien/patients/${c.id_patient}`}>Dossier</Link>
              </li>
            ))}
          </ul>
        </section>
        <div className="colonne">
          <section className="card">
            <EnteteCarte icone="cloche" titre="Alertes" lien="/praticien/agenda" />
            {!alertes && <Squelette />}
            {alertes && alertes.alertes.length === 0 && <Vide icone="cloche">Aucune annulation ni report récent.</Vide>}
            <ul className="liste-items">
              {(alertes?.alertes || []).slice(0, 4).map((a) => (
                <li key={a.id_notification}><span className={`icone-pastille ${a.nature === 'annulation' ? 'rouge' : 'orange'}`}><Icone nom={a.nature === 'annulation' ? 'attention' : 'calendrier'} /></span>
                  <div className="texte"><strong>{a.nature === 'annulation' ? 'Rendez-vous annulé' : a.nature === 'report' ? 'Rendez-vous reporté' : 'Modification'}</strong>
                    <span>{a.debut ? `${dateCourte(a.debut)} à ${heure(a.debut)}` : ''}{a.ville ? ` · ${a.ville}` : ''}</span></div>
                  {!a.lue_le && <span className="pill pill-ko">Nouvelle</span>}</li>
              ))}
            </ul>
          </section>
          <ActionsRapides liens={[
            ['/praticien/agenda', 'calendrier', 'Agenda de la semaine'],
            ['/praticien/patients', 'utilisateurs', 'Rechercher un patient', 'bleu'],
            ['/praticien/disponibilites', 'horloge', 'Disponibilités et absences', 'vert'],
            ['/praticien/patients', 'document', 'Rédiger un compte-rendu', 'violet'],
          ]} />
        </div>
      </div>
    </>
  )
}

// ===================== Accueil, administration, Direction =====================
function Cliniques({ sup }) {
  return (
    <section className="card">
      <EnteteCarte icone="clinique" titre="Les trois cliniques ce mois-ci" lien="/back-office/supervision" libelleLien="Supervision" />
      {!sup && <Squelette />}
      <ul className="liste-items">
        {(sup?.cliniques || []).map((c) => (
          <li key={c.id_clinique} className={`clinique-${c.ville.toLowerCase()}`}>
            <span className="icone-pastille" style={{ background: 'color-mix(in srgb, var(--clinique) 12%, white)', color: 'var(--clinique)' }}><Icone nom="clinique" /></span>
            <div className="texte">
              <strong>{c.nom}</strong>
              <span>{c.rendez_vous} rendez-vous · {c.praticiens} praticien{c.praticiens > 1 ? 's' : ''} · {c.creneaux_reserves}/{c.creneaux_ouverts} créneaux</span>
              <div className="mini-jauge"><span style={{ width: `${Math.min(100, c.taux_occupation || 0)}%` }} /></div>
            </div>
            <strong style={{ color: 'var(--navy)' }}>{pct(c.taux_occupation)}</strong>
          </li>
        ))}
      </ul>
    </section>
  )
}

function TableauGestion({ user }) {
  const sup = useApi(peut(user, 'SUPERVISION_CONSULTER') ? '/statistiques/supervision' : null, null)
  const alertes = useApi(peut(user, 'AUDIT_CONSULTER') ? '/admin/audit/alertes' : null, null)
  const demandes = useApi(peut(user, 'DEMANDES_TRAITER') ? '/admin/demandes' : null, null)
  const maintenances = useApi(peut(user, 'MAINTENANCE_GERER') ? '/maintenance' : null, null)
  const appels = useApi(peut(user, 'SYNTHESE_CONSULTER') ? '/statistiques/appels' : null, null)
  const t = sup?.total
  const enAttente = (demandes || []).filter((d) => ['recue', 'en_cours'].includes(d.statut))
  const prochaine = (maintenances || []).filter((m) => !m.annulee && new Date(m.fin) > new Date()).sort((a, b) => new Date(a.debut) - new Date(b.debut))[0]
  const textes = {
    AGENT_ADMIN: "Prenez des rendez-vous pour les patients au guichet ou au téléphone et suivez l'activité des cliniques.",
    ADMIN: 'Comptes, droits, sécurité et conformité du portail, en un coup d\'œil.',
    DIRECTION: 'Activité des trois cliniques et progression des rendez-vous pris en ligne.',
  }
  const liens = {
    AGENT_ADMIN: [['/back-office/rendez-vous', 'calendrierPlus', 'Rendez-vous patient'], ['/back-office/comptes', 'utilisateurs', 'Comptes', 'bleu'], ['/back-office/comptes/nouveau', 'plus', 'Créer un compte', 'vert'], ['/back-office/supervision', 'graphique', 'Supervision', 'violet']],
    ADMIN: [['/admin/audit', 'bouclier', "Journal d'audit"], ['/back-office/comptes', 'utilisateurs', 'Comptes', 'bleu'], ['/admin/roles', 'cle', 'Rôles et droits', 'violet'], ['/admin/demandes', 'boite', 'Demandes INPDP', 'orange']],
    DIRECTION: [['/direction/synthese', 'tendance', 'Synthèse annuelle'], ['/back-office/supervision', 'graphique', 'Supervision', 'bleu']],
  }[user.role] || []

  return (
    <>
      <Hero
        titre={`${salutation()}, ${user.prenom}`}
        texte={textes[user.role] || 'Bienvenue sur votre espace MedLink.'}
        actions={user.role === 'AGENT_ADMIN'
          ? <Link className="bouton-clair" to="/back-office/rendez-vous"><Icone nom="calendrierPlus" />Nouveau rendez-vous</Link>
          : user.role === 'DIRECTION' ? <Link className="bouton-clair" to="/direction/synthese"><Icone nom="tendance" />Synthèse</Link>
            : peut(user, 'AUDIT_CONSULTER') ? <Link className="bouton-clair" to="/admin/audit"><Icone nom="bouclier" />Journal d'audit</Link> : null}
      />
      <div className="stats">
        <Stat icone="calendrier" valeur={t ? t.rendez_vous : sup === null ? null : '—'} libelle="rendez-vous ce mois-ci" />
        <Stat icone="graphique" couleur="bleu" valeur={t ? pct(t.taux_occupation) : sup === null ? null : '—'} libelle="taux d'occupation" />
        {user.role === 'ADMIN'
          ? <Stat icone="attention" couleur={alertes?.nouvelles ? 'rouge' : 'vert'} valeur={alertes ? alertes.nouvelles : null} libelle="alertes de sécurité nouvelles" />
          : <Stat icone="tendance" couleur="vert" valeur={appels ? pct(appels.total.part_en_ligne) : t ? pct(t.rendez_vous ? Math.round((1000 * t.en_ligne) / t.rendez_vous) / 10 : null) : null} libelle={appels ? `pris en ligne (objectif ${appels.objectif} %)` : 'pris en ligne ce mois-ci'} />}
        {user.role === 'ADMIN'
          ? <Stat icone="boite" couleur="orange" valeur={demandes ? enAttente.length : null} libelle="demandes INPDP en attente" />
          : <Stat icone="attention" couleur="orange" valeur={t ? t.annules : sup === null ? null : '—'} libelle="annulations ce mois-ci" />}
      </div>
      <div className="grille-tableau">
        <div className="colonne">
          {peut(user, 'SUPERVISION_CONSULTER') && <Cliniques sup={sup} />}
          {user.role === 'ADMIN' && (
            <section className="card">
              <EnteteCarte icone="bouclier" titre="Alertes de sécurité" lien="/admin/audit" />
              {!alertes && <Squelette />}
              {alertes && alertes.alertes.length === 0 && <Vide icone="bouclier">Aucun accès suspect détecté.</Vide>}
              <ul className="liste-items">
                {(alertes?.alertes || []).slice(0, 4).map((a) => (
                  <li key={a.id_alerte}><span className={`icone-pastille ${a.statut === 'nouvelle' ? 'rouge' : 'vert'}`}><Icone nom={a.statut === 'nouvelle' ? 'attention' : 'valide'} /></span>
                    <div className="texte"><strong>{a.nb_dossiers} dossiers consultés en une heure</strong><span>{dateCourte(a.date_alerte)} à {heure(a.date_alerte)}</span></div>
                    <span className={`pill ${a.statut === 'nouvelle' ? 'pill-ko' : 'pill-ok'}`}>{a.statut === 'nouvelle' ? 'Nouvelle' : 'Traitée'}</span></li>
                ))}
              </ul>
            </section>
          )}
        </div>
        <div className="colonne">
          {liens.length > 0 && <ActionsRapides liens={liens} />}
          {user.role === 'ADMIN' && (
            <section className="card">
              <EnteteCarte icone="outil" titre="Maintenance" lien="/admin/maintenance" libelleLien="Planifier" />
              {prochaine
                ? <p style={{ margin: 0 }}><strong>{dateLongue(prochaine.debut)}</strong><br /><span className="muted">{heure(prochaine.debut)} – {heure(prochaine.fin)} · {prochaine.message}</span></p>
                : <Vide icone="valide">Aucune maintenance programmée.</Vide>}
            </section>
          )}
          {appels && (
            <section className="card">
              <EnteteCarte icone="tendance" titre="Rendez-vous pris en ligne" lien="/direction/synthese" />
              <div className="valeur chiffre-cle">{pct(appels.total.part_en_ligne)}</div>
              <div className="mini-jauge" style={{ height: '.6rem' }}><span style={{ width: `${Math.min(100, appels.total.part_en_ligne || 0)}%` }} /></div>
              <p className="muted" style={{ marginBottom: 0 }}>{appels.total.en_ligne} en ligne, {appels.total.accueil} par l'accueil sur 12 mois · objectif {appels.objectif} % {appels.total.objectif_atteint ? 'atteint' : 'non atteint'}</p>
            </section>
          )}
        </div>
      </div>
    </>
  )
}

function Contenu() {
  const user = useUser()
  const { state } = useLocation()
  const restants = state?.codesSecoursRestants
  return (
    <>
      {restants !== undefined && <div className="alert alert-info" style={{ marginTop: 0, marginBottom: '1rem' }}>Connexion avec un code de secours : il vous en reste {restants}.</div>}
      {user.role === 'PATIENT' && <TableauPatient user={user} />}
      {user.role === 'PRATICIEN' && <TableauPraticien user={user} />}
      {['AGENT_ADMIN', 'ADMIN', 'DIRECTION'].includes(user.role) && <TableauGestion user={user} />}
    </>
  )
}

export default function Accueil() {
  return (
    <AppLayout title="Tableau de bord">
      <Contenu />
    </AppLayout>
  )
}
