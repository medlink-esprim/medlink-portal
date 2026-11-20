// US-16 : traitement des demandes INPDP par l'administration.
// Montée sur /api/admin/demandes (permission DEMANDES_TRAITER) :
//   GET /?statut=        demandes (les plus anciennes ouvertes d'abord)
//   PATCH /:id           { statut: en_cours | traitee | refusee, reponse }
// Export traité : le fichier JSON (services/donnees.js) est chiffré et mis à disposition du patient.
// Suppression traitée : le compte est désactivé, ses sessions révoquées et ses coordonnées de contact
// effacées ; le dossier médical, lui, est conservé (obligation légale de conservation).
const express = require('express');
const Joi = require('joi');
const db = require('../db');
const validate = require('../middleware/validate');
const { requirePermission } = require('../middleware/auth');
const { chiffrer } = require('../security/chiffrement');
const { journaliser } = require('../security/journal');
const { revokeAllSessions } = require('../security/session');
const { construireExport } = require('../services/donnees');
const { notifierDemande } = require('../services/notifications');
const config = require('../config');

const router = express.Router();
router.use(requirePermission('DEMANDES_TRAITER'));

router.get('/', async (req, res) => {
  const statut = ['recue', 'en_cours', 'traitee', 'refusee'].includes(req.query.statut) ? req.query.statut : null;
  const { rows } = await db.query(
    `SELECT d.id_demande, d.type, d.statut, d.message, d.reponse, d.date_demande, d.date_traitement,
            u.prenom, u.nom, u.statut AS statut_compte, pa.numero_dossier, t.prenom || ' ' || t.nom AS traitant
       FROM demandes_donnees d
       JOIN utilisateurs u ON u.id_utilisateur = d.id_patient
       JOIN patients pa ON pa.id_utilisateur = d.id_patient
       LEFT JOIN utilisateurs t ON t.id_utilisateur = d.id_traitant
      WHERE $1::text IS NULL OR d.statut = $1
      ORDER BY (d.statut IN ('recue', 'en_cours')) DESC, d.date_demande
      LIMIT 200`,
    [statut],
  );
  res.json(rows);
});

const traitementSchema = Joi.object({
  statut: Joi.string().valid('en_cours', 'traitee', 'refusee').required(),
  reponse: Joi.string().trim().max(500).allow(''),
});

router.patch('/:id', validate(traitementSchema), async (req, res) => {
  if (Joi.string().guid().validate(req.params.id).error) return res.status(404).json({ message: 'Demande introuvable' });
  const { statut, reponse } = req.body;
  if (statut === 'refusee' && !reponse) return res.status(400).json({ message: 'Indiquez au patient le motif du refus' });

  const outcome = await db.withTransaction(async (client) => {
    const { rows: [d] } = await client.query('SELECT * FROM demandes_donnees WHERE id_demande = $1 FOR UPDATE', [req.params.id]);
    if (!d) return { status: 404, body: { message: 'Demande introuvable' } };
    if (!['recue', 'en_cours'].includes(d.statut)) return { status: 409, body: { message: 'Cette demande est déjà clôturée' } };
    if (statut === 'en_cours' && d.statut === 'en_cours') return { status: 409, body: { message: 'Demande déjà prise en charge' } };

    if (statut === 'traitee' && d.type === 'suppression') {
      const { rows: [n] } = await client.query(
        `SELECT count(*)::int AS n FROM rendez_vous r JOIN creneaux cr USING (id_creneau)
          WHERE r.id_patient = $1 AND r.statut = 'planifie' AND cr.debut > now()`,
        [d.id_patient],
      );
      if (n.n > 0) return { status: 409, body: { message: `Le patient a ${n.n} rendez-vous à venir : ils doivent être annulés avant la suppression.` } };
      await client.query(
        "UPDATE utilisateurs SET statut = 'desactive', date_desactivation = now(), telephone = NULL WHERE id_utilisateur = $1",
        [d.id_patient],
      );
      await client.query('UPDATE preferences_notification SET email_actif = false, sms_actif = false, rappel_actif = false WHERE id_patient = $1', [d.id_patient]);
      await revokeAllSessions(client, d.id_patient);
    }
    let exportChiffre = null;
    if (statut === 'traitee' && d.type === 'export') {
      exportChiffre = chiffrer(JSON.stringify(await construireExport(d.id_patient), null, 2), d.id_demande);
    }
    await client.query(
      `UPDATE demandes_donnees SET statut = $2, reponse = COALESCE($3, reponse), id_traitant = $4,
              date_traitement = CASE WHEN $6 THEN now() ELSE date_traitement END,
              export_chiffre = COALESCE($5, export_chiffre)
        WHERE id_demande = $1`,
      [d.id_demande, statut, reponse || null, req.user.id, exportChiffre, statut !== 'en_cours'],
    );
    return { status: 200, demande: d };
  });
  if (outcome.status !== 200) return res.status(outcome.status).json(outcome.body);

  const d = outcome.demande;
  journaliser('DEMANDE_TRAITEE', req, { demande: d.id_demande, type: d.type, statut });
  const libelle = d.type === 'export' ? "d'export de vos données" : 'de suppression de vos données';
  const textes = {
    en_cours: `Votre demande ${libelle} est en cours de traitement.`,
    traitee: d.type === 'export'
      ? `Votre demande ${libelle} est traitée : le fichier est disponible dans « Mon profil » : ${config.appUrl}/patient/profil`
      : `Votre demande ${libelle} est traitée : votre compte est désactivé et vos coordonnées de contact effacées. Votre dossier médical est conservé pendant la durée légale.`,
    refusee: `Votre demande ${libelle} n'a pas pu être acceptée. Motif : ${reponse}`,
  };
  await notifierDemande(d.id_patient, { sujet: 'MedLink — votre demande sur vos données personnelles', texte: `Bonjour,\n\n${textes[statut]}\n\nL'équipe MedLink` });
  return res.json({ message: 'Demande mise à jour, patient informé par e-mail' });
});

module.exports = router;
