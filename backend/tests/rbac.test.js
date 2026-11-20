// US-62 : scénarios d'accès de chaque rôle (RBAC). Chaque route protégée est appelée par les cinq rôles
// et sans session : la route répond (≠ 401/403) pour les rôles autorisés, 403 pour les autres, 401 sans session.
// S'y ajoutent les accès « horizontaux » : un patient ou un praticien ne voit jamais le dossier d'un autre.
//   docker compose exec api npx jest tests/rbac.test.js
const request = require('supertest');
const { app, db, creerPatient, creerPraticien, creerAgent, creerAdmin, creerDirection, connecter, creerRdv, nettoyer } = require('./outils');
const { publierDocument, pdfExemple } = require('../src/services/stockage');

const ROLES = ['PATIENT', 'PRATICIEN', 'AGENT_ADMIN', 'ADMIN', 'DIRECTION'];
const P = 'PATIENT'; const PR = 'PRATICIEN'; const AG = 'AGENT_ADMIN'; const AD = 'ADMIN'; const DI = 'DIRECTION';

// [méthode, URL, rôles autorisés] — la matrice de la base (role_permission), route par route
const MATRICE = [
  ['get', '/api/patients/moi', [P]],
  ['get', '/api/patients/moi/rendez-vous', [P]],
  ['get', '/api/patients/moi/documents', [P]],
  ['get', '/api/patients/moi/acces', [P]],
  ['get', '/api/patients/moi/demandes', [P]],
  ['get', '/api/praticiens/filtres', [P]],
  ['get', '/api/praticiens', [P]],
  ['get', '/api/creneaux', [P]],
  ['get', '/api/disponibilites', [PR]],
  ['get', '/api/disponibilites/absences', [PR]],
  ['get', '/api/praticien/patients', [PR]],
  ['get', '/api/praticien/agenda', [PR]],
  ['get', '/api/praticien/alertes', [PR]],
  ['get', '/api/accueil/contexte', [AG]],
  ['get', '/api/accueil/patients?q=ben', [AG]],
  ['get', '/api/comptes/recherche', [AG, AD]],
  ['get', '/api/comptes/cliniques', [AG, AD]],
  ['get', '/api/admin/roles', [AD]],
  ['get', '/api/admin/audit', [AD]],
  ['get', '/api/admin/audit/alertes', [AD]],
  ['get', '/api/admin/audit/export.csv', [AD]],
  ['get', '/api/admin/demandes', [AD]],
  ['get', '/api/maintenance', [AD]],
  ['get', '/api/statistiques/supervision', [AG, AD, DI]],
  ['get', '/api/statistiques/export.csv', [AG, DI]],
  ['get', '/api/statistiques/synthese', [AD, DI]],
  ['get', '/api/statistiques/appels', [AD, DI]],
];

const comptes = {}; const sessions = {}; let nour; let drSfax; let rdvSalma; let docSalma;

beforeAll(async () => {
  comptes.PATIENT = await creerPatient('Salma', 'Ben Ali');
  comptes.PRATICIEN = await creerPraticien('Cardiologie', ['Sousse']);
  comptes.AGENT_ADMIN = await creerAgent('Sousse');
  comptes.ADMIN = await creerAdmin();
  comptes.DIRECTION = await creerDirection();
  nour = await creerPatient('Nour', 'Hammami');
  drSfax = await creerPraticien('Dermatologie', ['Sfax'], 'Leila', 'Gharbi');
  rdvSalma = (await creerRdv(comptes.PATIENT, comptes.PRATICIEN, { dansJours: 5 })).idRdv;
  docSalma = await publierDocument({ idPatient: comptes.PATIENT.id, type: 'resultat', titre: 'Bilan', contenu: pdfExemple('Bilan') });
  for (const r of ROLES) sessions[r] = await connecter(comptes[r]);
  jest.spyOn(console, 'warn').mockImplementation(() => {});   // refus journalisés (ACCES_REFUSE)
});

afterAll(async () => {
  console.warn.mockRestore();
  await nettoyer(...Object.values(comptes), nour, drSfax);
  await db.pool.end();
});

const scenarios = MATRICE.flatMap(([m, url, autorises]) => ROLES.map((r) => [m, url, r, autorises.includes(r)]));

test.each(scenarios)('%s %s par %s : autorisé = %s', async (m, url, role, autorise) => {
  const res = await sessions[role][m](url);
  if (autorise) expect([401, 403]).not.toContain(res.status);
  else expect(res.status).toBe(403);
});

test.each(MATRICE.map(([m, url]) => [m, url]))('%s %s sans session : 401', async (m, url) => {
  expect((await request(app)[m](url)).status).toBe(401);
});

describe('accès horizontaux (dossier d\'un autre)', () => {
  test('un autre patient ne lit ni le rendez-vous ni le document de Salma', async () => {
    const autre = await connecter(nour);
    expect((await autre.get(`/api/rendez-vous/${rdvSalma}`)).status).toBe(403);
    expect((await autre.get(`/api/documents/${docSalma}/fichier`)).status).toBe(403);
    expect((await sessions.PATIENT.get(`/api/documents/${docSalma}/fichier`)).status).toBe(200);
  });

  test('un praticien sans relation de soins ne voit pas le dossier ; son praticien oui', async () => {
    const autreDr = await connecter(drSfax);
    expect((await autreDr.get(`/api/praticien/patients/${comptes.PATIENT.id}/dossier`)).status).toBe(403);
    expect((await autreDr.get(`/api/praticien/patients/${comptes.PATIENT.id}/comptes-rendus`)).status).toBe(403);
    expect((await autreDr.get(`/api/documents/${docSalma}/fichier`)).status).toBe(403);
    expect((await sessions.PRATICIEN.get(`/api/praticien/patients/${comptes.PATIENT.id}/dossier`)).status).toBe(200);
  });

  test('le personnel administratif ne lit aucun document médical', async () => {
    for (const r of [AG, AD, DI]) {
      expect((await sessions[r].get(`/api/documents/${docSalma}/fichier`)).status).toBe(403);
      expect((await sessions[r].get(`/api/rendez-vous/${rdvSalma}`)).status).toBe(403);
    }
  });

  test('chaque refus est journalisé (ACCES_REFUSE)', () => {
    expect(console.warn.mock.calls.filter(([l]) => String(l).includes('ACCES_REFUSE')).length).toBeGreaterThan(50);
  });
});
