// US-27 : activation d'un compte créé par le back-office
import NouveauMotDePasse from './NouveauMotDePasse.jsx'

export default function Activation() {
  return <NouveauMotDePasse title="Activer mon compte" endpoint="/auth/activation" successText="Compte activé. Vous pouvez vous connecter." />
}
