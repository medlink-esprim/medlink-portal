// US-30 : rendez-vous pris par l'accueil pour un patient qui téléphone.
// Montée sur /api/accueil (permission RDV_POUR_PATIENT) :
//   GET /contexte                 clinique de l'agent connecté
//   GET /patients?q=              recherche d'un patient (nom, numéro de dossier, téléphone, e-mail)
//   GET /praticiens               praticiens exerçant dans la clinique de l'agent
//   GET /creneaux?praticien=&debut= créneaux libres de ce praticien dans cette clinique (7 jours)
//   POST /rendez-vous             réservation (origine « accueil », agent enregistré, patient notifié)
// Moindre privilège : l'agent ne voit que des données administratives (aucun motif, aucun document)
// et ne réserve que dans SA clinique.
const express = require('express');
const Joi = require('joi');
const db = require('../db');
const validate = require('../middleware/validate');
const { requirePermission, refuser } = require('../middleware/auth');
const { chiffrer } = require('../security/chiffrement');
const { journaliser } = require('../security/journal');
const { notifierPatient } = require('../services/notifications');

const { conflitPatient } = require('../services/agenda');

const router = express.Router();
router.use(requirePermission('RDV_POUR_PATIENT'));

const PRIS = { message: "Ce créneau vient d'être réservé. Choisissez un autre créneau." };
const motif = (q) => `%${q.replace(/[\\%_]/g, '\\$&')}%`;
const dateIso = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).custom((v, helpers) => (
  new Date(`${v}T00:00:00Z`).toISOString().startsWith(v) ? v : helpers.error('any.invalid')
), 'date du calendrier');

async function cliniqueAgent(idAgent) {
  const { rows: [c] } = await db.query(
    `SELECT c.id_clinique, c.nom, c.ville FROM personnels pe JOIN cliniques c USING (id_clinique)
      WHERE pe.id_utilisateur = $1`,
    [idAgent],
  );
  return c || null;
}

// toutes les routes ont besoin de la clinique de l'agent
router.use(async (req, res, next) => {
  req.clinique = await cliniqueAgent(req.user.id);
  if (!req.clinique) return res.status(422).json({ message: "Votre compte n'est rattaché à aucune clinique : contactez l'administrateur." });
  return next();
});

router.get('/contexte', (req, res) => res.json({ clinique: req.clinique }));

const rechercheSchema = Joi.object({ q: Joi.string().trim().min(2).max(80).required() });

router.get('/patients', async (req, res) => {
  const { error, value } = rechercheSchema.validate(req.query, { stripUnknown: true });
  if (error) return res.status(400).json({ message: 'Saisissez au moins 2 caractères' });
  const chiffres = value.q.replace(/\D/g, '');
  const { rows } = await db.query(
    `SELECT u.id_utilisateur AS id_patient, u.nom, u.prenom, u.email, u.telephone, u.statut,
            pa.numero_dossier, to_char(pa.date_naissance, 'YYYY-MM-DD') AS date_naissance
       FROM patients pa
       JOIN utilisateurs u ON u.id_utilisateur = pa.id_utilisateur
      WHERE u.statut <> 'desactive'
        AND (u.nom ILIKE $1 OR u.prenom ILIKE $1 OR (u.prenom || ' ' || u.nom) ILIKE $1
             OR (u.nom || ' ' || u.prenom) ILIKE $1 OR pa.numero_dossier ILIKE $1 OR u.email ILIKE $1
             OR (length($2) >= 6 AND regexp_replace(COALESCE(u.telephone, ''), '\\D', '', 'g') LIKE '%' || $2 || '%'))
      ORDER BY u.nom, u.prenom
      LIMIT 20`,
    [motif(value.q), chiffres],
  );
  res.json(rows);
});

router.get('/praticiens', async (req, res) => {
  const { rows } = await db.query(
    `SELECT u.id_utilisateur AS id_praticien, u.nom, u.prenom, pr.specialite,
            (SELECT count(*)::int FROM creneaux cr JOIN plages_disponibilite p USING (id_plage)
              WHERE p.id_praticien = u.id_utilisateur AND p.id_clinique = $1
                AND cr.statut = 'libre' AND cr.debut > now()) AS creneaux_libres
       FROM praticien_clinique pc
       JOIN praticiens pr ON pr.id_utilisateur = pc.id_praticien
       JOIN utilisateurs u ON u.id_utilisateur = pc.id_praticien
      WHERE pc.id_clinique = $1 AND pc.actif AND u.statut = 'actif'
      ORDER BY pr.specialite, u.nom`,
    [req.clinique.id_clinique],
  );
  res.json(rows);
});

