// US-38 : maintenance annoncée. L'administrateur publie une annonce AU MOINS 48 h avant le début ;
// un bandeau s'affiche pour tous les utilisateurs (même non connectés) dès 48 h avant et jusqu'à la fin.
// Montée sur /api/maintenance :
//   GET /annonce        (public)              annonce à afficher maintenant, ou null
//   GET /, POST /, DELETE /:id  (MAINTENANCE_GERER)  liste, publication, annulation
const express = require('express');
const Joi = require('joi');
const db = require('../db');
const validate = require('../middleware/validate');
const { requirePermission } = require('../middleware/auth');
const { journaliser } = require('../security/journal');

const router = express.Router();

router.get('/annonce', async (req, res) => {
  const { rows: [a] } = await db.query(
    `SELECT id_annonce, debut, fin, message FROM annonces_maintenance
      WHERE NOT annulee AND fin > now() AND debut - interval '48 hours' <= now()
      ORDER BY debut LIMIT 1`,
  );
  res.set('Cache-Control', 'no-store');
  res.json({ annonce: a || null });
});

router.get('/', requirePermission('MAINTENANCE_GERER'), async (req, res) => {
  const { rows } = await db.query(
    `SELECT a.id_annonce, a.debut, a.fin, a.message, a.annulee, a.date_creation, u.prenom, u.nom
       FROM annonces_maintenance a LEFT JOIN utilisateurs u ON u.id_utilisateur = a.id_auteur
      WHERE a.fin > now() - interval '30 days'
      ORDER BY a.debut DESC`,
  );
  res.json(rows);
});

const annonceSchema = Joi.object({
  debut: Joi.date().iso().required(),
  fin: Joi.date().iso().required(),
  message: Joi.string().trim().min(5).max(300).required(),
});

router.post('/', requirePermission('MAINTENANCE_GERER'), validate(annonceSchema), async (req, res) => {
  const debut = new Date(req.body.debut);
  const fin = new Date(req.body.fin);
  if (fin <= debut) return res.status(400).json({ message: 'La fin doit suivre le début' });
  if (debut.getTime() - Date.now() < 48 * 3600 * 1000) {
    return res.status(422).json({ message: 'Une maintenance doit être annoncée au moins 48 heures à l\'avance' });
  }
  if (fin.getTime() - debut.getTime() > 72 * 3600 * 1000) return res.status(422).json({ message: 'Une maintenance dure au plus 72 heures' });
  const { rows: [a] } = await db.query(
    'INSERT INTO annonces_maintenance (debut, fin, message, id_auteur) VALUES ($1, $2, $3, $4) RETURNING id_annonce',
    [debut, fin, req.body.message, req.user.id],
  );
  journaliser('MAINTENANCE_ANNONCEE', req, { annonce: a.id_annonce, debut: debut.toISOString(), fin: fin.toISOString() });
  return res.status(201).json({ idAnnonce: a.id_annonce, message: 'Annonce publiée : le bandeau apparaîtra 48 h avant le début' });
});

router.delete('/:id', requirePermission('MAINTENANCE_GERER'), async (req, res) => {
  if (Joi.string().guid().validate(req.params.id).error) return res.status(404).json({ message: 'Annonce introuvable' });
  const { rowCount } = await db.query('UPDATE annonces_maintenance SET annulee = true WHERE id_annonce = $1 AND NOT annulee', [req.params.id]);
  if (!rowCount) return res.status(404).json({ message: 'Annonce introuvable' });
  journaliser('MAINTENANCE_ANNULEE', req, { annonce: req.params.id });
  return res.json({ message: 'Annonce annulée' });
});

module.exports = router;
