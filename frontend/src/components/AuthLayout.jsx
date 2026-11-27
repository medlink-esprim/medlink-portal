// Mise en page commune des écrans d'authentification : panneau de présentation + carte du formulaire.
import Icone, { LogoCroix, TraceEcg } from './Icone.jsx'
import InstallerApp from './InstallerApp.jsx'

const POINTS = [
  ['calendrierPlus', 'Rendez-vous en ligne, 24 h sur 24 dans les trois cliniques'],
  ['document', 'Résultats et comptes-rendus dans votre dossier'],
  ['bouclier', 'Données de santé chiffrées, chaque accès est tracé'],
]

export default function AuthLayout({ title, subtitle, children }) {
  return (
    <div className="auth-bg">
      <aside className="auth-hero">
        <div className="logo logo-light"><span className="logo-mark"><LogoCroix /></span>MedLink</div>
        <div>
          <h2>Votre santé, vos rendez-vous, au même endroit.</h2>
          <p>Le portail des cliniques de Sousse, Sfax et Tunis pour les patients et les équipes soignantes.</p>
          <ul className="auth-points">
            {POINTS.map(([icone, texte]) => (
              <li key={icone}><span className="icone-pastille"><Icone nom={icone} /></span>{texte}</li>
            ))}
          </ul>
        </div>
        <div>
          <TraceEcg className="auth-ecg" />
          <p className="cliniques">Clinique de Sousse · Clinique de Sfax · Clinique de Tunis</p>
        </div>
      </aside>
      <div className="auth-form">
        <main className="auth-card">
          <div className="logo"><span className="logo-mark"><LogoCroix /></span>MedLink</div>
          <h1>{title}</h1>
          {subtitle && <p className="muted">{subtitle}</p>}
          {children}
          <InstallerApp className="installer-auth" />
        </main>
      </div>
    </div>
  )
}
