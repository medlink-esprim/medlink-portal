// Outils communs aux tests d'intégration du Sprint 2 : comptes de test créés directement en base.
const request = require('supertest');
const argon2 = require('argon2');
const app = require('../src/app');
const db = require('../src/db');
const { genererSecret, codeCourant } = require('../src/security/totp');
const { chiffrer } = require('../src/security/chiffrement');

const PASSWORD = 'Ksv!7rTq2#Lm';
const suffixe = () => `${Date.now()}.${Math.floor(Math.random() * 1e6)}`;

async function creerUtilisateur(role, prenom, nom) {
  const email = `${role.toLowerCase()}.${suffixe()}@exemple.tn`;
  const hash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
  const { rows } = await db.query(
    `INSERT INTO utilisateurs (id_role, nom, prenom, email, mot_de_passe_hash, statut, email_verifie)
     VALUES ((SELECT id_role FROM roles WHERE code = $1), $2, $3, $4, $5, 'actif', true)
     RETURNING id_utilisateur`,
    [role, nom, prenom, email, hash],
  );
  return { id: rows[0].id_utilisateur, email };
}

// Patient prêt à se connecter
async function creerPatient(prenom = 'Salma', nom = 'Ben Ali') {
  const u = await creerUtilisateur('PATIENT', prenom, nom);
  await db.query(
    "INSERT INTO patients (id_utilisateur, numero_dossier) VALUES ($1, 'P-T-' || nextval('patients_numero_seq'))",
    [u.id],
  );
  return u;
}

// Praticien avec MFA déjà activé, affecté aux cliniques des villes données
async function creerPraticien(specialite = 'Cardiologie', villes = ['Sousse'], prenom = 'Karim', nom = 'Trabelsi') {
  const u = await creerUtilisateur('PRATICIEN', prenom, nom);
  u.secret = genererSecret();
  await db.query('UPDATE utilisateurs SET mfa_active = true, mfa_secret_chiffre = $1 WHERE id_utilisateur = $2', [chiffrer(u.secret, u.id), u.id]);
  await db.query('INSERT INTO praticiens (id_utilisateur, specialite) VALUES ($1, $2)', [u.id, specialite]);
  await db.query(
    'INSERT INTO praticien_clinique (id_praticien, id_clinique) SELECT $1, id_clinique FROM cliniques WHERE ville = ANY($2)',
    [u.id, villes],
  );
  return u;
}

// Administrateur du portail avec MFA déjà activé (US-34)
async function creerAdmin(prenom = 'Sami', nom = 'Bouazizi') {
  const u = await creerUtilisateur('ADMIN', prenom, nom);
  u.secret = genererSecret();
  await db.query('UPDATE utilisateurs SET mfa_active = true, mfa_secret_chiffre = $1 WHERE id_utilisateur = $2', [chiffrer(u.secret, u.id), u.id]);
  return u;
}

// Membre de la Direction avec MFA activé (Sprint 5)
async function creerDirection(prenom = 'Hela', nom = 'Mejri') {
  const u = await creerUtilisateur('DIRECTION', prenom, nom);
  u.secret = genererSecret();
  await db.query('UPDATE utilisateurs SET mfa_active = true, mfa_secret_chiffre = $1 WHERE id_utilisateur = $2', [chiffrer(u.secret, u.id), u.id]);
  await db.query("INSERT INTO personnels (id_utilisateur, fonction) VALUES ($1, 'Direction')", [u.id]);
  return u;
}

// Agent administratif (sans MFA) rattaché à la clinique de la ville donnée (Sprint 4)
async function creerAgent(ville = 'Sousse', prenom = 'Rim', nom = 'Mansour') {
  const u = await creerUtilisateur('AGENT_ADMIN', prenom, nom);
  await db.query(
    "INSERT INTO personnels (id_utilisateur, fonction, id_clinique) SELECT $1, 'Accueil', id_clinique FROM cliniques WHERE ville = $2",
    [u.id, ville],
  );
  return u;
}

// Renvoie un agent Supertest connecté (avec le code TOTP pour un praticien)
async function connecter(u) {
  const agent = request.agent(app);
  const login = await agent.post('/api/auth/login').send({ email: u.email, password: PASSWORD });
  if (login.body.mfaRequis) await agent.post('/api/auth/mfa').send({ code: codeCourant(u.secret) });
  return agent;
}

