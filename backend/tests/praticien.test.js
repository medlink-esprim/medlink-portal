// Espace praticien du Sprint 4 (intégration, base requise)
//   docker compose exec api npx jest tests/praticien.test.js
const fs = require('fs/promises');
const { db, creerPatient, creerPraticien, connecter, creerRdv, nettoyer } = require('./outils');
const { publierDocument, pdfExemple, cheminAbsolu, lireDocument } = require('../src/services/stockage');

let dr; let autreDr; let salma; let amine; let nour; let agentDr; let rdvSalma; let rdvAmine;
const fichiers = [];

beforeAll(async () => {
  dr = await creerPraticien('Cardiologie', ['Sousse', 'Sfax']);
  autreDr = await creerPraticien('Dermatologie', ['Tunis'], 'Leila', 'Gharbi');
  salma = await creerPatient('Salma', 'Ben Ali');
  amine = await creerPatient('Amine', 'Jaziri');
  nour = await creerPatient('Nour', 'Hammami');
  rdvSalma = (await creerRdv(salma, dr, { dansJours: -20, statut: 'honore' })).idRdv;
  rdvAmine = (await creerRdv(amine, dr, { ville: 'Sfax', dansJours: 3 })).idRdv;
  await creerRdv(nour, autreDr, { ville: 'Tunis', dansJours: 2 });   // patiente d'un autre praticien
  agentDr = await connecter(dr);
});

afterAll(async () => {
  for (const id of fichiers) await fs.rm(cheminAbsolu(`${id}.enc`), { force: true });
  await nettoyer(dr, autreDr, salma, amine, nour);
  await db.pool.end();
});

test('US-22 : le praticien ne voit que ses propres patients', async () => {
  const res = await agentDr.get('/api/praticien/patients');
  expect(res.status).toBe(200);
  const ids = res.body.map((p) => p.id_patient);
  expect(ids).toEqual(expect.arrayContaining([salma.id, amine.id]));
  expect(ids).not.toContain(nour.id);
});

test('US-22 : recherche par nom (insensible à la casse) et par numéro de dossier', async () => {
  const parNom = await agentDr.get('/api/praticien/patients?q=ben%20ali');
  expect(parNom.body.map((p) => p.id_patient)).toEqual([salma.id]);

  const { rows: [p] } = await db.query('SELECT numero_dossier FROM patients WHERE id_utilisateur = $1', [amine.id]);
  const parNumero = await agentDr.get(`/api/praticien/patients?q=${encodeURIComponent(p.numero_dossier)}`);
  expect(parNumero.body).toEqual([expect.objectContaining({ id_patient: amine.id, numero_dossier: p.numero_dossier })]);
  expect(parNumero.body[0].prochain_rdv).toBeTruthy();

  // la patiente d'un autre praticien n'est jamais trouvée, même par son nom exact
  expect((await agentDr.get('/api/praticien/patients?q=Hammami')).body).toEqual([]);
  // % et _ sont cherchés tels quels
  expect((await agentDr.get('/api/praticien/patients?q=%25')).body).toEqual([]);
});

test('US-22 : un patient n\'a pas accès à la recherche des praticiens', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  expect((await (await connecter(salma)).get('/api/praticien/patients')).status).toBe(403);
  warn.mockRestore();
});

