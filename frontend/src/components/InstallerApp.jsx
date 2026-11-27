// Application installable (PWA) : bouton « Installer l'application » quand le navigateur le permet
// (Chrome, Edge, Android) ; sur iPhone, rappel du geste Partager → « Sur l'écran d'accueil ».
import { useEffect, useState } from 'react'
import Icone from './Icone.jsx'

const dejaInstallee = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
const estIos = () => /iphone|ipad|ipod/i.test(window.navigator.userAgent)

export default function InstallerApp({ className = '' }) {
  const [invite, setInvite] = useState(null)
  const [aideIos, setAideIos] = useState(false)
  const [installee, setInstallee] = useState(dejaInstallee())

  useEffect(() => {
    const surInvite = (e) => { e.preventDefault(); setInvite(e) }
    const surInstallee = () => { setInstallee(true); setInvite(null) }
    window.addEventListener('beforeinstallprompt', surInvite)
    window.addEventListener('appinstalled', surInstallee)
    return () => {
      window.removeEventListener('beforeinstallprompt', surInvite)
      window.removeEventListener('appinstalled', surInstallee)
    }
  }, [])

  if (installee || (!invite && !estIos())) return null

  async function installer() {
    if (!invite) { setAideIos((v) => !v); return }
    invite.prompt()
    await invite.userChoice
    setInvite(null)
  }

  return (
    <div className={`installer-app ${className}`}>
      <button type="button" className="btn-installer" onClick={installer}>
        <Icone nom="telephone" />Installer l'application
      </button>
      {aideIos && (
        <p className="aide-ios">Dans Safari, touchez <strong>Partager</strong> puis <strong>Sur l'écran d'accueil</strong>.</p>
      )}
    </div>
  )
}
