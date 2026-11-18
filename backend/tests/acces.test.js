// US-47 : journal des accès aux dossiers médicaux (intégration, base et volume « documents » requis)
//   docker compose exec api npx jest tests/acces.test.js
const fs = require('fs/promises');
const { db, creerPatient, connecter, nettoyer } = require('./outils');
const { publierDocument, pdfExemple, cheminAbsolu } = require('../src/services/stockage');

let patient; let idDoc;

beforeAll(async () => {
  patient = await creerPatient();
  idDoc = await publierDocument({ idPatient: patient.id, type: 'resultat', titre: 'NFS', contenu: pdfExemple('NFS') });
});

afterAll(async () => {
  await fs.rm(cheminAbsolu(`${idDoc}.enc`), { force: true });
  await nettoyer(patient);
  await db.pool.end();
});

test('US-47 : un téléchargement autorisé écrit une ligne (qui, quoi, quand) avant l\'envoi', async () => {
  const a = await connecter(patient);
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  expect((await a.get(`/api/documents/${idDoc}/fichier`)).status).toBe(200);
  expect((await a.get(`/api/documents/${idDoc}/fichier?inline=1`)).status).toBe(200);
  expect(warn.mock.calls.map((c) => JSON.parse(c[0])).some((l) => l.evenement === 'ACCES_DOSSIER' && l.document === idDoc)).toBe(true);
  warn.mockRestore();

  const { rows } = await db.query(
    'SELECT id_utilisateur, role, id_document, action, date_acces FROM journal_acces_dossiers WHERE id_patient = $1 ORDER BY id_acces',
    [patient.id],
  );
  expect(rows).toEqual([
    expect.objectContaining({ id_utilisateur: patient.id, role: 'PATIENT', id_document: idDoc, action: 'telechargement_document' }),
    expect.objectContaining({ id_utilisateur: patient.id, role: 'PATIENT', id_document: idDoc, action: 'consultation_document' }),
  ]);
  expect(Date.now() - new Date(rows[0].date_acces).getTime()).toBeLessThan(60000);
});

test('US-47 : le patient voit qui a accédé à son dossier', async () => {
  const a = await connecter(patient);
  const res = await a.get('/api/patients/moi/acces');
  expect(res.status).toBe(200);
  expect(res.body[0]).toMatchObject({ auteur: 'Vous', action: 'consultation_document', document: 'NFS' });
});

test('US-47 : le journal est en ajout seul (ni modification ni suppression)', async () => {
  await expect(db.query('DELETE FROM journal_acces_dossiers WHERE id_patient = $1', [patient.id])).rejects.toThrow(/ajout seul/);
  await expect(db.query("UPDATE journal_acces_dossiers SET action = 'consultation_dossier' WHERE id_patient = $1", [patient.id]))
    .rejects.toThrow(/ajout seul/);
});

test('US-47 : un accès refusé n\'écrit rien dans le journal des accès', async () => {
  const autre = await creerPatient('Amine', 'Jaziri');
  const b = await connecter(autre);
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  expect((await b.get(`/api/documents/${idDoc}/fichier`)).status).toBe(403);
  warn.mockRestore();
  const { rows } = await db.query('SELECT count(*)::int AS n FROM journal_acces_dossiers WHERE id_utilisateur = $1', [autre.id]);
  expect(rows[0].n).toBe(0);
  await nettoyer(autre);
});