test('US-23 / US-47 : dossier du patient reçu, accès écrit dans le journal', async () => {
  const idDoc = await publierDocument({ idPatient: salma.id, type: 'resultat', titre: 'Bilan lipidique', contenu: pdfExemple('Bilan') });
  fichiers.push(idDoc);
  const avant = (await db.query('SELECT count(*)::int AS n FROM journal_acces_dossiers WHERE id_patient = $1', [salma.id])).rows[0].n;

  const res = await agentDr.get(`/api/praticien/patients/${salma.id}/dossier`);
  expect(res.status).toBe(200);
  expect(res.body.patient).toMatchObject({ id_patient: salma.id, nom: 'Ben Ali', prenom: 'Salma' });
  expect(res.body.rendezVous).toEqual([expect.objectContaining({ statut: 'honore', motif: 'Contrôle annuel', ville: 'Sousse' })]);
  expect(res.body.documents).toEqual([expect.objectContaining({ id_document: idDoc, titre: 'Bilan lipidique' })]);

  const { rows } = await db.query(
    'SELECT id_utilisateur, role, action FROM journal_acces_dossiers WHERE id_patient = $1 ORDER BY id_acces DESC LIMIT 1',
    [salma.id],
  );
  expect(rows[0]).toEqual({ id_utilisateur: dr.id, role: 'PRATICIEN', action: 'consultation_dossier' });
  expect((await db.query('SELECT count(*)::int AS n FROM journal_acces_dossiers WHERE id_patient = $1', [salma.id])).rows[0].n).toBe(avant + 1);

  // le praticien peut ouvrir le document de son patient ; l'accès est journalisé
  const doc = await agentDr.get(`/api/documents/${idDoc}/fichier?inline=1`);
  expect(doc.status).toBe(200);
  const { rows: [j] } = await db.query('SELECT action, id_document FROM journal_acces_dossiers WHERE id_utilisateur = $1 ORDER BY id_acces DESC LIMIT 1', [dr.id]);
  expect(j).toEqual({ action: 'consultation_document', id_document: idDoc });

  // le patient voit cet accès dans « Mon profil »
  const vu = await (await connecter(salma)).get('/api/patients/moi/acces');
  expect(vu.body.some((a) => a.action === 'consultation_dossier' && a.auteur === 'Dr Karim Trabelsi')).toBe(true);
});

test('US-23 : sans rendez-vous avec le patient => 403 journalisé, aucune donnée', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const res = await agentDr.get(`/api/praticien/patients/${nour.id}/dossier`);
  expect(res.status).toBe(403);
  expect(res.body).toEqual({ message: 'Accès interdit' });
  expect(JSON.parse(warn.mock.calls.at(-1)[0])).toMatchObject({ evenement: 'ACCES_REFUSE', utilisateur: dr.id });

  const idDoc = await publierDocument({ idPatient: nour.id, type: 'resultat', titre: 'Glycémie', contenu: pdfExemple('G') });
  fichiers.push(idDoc);
  expect((await agentDr.get(`/api/documents/${idDoc}/fichier`)).status).toBe(403);
  warn.mockRestore();
  const { rows } = await db.query('SELECT count(*)::int AS n FROM journal_acces_dossiers WHERE id_utilisateur = $1 AND id_patient = $2', [dr.id, nour.id]);
  expect(rows[0].n).toBe(0);
  expect((await agentDr.get('/api/praticien/patients/pas-un-uuid/dossier')).status).toBe(404);
});

test('US-24 : compte-rendu chiffré, visible du patient en PDF, rendez-vous honoré', async () => {
  const passe = (await creerRdv(salma, dr, { dansJours: -2 })).idRdv;   // consultation passée, encore « planifiée »
  const texte = 'Essoufflement à l\'effort. ECG normal, tension 12/8.\nConduite : bilan lipidique, contrôle dans 3 mois.';
  const res = await agentDr.post(`/api/praticien/rendez-vous/${passe}/compte-rendu`).send({ contenu: texte });
  expect(res.status).toBe(201);
  expect(res.body.idDocument).toBeTruthy();
  fichiers.push(res.body.idDocument);

  const { rows: [cr] } = await db.query('SELECT contenu_chiffre FROM comptes_rendus WHERE id_compte_rendu = $1', [res.body.id]);
  expect(cr.contenu_chiffre.toString('latin1')).not.toContain('ECG');   // chiffré au repos (US-43)
  const { rows: [r] } = await db.query('SELECT statut FROM rendez_vous WHERE id_rdv = $1', [passe]);
  expect(r.statut).toBe('honore');

  // le patient le voit dans « Mes résultats »
  const docs = (await (await connecter(salma)).get('/api/patients/moi/documents')).body;
  const doc = docs.find((d) => d.id_document === res.body.idDocument);
  expect(doc).toMatchObject({ type: 'compte_rendu' });
  const { rows: [ligne] } = await db.query('SELECT * FROM documents_medicaux WHERE id_document = $1', [res.body.idDocument]);
  expect(ligne.id_auteur).toBe(dr.id);
  expect((await lireDocument(ligne)).toString('latin1')).toContain('ECG normal');

  // le praticien le relit dans le dossier
  const dossier = await agentDr.get(`/api/praticien/patients/${salma.id}/dossier`);
  expect(dossier.body.rendezVous.find((x) => x.id_rdv === passe).compteRendu).toMatchObject({ contenu: texte, visiblePatient: true });

  // un seul compte-rendu par consultation
  expect((await agentDr.post(`/api/praticien/rendez-vous/${passe}/compte-rendu`).send({ contenu: texte })).status).toBe(409);
});

