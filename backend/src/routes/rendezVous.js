// US-07 : réservation transactionnelle d'un créneau.
// US-09 : annulation jusqu'à 24 h avant le rendez-vous.
// US-10 : report sur un autre créneau du même praticien, dans une seule transaction.
// Montée sur /api/rendez-vous : POST / (patient), GET /:id (patient concerné ou praticien concerné),
//   PATCH /:id/annulation et PATCH /:id/report (patient concerné)
const express = require('express');
const Joi = require('joi');
const db = require('../db');
const validate = require('../middleware/validate');
const { requireAuth, requirePermission, refuser } = require('../middleware/auth');
const { chiffrer, dechiffrer } = require('../security/chiffrement');
const { notifierPatient, notifierPraticien } = require('../services/notifications');

const router = express.Router();
const DELAI_H = 24;   // annulation et report possibles jusqu'à 24 h avant le rendez-vous
const TROP_TARD = { message: "Moins de 24 heures avant le rendez-vous : la modification en ligne n'est plus possible. Contactez votre clinique." };
const NON_MODIFIABLE = { message: 'Ce rendez-vous ne peut plus être modifié (déjà annulé, reporté ou passé).' };
const estUuid = (v) => !Joi.string().guid().validate(v).error;

const PRIS = { message: "Ce créneau vient d'être réservé par un autre patient. Choisissez un autre créneau." };

const schema = Joi.object({
  idCreneau: Joi.string().guid().required(),
  motif: Joi.string().trim().max(500).allow(''),
});

router.post('/', requirePermission('RDV_PRENDRE'), validate(schema), async (req, res) => {
  const idPatient = req.user.id;   // extrait du jeton, jamais du corps : impossible de réserver au nom d'un autre
  try {
    const outcome = await db.withTransaction(async (client) => {
      // verrou sur la ligne du créneau : une seconde transaction attend la fin de la première
      const { rows: [c] } = await client.query(
        'SELECT statut, debut > now() AS a_venir FROM creneaux WHERE id_creneau = $1 FOR UPDATE',
        [req.body.idCreneau],
      );
      if (!c) return { status: 404, body: { message: 'Créneau introuvable' } };
      if (c.statut !== 'libre' || !c.a_venir) return { status: 409, body: PRIS };

      const { rows: [rdv] } = await client.query(
        `INSERT INTO rendez_vous (id_patient, id_creneau, motif_chiffre, statut, origine)
         VALUES ($1, $2, $3, 'planifie', 'en_ligne') RETURNING id_rdv`,
        // US-43 : le motif est chiffré (AES-256-GCM), lié à l'identifiant du patient
        [idPatient, req.body.idCreneau, chiffrer(req.body.motif, idPatient)],
      );
      await client.query("UPDATE creneaux SET statut = 'reserve' WHERE id_creneau = $1", [req.body.idCreneau]);
      return { status: 201, body: { idRdv: rdv.id_rdv, message: 'Rendez-vous enregistré' } };
    });
    // US-08 : confirmation envoyée APRÈS la validation de la transaction (e-mail et/ou SMS)
    if (outcome.status === 201) await notifierPatient(outcome.body.idRdv, 'confirmation');
    return res.status(outcome.status).json(outcome.body);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json(PRIS);   // index unique : dernier rempart
    throw err;
  }
});

// Détail d'un rendez-vous : US-39, contrôle de PROPRIÉTÉ en plus du rôle
router.get('/:id', requireAuth, async (req, res) => {
  if (Joi.string().guid().validate(req.params.id).error) return res.status(404).json({ message: 'Rendez-vous introuvable' });
  const { rows: [r] } = await db.query(
    `SELECT r.id_rdv, r.id_patient, p.id_praticien, r.statut, r.motif_chiffre, r.date_creation,
            cr.debut, cr.fin, c.nom AS clinique, c.ville,
            u.nom AS praticien_nom, u.prenom AS praticien_prenom, pr.specialite
       FROM rendez_vous r
       JOIN creneaux cr USING (id_creneau)
       JOIN plages_disponibilite p USING (id_plage)
       JOIN cliniques c ON c.id_clinique = p.id_clinique
       JOIN utilisateurs u ON u.id_utilisateur = p.id_praticien
       JOIN praticiens pr ON pr.id_utilisateur = p.id_praticien
      WHERE r.id_rdv = $1`,
    [req.params.id],
  );
  if (!r) return res.status(404).json({ message: 'Rendez-vous introuvable' });
  if (req.user.id !== r.id_patient && req.user.id !== r.id_praticien) {
    return refuser(req, res, `rendez-vous ${r.id_rdv} d'un autre patient`);
  }
  const { motif_chiffre: motifChiffre, id_patient: idPatient, ...reste } = r;
  return res.json({ ...reste, motif: dechiffrer(motifChiffre, idPatient) });
});

