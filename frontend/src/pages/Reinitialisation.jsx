// US-03 : nouveau mot de passe depuis le lien de réinitialisation
import NouveauMotDePasse from './NouveauMotDePasse.jsx'

export default function Reinitialisation() {
  return <NouveauMotDePasse title="Nouveau mot de passe" endpoint="/auth/reinitialisation" successText="Mot de passe modifié." />
}
