#!/usr/bin/env node
// US-63 : temps de chargement des pages principales (objectif : moins de 2 secondes).
//   node deploy/perf/mesurer.mjs https://medlink-esprit.francecentral.cloudapp.azure.com [email] [mot de passe]
// Pour chaque page : HTML + scripts et feuilles de style qu'il référence (en parallèle, comme le navigateur),
// puis les appels d'API que la page fait au chargement. Avec un compte patient, les pages connectées sont mesurées.
// 5 mesures par page, médiane retenue. Code de sortie 1 si une page dépasse 2 000 ms.
const [, , base = 'http://localhost:8080', email, motDePasse] = process.argv;
const SEUIL = 2000; const ESSAIS = 5;
let cookie = '';

async function charger(url) {
  const t = performance.now();
  const r = await fetch(new URL(url, base), { headers: { cookie, 'accept-encoding': 'gzip, br' }, redirect: 'manual' });
  const corps = await r.text();
  return { ms: performance.now() - t, statut: r.status, corps, octets: corps.length };
}

async function page(chemin, apis = []) {
  const html = await charger(chemin);
  const ressources = [...html.corps.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
  const t = performance.now();
  await Promise.all(ressources.map(charger));
  await Promise.all(apis.map(charger));
  return html.ms + (performance.now() - t);
}

async function mesurer(nom, chemin, apis) {
  const temps = [];
  for (let i = 0; i < ESSAIS; i += 1) temps.push(await page(chemin, apis));
  temps.sort((a, b) => a - b);
  const mediane = Math.round(temps[Math.floor(ESSAIS / 2)]);
  console.log(`${mediane <= SEUIL ? 'OK ' : 'LENT'}  ${String(mediane).padStart(5)} ms  ${nom}`);
  return mediane;
}

const resultats = [];
console.log(`Mesure de ${base} (médiane de ${ESSAIS} chargements, objectif < ${SEUIL} ms)\n`);
resultats.push(await mesurer('Connexion', '/connexion', ['/api/horaires', '/api/maintenance/annonce']));
resultats.push(await mesurer('Inscription', '/inscription', ['/api/horaires']));
if (email && motDePasse) {
  const r = await fetch(new URL('/api/auth/login', base), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: motDePasse }) });
  cookie = (r.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');
  if (!r.ok || !cookie) { console.error(`Connexion impossible (${r.status})`); process.exit(2); }
  resultats.push(await mesurer('Tableau de bord', '/accueil', ['/api/auth/me']));
  resultats.push(await mesurer('Mes rendez-vous', '/patient/rendez-vous', ['/api/auth/me', '/api/patients/moi/rendez-vous']));
  resultats.push(await mesurer('Prendre rendez-vous', '/patient/rendez-vous/nouveau', ['/api/auth/me', '/api/praticiens/filtres', '/api/praticiens']));
  resultats.push(await mesurer('Mes résultats', '/patient/resultats', ['/api/auth/me', '/api/patients/moi/documents']));
  resultats.push(await mesurer('Mon profil', '/patient/profil', ['/api/auth/me', '/api/patients/moi', '/api/patients/moi/acces']));
}
const max = Math.max(...resultats);
console.log(`\nPage la plus lente : ${max} ms — ${max <= SEUIL ? 'objectif atteint' : 'OBJECTIF NON ATTEINT'}`);
process.exit(max <= SEUIL ? 0 : 1);
