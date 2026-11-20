// US-27 : création des comptes praticien / agent par le back-office.
// Sprint 2 (US-18) : un praticien est affecté à une ou plusieurs cliniques dès sa création
// (la modification des affectations arrive au Sprint 4, US-29).
// Montée sur /api/comptes : GET /cliniques, GET /, POST /
// US-28 : GET /recherche, GET /:id, PUT /:id, PATCH /:id/statut (modification et désactivation ;
//   le compte et son historique sont conservés, ses sessions sont révoquées)
// US-29 : GET /:id/cliniques, PUT /:id/cliniques (affectation d'un praticien aux cliniques)
const express = require('express');
const Joi = require('joi');
const db = require('../db');
const validate = require('../middleware/validate');
const { requirePermission, refuser } = require('../middleware/auth');
const { journaliser } = require('../security/journal');
const { revokeAllSessions } = require('../security/session');
const { issueToken } = require('../security/tokens');
const mailer = require('../services/mailer');

const router = express.Router();
router.use(requirePermission('COMPTES_GERER'));   // toutes les routes du back-office

router.get('/cliniques', async (req, res) => {
  const { rows } = await db.query('SELECT id_clinique, nom, ville FROM cliniques ORDER BY ville');
  res.json(rows);
});

router.get('/', async (req, res) => {
  const { rows } = await db.query(
    `SELECT u.nom, u.prenom, r.code AS role, u.statut, u.date_creation
       FROM utilisateurs u JOIN roles r USING (id_role)
      WHERE r.code <> 'PATIENT'
      ORDER BY u.date_creation DESC LIMIT 10`,
  );
  res.json(rows);
});

const schema = Joi.object({
  nom: Joi.string().trim().min(1).max(80).required(),
  prenom: Joi.string().trim().min(1).max(80).required(),
  email: Joi.string().trim().lowercase().email().max(160).required(),
  telephone: Joi.string().trim().pattern(/^\+?[0-9 ]{8,20}$/).allow(''),
  role: Joi.string().valid('PRATICIEN', 'AGENT_ADMIN').required(),
  idClinique: Joi.when('role', { is: 'AGENT_ADMIN', then: Joi.string().guid().required(), otherwise: Joi.forbidden() }),
  specialite: Joi.when('role', { is: 'PRATICIEN', then: Joi.string().trim().max(60).required(), otherwise: Joi.forbidden() }),
  cliniques: Joi.when('role', {
    is: 'PRATICIEN',
    then: Joi.array().items(Joi.string().guid()).min(1).max(10).unique().required(),
    otherwise: Joi.forbidden(),
  }),
  numeroOrdre: Joi.when('role', { is: 'PRATICIEN', then: Joi.string().trim().max(20).allow(''), otherwise: Joi.forbidden() }),
  fonction: Joi.when('role', { is: 'AGENT_ADMIN', then: Joi.string().trim().max(60).allow(''), otherwise: Joi.forbidden() }),
});

router.post('/', validate(schema), async (req, res) => {
  const b = req.body;
  if (b.role === 'PRATICIEN') {
    const { rows } = await db.query('SELECT count(*)::int AS n FROM cliniques WHERE id_clinique = ANY($1::uuid[])', [b.cliniques]);
    if (rows[0].n !== b.cliniques.length) return res.status(422).json({ message: 'Clinique inconnue' });
  }
  const result = await db.withTransaction(async (client) => {
    const exists = await client.query('SELECT 1 FROM utilisateurs WHERE email = $1', [b.email]);
    if (exists.rowCount) return null;

    // compte créé SANS mot de passe : l'utilisateur le choisit lui-même à l'activation
    const { rows } = await client.query(
      `INSERT INTO utilisateurs (id_role, nom, prenom, email, telephone)
       VALUES ((SELECT id_role FROM roles WHERE code = $1), $2, $3, $4, $5)
       RETURNING id_utilisateur`,
      [b.role, b.nom, b.prenom, b.email, b.telephone || null],
    );
    const id = rows[0].id_utilisateur;
    if (b.role === 'PRATICIEN') {
      await client.query(
        'INSERT INTO praticiens (id_utilisateur, specialite, numero_ordre) VALUES ($1, $2, $3)',
        [id, b.specialite, b.numeroOrdre || null],
      );
      await client.query(
        `INSERT INTO praticien_clinique (id_praticien, id_clinique)
         SELECT $1, c.id_clinique FROM cliniques c WHERE c.id_clinique = ANY($2::uuid[])`,
        [id, b.cliniques],
      );
    } else {
      await client.query(
        'INSERT INTO personnels (id_utilisateur, fonction, id_clinique) VALUES ($1, $2, $3)',
        [id, b.fonction || 'Agent administratif', b.idClinique],
      );
    }
    const token = await issueToken(client, id, 'activation', 72 * 60);
    return { id, token };
  });

  if (!result) return res.status(409).json({ message: 'Un compte existe déjà avec cette adresse e-mail' });
  await mailer.sendActivation(b.email, b.prenom, result.token);
  return res.status(201).json({ message: 'Compte créé, invitation envoyée', id: result.id });
});

