// Service worker de l'application installable (PWA).
// Règle de sécurité : aucune donnée de santé n'est mise en cache. /api/ passe toujours par le réseau ;
// seuls les fichiers publics du build (scripts, styles, icônes) et la page hors ligne sont gardés.
const VERSION = 'medlink-v1'
const HORS_LIGNE = '/hors-ligne.html'
const PRECACHE = [HORS_LIGNE, '/hors-ligne.css', '/manifest.webmanifest', '/icones/icone-192.png', '/icones/favicon.svg']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((cles) => Promise.all(cles.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return            // jamais de cache pour l'API

  // pages : toujours le réseau ; hors ligne, la page d'information
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match(HORS_LIGNE)))
    return
  }

  // fichiers du build (nom avec empreinte) et icônes : cache d'abord
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icones/')) {
    e.respondWith(
      caches.match(req).then((trouve) => trouve || fetch(req).then((rep) => {
        if (rep.ok) { const copie = rep.clone(); caches.open(VERSION).then((c) => c.put(req, copie)) }
        return rep
      })),
    )
  }
})
