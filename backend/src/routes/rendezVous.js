// US-07 : réservation transactionnelle d'un créneau.
// Montée sur /api/rendez-vous : POST / (patient), GET /:id (patient concerné ou praticien concerné)
const express = require('express');
const Joi = require('joi');
const db = require('../db');
const validate = require('../middleware/validate');
const { requireAuth, requireRole, refuser } = require('../middleware/auth');
const { chiffrer, dechiffrer } = require('../security/chiffrement');

const router = express.Router();
const PRIS = { message: "Ce créneau vient d'être réservé par un autre patient. Choisissez un autre créneau." };

const schema = Joi.object({
  idCreneau: Joi.string().guid().required(),
  motif: Joi.string().trim().max(500).allow(''),
});

router.post('/', requireRole('PATIENT'), validate(schema), async (req, res) => {
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

module.exports = router;