const creneauxSchema = Joi.object({ praticien: Joi.string().guid().required(), debut: dateIso });

router.get('/creneaux', async (req, res) => {
  const { error, value } = creneauxSchema.validate(req.query, { stripUnknown: true });
  if (error) return res.status(400).json({ message: 'Paramètres invalides' });
  const { rows } = await db.query(
    `WITH periode AS (SELECT COALESCE($3::date, (now() AT TIME ZONE 'Africa/Tunis')::date) AS d1)
     SELECT cr.id_creneau, cr.debut, cr.fin
       FROM creneaux cr
       JOIN plages_disponibilite p USING (id_plage)
       CROSS JOIN periode
      WHERE p.id_praticien = $1 AND p.id_clinique = $2
        AND cr.statut = 'libre' AND cr.debut > now()
        AND cr.debut >= periode.d1::timestamp AT TIME ZONE 'Africa/Tunis'
        AND cr.debut < (periode.d1 + 7)::timestamp AT TIME ZONE 'Africa/Tunis'
      ORDER BY cr.debut
      LIMIT 300`,
    [value.praticien, req.clinique.id_clinique, value.debut || null],
  );
  res.json(rows);
});

const reservationSchema = Joi.object({
  idPatient: Joi.string().guid().required(),
  idCreneau: Joi.string().guid().required(),
  motif: Joi.string().trim().max(500).allow(''),
});

router.post('/rendez-vous', validate(reservationSchema), async (req, res) => {
  const { idPatient, idCreneau } = req.body;
  try {
    const outcome = await db.withTransaction(async (client) => {
      const { rows: [p] } = await client.query(
        `SELECT u.statut FROM patients pa JOIN utilisateurs u ON u.id_utilisateur = pa.id_utilisateur
          WHERE pa.id_utilisateur = $1`,
        [idPatient],
      );
      if (!p) return { status: 404, body: { message: 'Patient introuvable' } };
      if (p.statut === 'desactive') return { status: 422, body: { message: 'Le compte de ce patient est désactivé' } };
      // mêmes règles qu'en ligne : pas de chevauchement, un rendez-vous par jour chez le même praticien
      const conflit = await conflitPatient(client, { idPatient, idCreneau, parAccueil: true });

      // verrou sur le créneau, comme pour une réservation en ligne (US-07)
      const { rows: [c] } = await client.query(
        `SELECT cr.statut, cr.debut > now() AS a_venir, p.id_clinique
           FROM creneaux cr JOIN plages_disponibilite p USING (id_plage)
          WHERE cr.id_creneau = $1
            FOR UPDATE OF cr`,
        [idCreneau],
      );
      if (!c) return { status: 404, body: { message: 'Créneau introuvable' } };
      if (c.id_clinique !== req.clinique.id_clinique) return { refus: true };
      if (c.statut !== 'libre' || !c.a_venir) return { status: 409, body: PRIS };
      if (conflit) return conflit;

      const { rows: [rdv] } = await client.query(
        `INSERT INTO rendez_vous (id_patient, id_creneau, motif_chiffre, statut, origine, id_createur)
         VALUES ($1, $2, $3, 'planifie', 'accueil', $4) RETURNING id_rdv`,
        [idPatient, idCreneau, chiffrer(req.body.motif, idPatient), req.user.id],
      );
      await client.query("UPDATE creneaux SET statut = 'reserve' WHERE id_creneau = $1", [idCreneau]);
      return { status: 201, body: { idRdv: rdv.id_rdv, message: 'Rendez-vous enregistré (pris par l\'accueil), patient notifié' } };
    });
    if (outcome.refus) return refuser(req, res, `créneau ${idCreneau} hors de la clinique de l'agent`);
    if (outcome.status === 201) {
      journaliser('RDV_PRIS_ACCUEIL', req, { rdv: outcome.body.idRdv, patient: idPatient });
      await notifierPatient(outcome.body.idRdv, 'confirmation');
    }
    return res.status(outcome.status).json(outcome.body);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json(PRIS);
    throw err;
  }
});

module.exports = router;
