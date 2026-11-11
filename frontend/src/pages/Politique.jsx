// US-04 : politique de protection des données personnelles (lue avant de consentir)
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import AuthLayout from '../components/AuthLayout.jsx'

export default function Politique() {
  const [p, setP] = useState(null)
  useEffect(() => { api('/auth/politique').then((res) => res.ok && setP(res.data)) }, [])

  return (
    <AuthLayout title="Protection de vos données" subtitle={p ? `Politique version ${p.version} du ${p.date.split('-').reverse().join('/')}` : ''}>
      <div className="politique">
        <h3>Responsable du traitement</h3>
        <p>Le réseau de cliniques MedLink (Sousse, Sfax, Tunis), conformément à la loi organique n° 2004-63 portant sur la protection des données à caractère personnel, sous le contrôle de l'Instance nationale de protection des données personnelles (INPDP).</p>
        <h3>Données traitées et finalités</h3>
        <p>Identité, coordonnées, rendez-vous, motifs de consultation, comptes-rendus et résultats d'examens, uniquement pour gérer vos rendez-vous, votre dossier médical et vous envoyer les notifications que vous avez choisies.</p>
        <h3>Qui peut y accéder</h3>
        <p>Vous-même et les praticiens qui vous suivent. Le personnel administratif n'a pas accès aux données médicales. Aucune donnée n'est vendue ni utilisée à des fins commerciales.</p>
        <h3>Sécurité</h3>
        <p>Connexion chiffrée (HTTPS), données médicales chiffrées (AES-256), mots de passe jamais stockés en clair, accès journalisés, hébergement sur un serveur dédié.</p>
        <h3>Durée de conservation</h3>
        <p>Pendant la durée de votre suivi, puis selon les durées légales applicables aux dossiers médicaux.</p>
        <h3>Vos droits</h3>
        <p>Accès, rectification et opposition : depuis la page « Mon profil » ou auprès de l'accueil de votre clinique. Vous pouvez aussi saisir l'INPDP.</p>
        <p className="muted">Chaque consentement est enregistré avec sa date, la version de cette politique et l'adresse IP utilisée.</p>
      </div>
      <p className="center"><Link to="/inscription">Retour à l'inscription</Link></p>
    </AuthLayout>
  )
}