// ===================== US-28 : modification et désactivation =====================
const ROLES = ['PATIENT', 'PRATICIEN', 'AGENT_ADMIN', 'ADMIN', 'DIRECTION'];
const ROLES_PROTEGES = ['ADMIN', 'DIRECTION'];   // modifiables uniquement par un administrateur du portail
const estUuid = (v) => !Joi.string().guid().validate(v).error;
const motif = (q) => `%${q.replace(/[\\%_]/g, '\\$&')}%`;

const rechercheSchema = Joi.object({
  q: Joi.string().trim().max(80).allow(''),
  role: Joi.string().valid(...ROLES).allow(''),
  statut: Joi.string().valid('en_attente', 'actif', 'desactive').allow(''),
});

router.get('/recherche', async (req, res) => {
  const { error, value } = rechercheSchema.validate(req.query, { stripUnknown: true });
  if (error) return res.status(400).json({ message: 'Recherche invalide' });
  const { rows } = await db.query(
    `SELECT u.id_utilisateur, u.nom, u.prenom, u.email, r.code AS role, u.statut, u.date_creation,
            pr.specialite, pe.fonction, c.ville AS clinique
       FROM utilisateurs u
       JOIN roles r USING (id_role)
       LEFT JOIN praticiens pr ON pr.id_utilisateur = u.id_utilisateur
       LEFT JOIN personnels pe ON pe.id_utilisateur = u.id_utilisateur
       LEFT JOIN cliniques c ON c.id_clinique = pe.id_clinique
       LEFT JOIN patients pa ON pa.id_utilisateur = u.id_utilisateur
      WHERE ($1::text IS NULL OR u.nom ILIKE $1 OR u.prenom ILIKE $1 OR u.email ILIKE $1
             OR (u.prenom || ' ' || u.nom) ILIKE $1 OR pa.numero_dossier ILIKE $1)
        AND ($2::text IS NULL OR r.code = $2)
        AND ($3::text IS NULL OR u.statut::text = $3)
      ORDER BY u.nom, u.prenom
      LIMIT 50`,
    [value.q ? motif(value.q) : null, value.role || null, value.statut || null],
  );
  res.json(rows);
});

// Compte cible + nombre de rendez-vous à venir (patient : les siens ; praticien : sur ses créneaux)
async function lireCompte(id, client = db) {
  const { rows: [u] } = await client.query(
    `SELECT u.id_utilisateur, u.nom, u.prenom, u.email, u.telephone, r.code AS role, u.statut, u.email_verifie,
            u.mfa_active, u.date_creation, u.date_desactivation,
            pr.specialite, pr.numero_ordre, pe.fonction, pe.id_clinique, pa.numero_dossier,
            (SELECT max(s.derniere_activite) FROM sessions s WHERE s.id_utilisateur = u.id_utilisateur) AS derniere_activite,
            (SELECT count(*)::int FROM rendez_vous rv
               JOIN creneaux cr USING (id_creneau)
               JOIN plages_disponibilite p USING (id_plage)
              WHERE rv.statut = 'planifie' AND cr.debut > now()
                AND (rv.id_patient = u.id_utilisateur OR p.id_praticien = u.id_utilisateur)) AS rdv_a_venir
       FROM utilisateurs u
       JOIN roles r USING (id_role)
       LEFT JOIN praticiens pr ON pr.id_utilisateur = u.id_utilisateur
       LEFT JOIN personnels pe ON pe.id_utilisateur = u.id_utilisateur
       LEFT JOIN patients pa ON pa.id_utilisateur = u.id_utilisateur
      WHERE u.id_utilisateur = $1`,
    [id],
  );
  return u;
}

router.get('/:id', async (req, res) => {
  if (!estUuid(req.params.id)) return res.status(404).json({ message: 'Compte introuvable' });
  const u = await lireCompte(req.params.id);
  if (!u) return res.status(404).json({ message: 'Compte introuvable' });
  return res.json(u);
});

