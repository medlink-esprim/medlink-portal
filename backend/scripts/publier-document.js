// US-13 : publie un document dans le dossier d'un patient (en attendant le téléversement par le
// praticien, US-25 au Sprint 4). Le fichier est chiffré et son empreinte enregistrée.
//   Fichier PDF réel (copié d'abord dans le conteneur) :
//     docker compose cp bilan.pdf api:/tmp/bilan.pdf
//     docker compose exec api node scripts/publier-document.js --email salma@exemple.tn --type resultat --titre "Bilan lipidique" --fichier /tmp/bilan.pdf
//   Document de démonstration généré (sans fichier) :
//     docker compose exec api node scripts/publier-document.js --email salma@exemple.tn --type resultat --titre "Bilan lipidique" --exemple
const fs = require('fs/promises');
const db = require('../src/db');
const { publierDocument, pdfExemple } = require('../src/services/stockage');

const TYPES = ['resultat', 'compte_rendu', 'ordonnance', 'autre'];
const TAILLE_MAX = 10 * 1024 * 1024;

function lireArguments(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--exemple') a.exemple = true;
    else if (argv[i].startsWith('--')) { a[argv[i].slice(2)] = argv[i + 1]; i += 1; }
  }
  return a;
}

(async () => {
  const a = lireArguments(process.argv.slice(2));
  if (!a.email || !a.titre || !TYPES.includes(a.type) || (!a.fichier && !a.exemple)) {
    throw new Error(`usage : --email <patient> --type <${TYPES.join('|')}> --titre "<titre>" (--fichier <chemin.pdf> | --exemple)`);
  }
  const { rows: [p] } = await db.query(
    `SELECT u.id_utilisateur, u.prenom, u.nom FROM utilisateurs u JOIN patients pa ON pa.id_utilisateur = u.id_utilisateur
      WHERE u.email = $1`,
    [a.email.toLowerCase()],
  );
  if (!p) throw new Error(`Aucun patient avec l'adresse ${a.email}`);

  let contenu;
  if (a.exemple) {
    contenu = pdfExemple(a.titre, [`Patient : ${p.prenom} ${p.nom}`, `Date : ${new Date().toLocaleDateString('fr-FR')}`,
      'Document de demonstration genere par MedLink (donnees fictives).']);
  } else {
    contenu = await fs.readFile(a.fichier);
    if (contenu.length > TAILLE_MAX) throw new Error('Fichier trop volumineux (10 Mo maximum)');
    if (contenu.subarray(0, 5).toString('latin1') !== '%PDF-') throw new Error('Seuls les fichiers PDF sont acceptés');
  }
  const id = await publierDocument({ idPatient: p.id_utilisateur, type: a.type, titre: a.titre.slice(0, 120), contenu });
  console.log(`Document publié pour ${p.prenom} ${p.nom} : ${id} (${contenu.length} octets, chiffré)`);
  await db.pool.end();
})().catch(async (err) => {
  console.error('Erreur :', err.message);
  await db.pool.end();
  process.exit(1);
});
