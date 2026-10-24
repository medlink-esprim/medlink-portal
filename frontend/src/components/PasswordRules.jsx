// US-42 : règles affichées en direct. Confort uniquement : l'API refait la vérification.
export const RULES = [
  { label: '12 caractères minimum', test: (p) => p.length >= 12 },
  { label: 'Une minuscule', test: (p) => /[a-z]/.test(p) },
  { label: 'Une majuscule', test: (p) => /[A-Z]/.test(p) },
  { label: 'Un chiffre', test: (p) => /[0-9]/.test(p) },
  { label: 'Un caractère spécial', test: (p) => /[^A-Za-z0-9]/.test(p) },
]

export const passwordIsValid = (p) => RULES.every((r) => r.test(p))

export default function PasswordRules({ password, serverErrors = [] }) {
  return (
    <ul className="rules">
      {RULES.map((r) => (
        <li key={r.label} className={r.test(password) ? 'ok' : 'ko'}>{r.label}</li>
      ))}
      {serverErrors
        .filter((e) => !RULES.some((r) => r.label === e))
        .map((e) => <li key={e} className="ko">{e}</li>)}
    </ul>
  )
}