const modificationSchema = Joi.object({
  nom: Joi.string().trim().min(1).max(80).required(),
  prenom: Joi.string().trim().min(1).max(80).required(),
  telephone: Joi.string().trim().pattern(/^\+?[0-9 ]{8,20}$/).allow(''),
  specialite: Joi.string().trim().max(60),
  numeroOrdre: Joi.string().trim().max(20).allow(''),
  fonction: Joi.string().trim().max(60).allow(''),
  idClinique: Joi.string().guid(),
});

// Modification (« change de poste ») : identité, téléphone et informations propres au rôle.
// L'adresse e-mail et le rôle ne se modifient pas ici (vérification d'adresse, données de rôle).
router.put('/:id', validate(modificationSchema), async (req, res) => {
  if (!estUuid(req.params.id)) return res.status(404).json({ message: 'Compte introuvable' });
  const u = await lireCompte(req.params.id);
  if (!u) return res.status(404).json({ message: 'Compte introuvable' });
  if (ROLES_PROTEGES.includes(u.role) && req.user.role !== 'ADMIN') return refuser(req, res, `modification du compte ${u.role} ${u.id_utilisateur}`);
  const b = req.body;
  const champsPraticien = ['specialite', 'numeroOrdre'].filter((k) => b[k] !== undefined);
  const champsAgent = ['fonction', 'idClinique'].filter((k) => b[k] !== undefined);
  if ((champsPraticien.length && u.role !== 'PRATICIEN') || (champsAgent.length && u.role !== 'AGENT_ADMIN')) {
    return res.status(422).json({ message: 'Ces informations ne correspondent pas au rôle du compte' });
  }
  if (b.idClinique) {
    const { rowCount } = await db.query('SELECT 1 FROM cliniques WHERE id_clinique = $1', [b.idClinique]);
    if (!rowCount) return res.status(422).json({ message: 'Clinique inconnue' });
  }
  await db.withTransaction(async (client) => {
    await client.query(
      'UPDATE utilisateurs SET nom = $2, prenom = $3, telephone = $4 WHERE id_utilisateur = $1',
      [u.id_utilisateur, b.nom, b.prenom, b.telephone || null],
    );
    if (champsPraticien.length) {
      await client.query(
        'UPDATE praticiens SET specialite = COALESCE($2, specialite), numero_ordre = COALESCE($3, numero_ordre) WHERE id_utilisateur = $1',
        [u.id_utilisateur, b.specialite ?? null, b.numeroOrdre === undefined ? null : b.numeroOrdre || null],
      );
    }
    if (champsAgent.length) {
      await client.query(
        'UPDATE personnels SET fonction = COALESCE($2, fonction), id_clinique = COALESCE($3, id_clinique) WHERE id_utilisateur = $1',
        [u.id_utilisateur, b.fonction === undefined ? null : b.fonction || 'Agent administratif', b.idClinique ?? null],
      );
    }
  });
  journaliser('COMPTE_MODIFIE', req, { compte: u.id_utilisateur, roleCompte: u.role, champs: Object.keys(b) });
  return res.json({ message: 'Compte modifié', compte: await lireCompte(u.id_utilisateur) });
});

const statutSchema = Joi.object({ statut: Joi.string().valid('actif', 'desactive').required() });

