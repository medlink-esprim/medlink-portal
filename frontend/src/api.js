// Appel de l'API : même origine (proxy Vite / Nginx), les cookies de session suivent automatiquement.
// US-40 : si le jeton d'accès (5 min) a expiré, il est renouvelé une fois avec le jeton de
// rafraîchissement, puis la requête est rejouée. Chaque appel réussi relance le minuteur d'inactivité.
export const EVENEMENT_ACTIVITE = 'medlink:activite'

let refreshEnCours = null

// fichier (US-25) : envoyé tel quel (ex. PDF), avec ses propres en-têtes ; sinon corps JSON
async function appel(path, method, body, fichier, entetes = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: fichier ? { 'Content-Type': fichier.type || 'application/octet-stream', ...entetes } : body ? { 'Content-Type': 'application/json' } : {},
    body: fichier || (body ? JSON.stringify(body) : undefined),
    credentials: 'same-origin',
  })
  let data = null
  try { data = await res.json() } catch { /* réponse vide (204) */ }
  return { ok: res.ok, status: res.status, data }
}

export async function api(path, { method = 'GET', body, fichier, entetes } = {}) {
  let res = await appel(path, method, body, fichier, entetes)
  if (res.status === 401 && res.data?.code === 'ACCES_EXPIRE') {
    // plusieurs appels simultanés partagent le même rafraîchissement
    refreshEnCours = refreshEnCours || appel('/auth/refresh', 'POST').finally(() => { refreshEnCours = null })
    const refresh = await refreshEnCours
    if (refresh.ok) res = await appel(path, method, body, fichier, entetes)
  }
  if (res.ok) window.dispatchEvent(new Event(EVENEMENT_ACTIVITE))
  return res
}
