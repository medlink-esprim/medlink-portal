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

async function nettoyer(...comptes) {
  const ids = comptes.filter(Boolean).map((c) => c.id);
  await db.query(
    `DELETE FROM rendez_vous WHERE id_patient = ANY($1::uuid[])
        OR id_creneau IN (SELECT cr.id_creneau FROM creneaux cr JOIN plages_disponibilite p USING (id_plage) WHERE p.id_praticien = ANY($1::uuid[]))`,
    [ids],
  );
  await db.query('DELETE FROM utilisateurs WHERE id_utilisateur = ANY($1::uuid[])', [ids]);
}

module.exports = { app, db, creerPatient, creerPraticien, creerAdmin, connecter, idClinique, prochainJour, nettoyer };
