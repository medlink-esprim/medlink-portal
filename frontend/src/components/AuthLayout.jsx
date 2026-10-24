// Mise en page commune des écrans d'authentification (cf. maquettes)
export default function AuthLayout({ title, subtitle, children }) {
  return (
    <div className="auth-bg">
      <main className="auth-card">
        <div className="logo"><span className="logo-mark">+</span>MedLink</div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
        {children}
      </main>
    </div>
  )
}