// US-09 : annulation par le patient. Le créneau redevient réservable, patient et praticien sont prévenus.
router.patch('/:id/annulation', requirePermission('RDV_PRENDRE'), async (req, res) => {
  if (!estUuid(req.params.id)) return res.status(404).json({ message: 'Rendez-vous introuvable' });
  const outcome = await db.withTransaction(async (client) => {
    const { rows: [r] } = await client.query(
      `SELECT r.id_rdv, r.id_patient, r.statut, r.id_creneau,
              cr.debut - now() >= make_interval(hours => $2) AS delai_ok
         FROM rendez_vous r JOIN creneaux cr USING (id_creneau)
        WHERE r.id_rdv = $1
          FOR UPDATE OF r, cr`,
      [req.params.id, DELAI_H],
    );
    if (!r) return { status: 404, body: { message: 'Rendez-vous introuvable' } };
    if (r.id_patient !== req.user.id) return { refus: true };   // US-39 : contrôle de propriété
    if (r.statut !== 'planifie') return { status: 409, body: NON_MODIFIABLE };
    if (!r.delai_ok) return { status: 422, body: TROP_TARD };
    await client.query("UPDATE rendez_vous SET statut = 'annule', date_annulation = now() WHERE id_rdv = $1", [r.id_rdv]);
    await client.query("UPDATE creneaux SET statut = 'libre' WHERE id_creneau = $1", [r.id_creneau]);
    return { status: 200, body: { message: 'Rendez-vous annulé' } };
  });
  if (outcome.refus) return refuser(req, res, `annulation du rendez-vous ${req.params.id} d'un autre patient`);
  if (outcome.status === 200) {
    await notifierPatient(req.params.id, 'annulation');
    await notifierPraticien(req.params.id, 'annulation');
  }
  return res.status(outcome.status).json(outcome.body);
});

// US-10 : report. L'ancien créneau n'est libéré que si le nouveau a bien été verrouillé :
// le patient ne peut pas perdre son rendez-vous sans en obtenir un autre.
const reportSchema = Joi.object({ idCreneau: Joi.string().guid().required() });

router.patch('/:id/report', requirePermission('RDV_PRENDRE'), validate(reportSchema), async (req, res) => {
  if (!estUuid(req.params.id)) return res.status(404).json({ message: 'Rendez-vous introuvable' });
  try {
    const outcome = await db.withTransaction(async (client) => {
      const { rows: [r] } = await client.query(
        `SELECT r.id_rdv, r.id_patient, r.statut, r.id_creneau, r.motif_chiffre, p.id_praticien,
                cr.debut - now() >= make_interval(hours => $2) AS delai_ok
           FROM rendez_vous r JOIN creneaux cr USING (id_creneau) JOIN plages_disponibilite p USING (id_plage)
          WHERE r.id_rdv = $1
            FOR UPDATE OF r`,
        [req.params.id, DELAI_H],
      );
      if (!r) return { status: 404, body: { message: 'Rendez-vous introuvable' } };
      if (r.id_patient !== req.user.id) return { refus: true };   // US-39 : contrôle de propriété
      if (r.statut !== 'planifie') return { status: 409, body: NON_MODIFIABLE };
      if (!r.delai_ok) return { status: 422, body: TROP_TARD };
      if (req.body.idCreneau === r.id_creneau) return { status: 422, body: { message: 'Choisissez un autre créneau' } };

      // verrou sur les deux créneaux, toujours dans le même ordre (pas d'interblocage)
      const { rows: creneaux } = await client.query(
        `SELECT cr.id_creneau, cr.statut, cr.debut > now() AS a_venir, p.id_praticien
           FROM creneaux cr JOIN plages_disponibilite p USING (id_plage)
          WHERE cr.id_creneau = ANY($1::uuid[])
          ORDER BY cr.id_creneau
            FOR UPDATE OF cr`,
        [[r.id_creneau, req.body.idCreneau]],
      );
      const nouveau = creneaux.find((c) => c.id_creneau === req.body.idCreneau);
      if (!nouveau) return { status: 404, body: { message: 'Créneau introuvable' } };
      if (nouveau.id_praticien !== r.id_praticien) return { status: 422, body: { message: 'Le report se fait chez le même praticien' } };
      if (nouveau.statut !== 'libre' || !nouveau.a_venir) return { status: 409, body: PRIS };

      await client.query("UPDATE creneaux SET statut = 'libre' WHERE id_creneau = $1", [r.id_creneau]);
      await client.query("UPDATE creneaux SET statut = 'reserve' WHERE id_creneau = $1", [nouveau.id_creneau]);
      await client.query("UPDATE rendez_vous SET statut = 'reporte' WHERE id_rdv = $1", [r.id_rdv]);
      const { rows: [n] } = await client.query(
        `INSERT INTO rendez_vous (id_patient, id_creneau, motif_chiffre, statut, origine, id_rdv_origine)
         VALUES ($1, $2, $3, 'planifie', 'en_ligne', $4) RETURNING id_rdv`,
        [r.id_patient, nouveau.id_creneau, r.motif_chiffre, r.id_rdv],   // même patient : le motif chiffré reste valide
      );
      return { status: 200, body: { idRdv: n.id_rdv, message: 'Rendez-vous reporté' } };
    });
    if (outcome.refus) return refuser(req, res, `report du rendez-vous ${req.params.id} d'un autre patient`);
    if (outcome.status === 200) {
      await notifierPatient(outcome.body.idRdv, 'modification');
      await notifierPraticien(outcome.body.idRdv, 'report');
    }
    return res.status(outcome.status).json(outcome.body);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json(PRIS);   // index unique : dernier rempart
    throw err;
  }
});

module.exports = router;