// Désactivation : connexion impossible et sessions révoquées immédiatement ; rien n'est supprimé.
// Réactivation : le compte redevient actif (ou « en attente » s'il n'a jamais été activé).
router.patch('/:id/statut', validate(statutSchema), async (req, res) => {
  if (!estUuid(req.params.id)) return res.status(404).json({ message: 'Compte introuvable' });
  const outcome = await db.withTransaction(async (client) => {
    await client.query('SELECT 1 FROM utilisateurs WHERE id_utilisateur = $1 FOR UPDATE', [req.params.id]);
    const u = await lireCompte(req.params.id, client);
    if (!u) return { status: 404, body: { message: 'Compte introuvable' } };
    if (ROLES_PROTEGES.includes(u.role) && req.user.role !== 'ADMIN') return { refus: u };
    if (u.id_utilisateur === req.user.id) return { status: 422, body: { message: 'Vous ne pouvez pas modifier le statut de votre propre compte' } };

    if (req.body.statut === 'desactive') {
      if (u.statut === 'desactive') return { status: 409, body: { message: 'Ce compte est déjà désactivé' } };
      if (u.rdv_a_venir > 0) {
        return { status: 409, body: { message: `${u.rdv_a_venir} rendez-vous à venir : annulez-les ou reportez-les avant de désactiver ce compte.`, rendezVous: u.rdv_a_venir } };
      }
      await client.query("UPDATE utilisateurs SET statut = 'desactive', date_desactivation = now() WHERE id_utilisateur = $1", [u.id_utilisateur]);
      await revokeAllSessions(client, u.id_utilisateur);
      // praticien : ses créneaux libres à venir ne sont plus réservables
      await client.query(
        `UPDATE creneaux cr SET statut = 'bloque'
           FROM plages_disponibilite p
          WHERE p.id_plage = cr.id_plage AND p.id_praticien = $1 AND cr.statut = 'libre' AND cr.debut > now()`,
        [u.id_utilisateur],
      );
      return { status: 200, evenement: 'COMPTE_DESACTIVE', compte: u, body: { message: 'Compte désactivé : connexion impossible, historique conservé' } };
    }
    if (u.statut !== 'desactive') return { status: 409, body: { message: "Ce compte n'est pas désactivé" } };
    await client.query(
      `UPDATE utilisateurs SET statut = CASE WHEN mot_de_passe_hash IS NULL THEN 'en_attente'::statut_compte ELSE 'actif'::statut_compte END,
              date_desactivation = NULL
        WHERE id_utilisateur = $1`,
      [u.id_utilisateur],
    );
    // praticien : ses créneaux à venir sans rendez-vous redeviennent réservables
    await client.query(
      `UPDATE creneaux cr SET statut = 'libre'
         FROM plages_disponibilite p
        WHERE p.id_plage = cr.id_plage AND p.id_praticien = $1 AND cr.statut = 'bloque' AND cr.debut > now()
          AND NOT EXISTS (SELECT 1 FROM rendez_vous rv WHERE rv.id_creneau = cr.id_creneau AND rv.statut = 'planifie')
          AND NOT EXISTS (SELECT 1 FROM absences a WHERE a.id_praticien = $1 AND cr.debut < a.fin AND cr.fin > a.debut)   -- US-21`,
      [u.id_utilisateur],
    );
    return { status: 200, evenement: 'COMPTE_REACTIVE', compte: u, body: { message: 'Compte réactivé' } };
  });
  if (outcome.refus) return refuser(req, res, `statut du compte ${outcome.refus.role} ${outcome.refus.id_utilisateur}`);
  if (outcome.evenement) journaliser(outcome.evenement, req, { compte: outcome.compte.id_utilisateur, roleCompte: outcome.compte.role });
  return res.status(outcome.status).json(outcome.body);
});

// ===================== US-29 : affectation des praticiens aux cliniques =====================
const SQL_RDV_A_VENIR = `
  SELECT c.ville, count(*)::int AS rendez_vous
    FROM rendez_vous r
    JOIN creneaux cr USING (id_creneau)
    JOIN plages_disponibilite p USING (id_plage)
    JOIN cliniques c ON c.id_clinique = p.id_clinique
   WHERE p.id_praticien = $1 AND p.id_clinique = ANY($2::uuid[]) AND r.statut = 'planifie' AND cr.debut > now()
   GROUP BY c.ville`;

