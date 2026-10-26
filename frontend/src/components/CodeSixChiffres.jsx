// Saisie d'un code à 6 chiffres en 6 cases (cf. maquette « Vérification en deux étapes »)
import { useRef } from 'react'

export default function CodeSixChiffres({ value, onChange }) {
  const refs = useRef([])
  const chiffres = value.padEnd(6, ' ').slice(0, 6).split('')

  function saisir(i, texte) {
    const propres = texte.replace(/\D/g, '')
    if (!propres) return
    const suite = (value.slice(0, i) + propres).slice(0, 6)
    onChange(suite)
    refs.current[Math.min(suite.length, 5)]?.focus()
  }

  function touche(i, e) {
    if (e.key === 'Backspace') {
      e.preventDefault()
      const pos = value.length > i ? i : Math.max(0, i - 1)
      onChange(value.slice(0, pos))
      refs.current[pos]?.focus()
    }
  }

  return (
    <div className="code6">
      {chiffres.map((c, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el }}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          aria-label={`Chiffre ${i + 1}`}
          value={c.trim()}
          onChange={(e) => saisir(i, e.target.value)}
          onKeyDown={(e) => touche(i, e)}
          onPaste={(e) => { e.preventDefault(); saisir(0, e.clipboardData.getData('text')) }}
        />
      ))}
    </div>
  )
}