test('US-24 : non visible du patient => aucun document publié', async () => {
  const res = await agentDr.post(`/api/praticien/rendez-vous/${rdvSalma}/compte-rendu`).send({ contenu: 'Note interne au praticien.', visiblePatient: false });
  expect(res.status).toBe(201);
  expect(res.body.idDocument).toBeNull();
});

test('US-24 : consultation future => 422 ; rendez-vous d\'un autre praticien => 403', async () => {
  expect((await agentDr.post(`/api/praticien/rendez-vous/${rdvAmine}/compte-rendu`).send({ contenu: 'Trop tôt pour un compte-rendu.' })).status).toBe(422);
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const autre = await connecter(autreDr);
  expect((await autre.post(`/api/praticien/rendez-vous/${rdvAmine}/compte-rendu`).send({ contenu: 'Pas mon patient du tout.' })).status).toBe(403);
  expect((await (await connecter(salma)).post(`/api/praticien/rendez-vous/${rdvAmine}/compte-rendu`).send({ contenu: 'Je suis patiente ici.' })).status).toBe(403);
  warn.mockRestore();
  expect((await agentDr.post(`/api/praticien/rendez-vous/${rdvAmine}/compte-rendu`).send({ contenu: 'court' })).status).toBe(400);
});

const envoyerPdf = (agent, idPatient, contenu, { type = 'resultat', titre = 'Bilan lipidique' } = {}) => agent
  .post(`/api/praticien/patients/${idPatient}/documents`)
  .set('Content-Type', 'application/pdf')
  .set('X-Document-Type', type)
  .set('X-Document-Titre', encodeURIComponent(titre))
  .send(contenu);

test('US-25 : publication d\'un résultat, visible et notifié au patient (sans donnée médicale)', async () => {
  const pdf = pdfExemple('Bilan lipidique', ['Cholestérol total : 2,10 g/L']);
  const res = await envoyerPdf(agentDr, amine.id, pdf, { titre: 'Bilan lipidique — novembre' });
  expect(res.status).toBe(201);
  fichiers.push(res.body.idDocument);

  const docs = (await (await connecter(amine)).get('/api/patients/moi/documents')).body;
  expect(docs).toEqual([expect.objectContaining({ id_document: res.body.idDocument, type: 'resultat', titre: 'Bilan lipidique — novembre' })]);
  const { rows: [ligne] } = await db.query('SELECT * FROM documents_medicaux WHERE id_document = $1', [res.body.idDocument]);
  expect((await lireDocument(ligne)).equals(pdf)).toBe(true);
  expect(ligne.id_auteur).toBe(dr.id);

  const { rows: notif } = await db.query("SELECT canal, statut FROM notifications WHERE id_destinataire = $1 AND type = 'resultat'", [amine.id]);
  expect(notif).toEqual([{ canal: 'email', statut: 'envoyee' }]);
  const { rows: [j] } = await db.query("SELECT action FROM journal_acces_dossiers WHERE id_document = $1", [res.body.idDocument]);
  expect(j.action).toBe('publication_document');
});

test('US-25 : refus d\'un fichier qui n\'est pas un PDF, d\'un titre absent, d\'un fichier trop gros', async () => {
  expect((await envoyerPdf(agentDr, amine.id, Buffer.from('MZ pas un pdf'))).status).toBe(415);
  expect((await envoyerPdf(agentDr, amine.id, pdfExemple('x'), { titre: '' })).status).toBe(400);
  expect((await envoyerPdf(agentDr, amine.id, pdfExemple('x'), { type: 'virus' })).status).toBe(400);
  const gros = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(11 * 1024 * 1024)]);
  expect((await envoyerPdf(agentDr, amine.id, gros)).status).toBe(413);
  const json = await agentDr.post(`/api/praticien/patients/${amine.id}/documents`).send({ contenu: 'x' });
  expect(json.status).toBe(415);
});

test('US-25 : pas de publication sans relation de soins ni par un patient', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  expect((await envoyerPdf(agentDr, nour.id, pdfExemple('x'))).status).toBe(403);
  expect((await envoyerPdf(await connecter(amine), amine.id, pdfExemple('x'))).status).toBe(403);
  warn.mockRestore();
});
