// Jeu d'icônes de l'interface (SVG en ligne, trait 2 px, sans dépendance ni requête externe : compatible CSP).
// <Icone nom="calendrier" /> — taille et couleur héritées du CSS (width/height, currentColor).
const P = (d) => ({ d })
const C = (cx, cy, r) => ({ cx, cy, r })
const R = (x, y, width, height, rx = 2) => ({ x, y, width, height, rx })

const ICONES = {
  accueil: [P('M3 10.5 12 3l9 7.5'), P('M5 9.5V20h14V9.5'), P('M10 20v-5.5h4V20')],
  calendrier: [R(3, 4.5, 18, 16.5), P('M16 2.5v4M8 2.5v4M3 10h18')],
  calendrierPlus: [R(3, 4.5, 18, 16.5), P('M16 2.5v4M8 2.5v4M3 10h18'), P('M12 13v5M9.5 15.5h5')],
  document: [P('M14 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8z'), P('M14 2.5V8h5.5'), P('M8.5 13h7M8.5 17h5')],
  utilisateur: [C(12, 8, 4), P('M4 21c.6-3.8 3.9-6 8-6s7.4 2.2 8 6')],
  utilisateurs: [C(9, 8, 3.5), P('M2.5 20.5c.4-3.3 3.1-5.5 6.5-5.5s6.1 2.2 6.5 5.5'), P('M15.5 4.7a3.5 3.5 0 0 1 0 6.6'), P('M18 15c2 .8 3.3 2.7 3.5 5.5')],
  stethoscope: [P('M6 3H4.5v5.5a5 5 0 0 0 10 0V3H13'), P('M9.5 13.5V15a5.5 5.5 0 0 0 11 0v-2'), C(20.5, 11, 2)],
  horloge: [C(12, 12, 9), P('M12 7v5l3.2 2')],
  activite: [P('M3 12h4l2.5-7 5 14 2.5-7h4')],
  bouclier: [P('M12 3 4.5 6v5.5c0 4.7 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.8 7.5-9.5V6z'), P('M9 12l2 2 4-4')],
  reglages: [P('M4 7h9M17 7h3M4 17h3M11 17h9'), C(15, 7, 2), C(9, 17, 2)],
  deconnexion: [P('M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3'), P('M10 17l-5-5 5-5'), P('M5 12h11')],
  cloche: [P('M6 9a6 6 0 0 1 12 0c0 6.5 2.5 8 2.5 8h-17S6 15.5 6 9'), P('M10 20.5a2 2 0 0 0 4 0')],
  graphique: [P('M4 20V11M10 20V5M16 20v-7M21.5 20h-19')],
  tendance: [P('M3 17l6-6 4 4 8-8'), P('M15 7h6v6')],
  clinique: [R(4, 3, 16, 18), P('M12 7v5M9.5 9.5h5'), P('M9.5 21v-4h5v4')],
  outil: [P('M14.7 6.3a4 4 0 0 0-5.4 5.4L3.5 17.5l3 3 5.8-5.8a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-2.4z')],
  boite: [P('M3 13.5h5l2 3h4l2-3h5'), P('M5.5 5h13l2.5 8.5V19a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-5.5z')],
  fleche: [P('M5 12h14M13 6l6 6-6 6')],
  recherche: [C(11, 11, 7), P('M20.5 20.5 16 16')],
  plus: [P('M12 5v14M5 12h14')],
  menu: [P('M4 6.5h16M4 12h16M4 17.5h16')],
  lieu: [P('M12 21s-7-6.2-7-11.2a7 7 0 0 1 14 0C19 14.8 12 21 12 21z'), C(12, 10, 2.5)],
  coeur: [P('M20.5 5.7a5.3 5.3 0 0 0-7.6 0L12 6.6l-.9-.9a5.3 5.3 0 0 0-7.6 7.6L12 21.5l8.5-8.2a5.3 5.3 0 0 0 0-7.6z'), P('M5 12.5h3.5l1.5-2.5 2.5 5 1.5-2.5H19')],
  cadenas: [R(5, 11, 14, 10), P('M8 11V7.5a4 4 0 0 1 8 0V11')],
  valide: [P('M5 12.5l4.5 4.5L19.5 7')],
  attention: [P('M12 3.5 2.5 20h19z'), P('M12 10v4.5M12 17.5h.01')],
  cle: [C(7.5, 15.5, 4.5), P('M10.8 12.2 20 3M16.5 6.5l3 3')],
  telecharger: [P('M12 3.5v11.5M7 10.5l5 5 5-5M4.5 20.5h15')],
  courrier: [R(3, 5, 18, 14), P('M3.5 6.5 12 13l8.5-6.5')],
}

export default function Icone({ nom, className, titre }) {
  const formes = ICONES[nom] || ICONES.document
  return (
    <svg className={className} viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden={titre ? undefined : 'true'} role={titre ? 'img' : undefined} aria-label={titre}>
      {formes.map((f, i) => {
        if (f.d) return <path key={i} d={f.d} />
        if (f.r !== undefined && f.cx !== undefined) return <circle key={i} cx={f.cx} cy={f.cy} r={f.r} />
        return <rect key={i} x={f.x} y={f.y} width={f.width} height={f.height} rx={f.rx} />
      })}
    </svg>
  )
}

// Croix médicale du logo (pleine)
export function LogoCroix() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path fill="currentColor" d="M9.5 3.5h5v6h6v5h-6v6h-5v-6h-6v-5h6z" />
    </svg>
  )
}

// Tracé d'électrocardiogramme décoratif (connexion, tableau de bord)
export function TraceEcg({ className }) {
  return (
    <svg className={className} viewBox="0 0 420 90" preserveAspectRatio="none" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M0 55h90l12-18 12 18h40l10-45 16 75 12-50 10 20h60l10-12 10 12h128" />
    </svg>
  )
}
