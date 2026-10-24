// Appel de l'API : même origine (proxy Vite / Nginx), le cookie de session suit automatiquement.
export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  })
  let data = null
  try { data = await res.json() } catch { /* réponse vide (204) */ }
  return { ok: res.ok, status: res.status, data }
}