router.get('/:id/cliniques', async (req, res) => {
  if (!estUuid(req.params.id)) return res.status(404).json({ message: 'Praticien introuvable' });
  const { rowCount } = await db.query('SELECT 1 FROM praticiens WHERE id_utilisateur = $1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ message: 'Praticien introuvable' });
  const { rows } = await db.query(
    `SELECT c.id_clinique, c.nom, c.ville, COALESCE(pc.actif, false) AS affecte,
            (SELECT count(*)::int FROM rendez_vous r
               JOIN creneaux cr USING (id_creneau)
               JOIN plages_disponibilite p USING (id_plage)
              WHERE p.id_praticien = $1 AND p.id_clinique = c.id_clinique
                AND r.statut = 'planifie' AND cr.debut > now()) AS rdv_a_venir
       FROM cliniques c
       LEFT JOIN praticien_clinique pc ON pc.id_clinique = c.id_clinique AND pc.id_praticien = $1
      ORDER BY c.ville`,
    [req.params.id],
  );
  return res.json(rows);
});

const affectationSchema = Joi.object({
  cliniques: Joi.array().items(Joi.string().guid()).min(1).max(10).unique().required(),
});

// Remplace l'ensemble des cliniques du praticien. Ajout : il peut y publier ses disponibilités.
// Retrait : refusé tant qu'il reste des rendez-vous à venir dans la clinique ; sinon ses créneaux
// libres à venir y sont supprimés (ou bloqués s'ils portent un ancien rendez-vous annulé), ses plages
// closes, et l'affectation désactivée (jamais supprimée : l'historique des plages est conservé).
router.put('/:id/cliniques', validate(affectationSchema), async (req, res) => {
  if (!estUuid(req.params.id)) return res.status(404).json({ message: 'Praticien introuvable' });
  const idPraticien = req.params.id;
  const voulues = req.body.cliniques;
  const outcome = await db.withTransaction(async (client) => {
    const { rowCount } = await client.query('SELECT 1 FROM praticiens WHERE id_utilisateur = $1 FOR UPDATE', [idPraticien]);
    if (!rowCount) return { status: 404, body: { message: 'Praticien introuvable' } };
    const { rows: connues } = await client.query('SELECT id_clinique, ville FROM cliniques WHERE id_clinique = ANY($1::uuid[])', [voulues]);
    if (connues.length !== voulues.length) return { status: 422, body: { message: 'Clinique inconnue' } };

    const { rows: actuelles } = await client.query(
      `SELECT pc.id_clinique, c.ville FROM praticien_clinique pc JOIN cliniques c USING (id_clinique)
        WHERE pc.id_praticien = $1 AND pc.actif`,
      [idPraticien],
    );
    const retirees = actuelles.filter((a) => !voulues.includes(a.id_clinique));
    const ajoutees = connues.filter((c) => !actuelles.some((a) => a.id_clinique === c.id_clinique));
    const idsRetires = retirees.map((r) => r.id_clinique);

    if (idsRetires.length) {
      const { rows: conflits } = await client.query(SQL_RDV_A_VENIR, [idPraticien, idsRetires]);
      if (conflits.length) {
        const detail = conflits.map((c) => `${c.ville} (${c.rendez_vous})`).join(', ');
        return { status: 409, body: { message: `Rendez-vous à venir à ${detail} : reportez-les ou annulez-les avant de retirer cette clinique.`, conflits } };
      }
      const params = [idPraticien, idsRetires];
      await client.query(
        `DELETE FROM creneaux cr USING plages_disponibilite p
          WHERE p.id_plage = cr.id_plage AND p.id_praticien = $1 AND p.id_clinique = ANY($2::uuid[]) AND cr.debut > now()
            AND NOT EXISTS (SELECT 1 FROM rendez_vous r WHERE r.id_creneau = cr.id_creneau)`,
        params,
      );
      await client.query(
        `UPDATE creneaux cr SET statut = 'bloque' FROM plages_disponibilite p
          WHERE p.id_plage = cr.id_plage AND p.id_praticien = $1 AND p.id_clinique = ANY($2::uuid[])
            AND cr.debut > now() AND cr.statut = 'libre'`,
        params,
      );
      await client.query(
        `DELETE FROM plages_disponibilite p
          WHERE p.id_praticien = $1 AND p.id_clinique = ANY($2::uuid[])
            AND NOT EXISTS (SELECT 1 FROM creneaux cr WHERE cr.id_plage = p.id_plage)`,
        params,
      );
      await client.query(
        `UPDATE plages_disponibilite SET date_fin = GREATEST(date_debut, (now() AT TIME ZONE 'Africa/Tunis')::date)
          WHERE id_praticien = $1 AND id_clinique = ANY($2::uuid[]) AND date_fin > (now() AT TIME ZONE 'Africa/Tunis')::date`,
        params,
      );
      await client.query(
        'UPDATE praticien_clinique SET actif = false, date_maj = now() WHERE id_praticien = $1 AND id_clinique = ANY($2::uuid[])',
        params,
      );
    }
    if (ajoutees.length) {
      await client.query(
        `INSERT INTO praticien_clinique (id_praticien, id_clinique)
         SELECT $1, unnest($2::uuid[])
         ON CONFLICT (id_praticien, id_clinique) DO UPDATE SET actif = true, date_maj = now()`,
        [idPraticien, ajoutees.map((c) => c.id_clinique)],
      );
    }
    return {
      status: 200,
      ajoutees: ajoutees.map((c) => c.ville),
      retirees: retirees.map((r) => r.ville),
    };
  });
  if (outcome.status !== 200) return res.status(outcome.status).json(outcome.body);
  journaliser('AFFECTATIONS_MODIFIEES', req, { praticien: idPraticien, ajoutees: outcome.ajoutees, retirees: outcome.retirees });
  return res.json({ message: 'Affectations enregistrées', ajoutees: outcome.ajoutees, retirees: outcome.retirees });
});

module.exports = router;