const idClinique = async (ville) => (await db.query('SELECT id_clinique FROM cliniques WHERE ville = $1', [ville])).rows[0].id_clinique;

// Prochaine date (AAAA-MM-JJ) tombant le jour ISO donné (1 = lundi), au moins demain
function prochainJour(isodow) {
  const d = new Date(); d.setDate(d.getDate() + 1);
  while (((d.getDay() + 6) % 7) + 1 !== isodow) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

// Rendez-vous créé directement en base (Sprint 4) : plage d'un jour + créneau à 09:00 (heure de Tunis).
// dansJours < 0 : rendez-vous passé (consultation déjà eue).
async function creerRdv(patient, praticien, { ville = 'Sousse', dansJours = 2, heure = '09:00', statut = 'planifie', origine = 'en_ligne' } = {}) {
  const { rows: [p] } = await db.query(
    `INSERT INTO plages_disponibilite (id_praticien, id_clinique, jour_semaine, heure_debut, heure_fin, duree_creneau, date_debut, date_fin)
     SELECT $1, c.id_clinique, extract(isodow FROM j)::int, $3::time, $3::time + interval '30 minutes', 30, j, j
       FROM cliniques c, (SELECT (now() AT TIME ZONE 'Africa/Tunis')::date + $4::int AS j) d
      WHERE c.ville = $2
     RETURNING id_plage, date_debut`,
    [praticien.id, ville, heure, dansJours],
  );
  const { rows: [c] } = await db.query(
    `INSERT INTO creneaux (id_plage, debut, fin, statut)
     VALUES ($1, ($2::date + $3::time) AT TIME ZONE 'Africa/Tunis', ($2::date + $3::time + interval '30 minutes') AT TIME ZONE 'Africa/Tunis', $4::statut_creneau)
     RETURNING id_creneau`,
    [p.id_plage, p.date_debut, heure, statut === 'annule' ? 'libre' : 'reserve'],
  );
  const { rows: [r] } = await db.query(
    `INSERT INTO rendez_vous (id_patient, id_creneau, motif_chiffre, statut, origine)
     VALUES ($1, $2, $3, $4::statut_rdv, $5::origine_rdv) RETURNING id_rdv`,
    [patient.id, c.id_creneau, chiffrer('Contrôle annuel', patient.id), statut, origine],
  );
  return { idRdv: r.id_rdv, idCreneau: c.id_creneau, idPlage: p.id_plage };
}

// Créneau libre à venir créé directement en base (Sprint 5) : plage d'un jour, 30 min à l'heure donnée
async function creerCreneau(praticien, { ville = 'Sousse', dansJours = 3, heure = '10:00' } = {}) {
  const { rows: [p] } = await db.query(
    `INSERT INTO plages_disponibilite (id_praticien, id_clinique, jour_semaine, heure_debut, heure_fin, duree_creneau, date_debut, date_fin)
     SELECT $1, c.id_clinique, extract(isodow FROM j)::int, $3::time, $3::time + interval '30 minutes', 30, j, j
       FROM cliniques c, (SELECT (now() AT TIME ZONE 'Africa/Tunis')::date + $4::int AS j) d
      WHERE c.ville = $2
     RETURNING id_plage, date_debut`,
    [praticien.id, ville, heure, dansJours],
  );
  const { rows: [c] } = await db.query(
    `INSERT INTO creneaux (id_plage, debut, fin)
     VALUES ($1, ($2::date + $3::time) AT TIME ZONE 'Africa/Tunis', ($2::date + $3::time + interval '30 minutes') AT TIME ZONE 'Africa/Tunis')
     RETURNING id_creneau`,
    [p.id_plage, p.date_debut, heure],
  );
  return c.id_creneau;
}

async function nettoyer(...comptes) {
  const ids = comptes.filter(Boolean).map((c) => c.id);
  await db.query(
    `DELETE FROM rendez_vous WHERE id_patient = ANY($1::uuid[])
        OR id_creneau IN (SELECT cr.id_creneau FROM creneaux cr JOIN plages_disponibilite p USING (id_plage) WHERE p.id_praticien = ANY($1::uuid[]))`,
    [ids],
  );
  await db.query('DELETE FROM utilisateurs WHERE id_utilisateur = ANY($1::uuid[])', [ids]);
}

module.exports = { app, db, creerPatient, creerPraticien, creerAdmin, creerAgent, creerDirection, connecter, idClinique, prochainJour, creerRdv, creerCreneau, nettoyer };
