// Espace patient : « moi » est toujours le patient du jeton, jamais un identifiant reçu.
// Montée sur /api/patients :
//   GET /moi/rendez-vous  (US-11) rendez-vous à venir, passés, annulés et reportés
const express = require('express');
const db = require('../db');
const { requirePermission } = require('../middleware/auth');

const router = express.Router();

// US-11 : historique des rendez-vous du patient connecté
router.get('/moi/rendez-vous', requirePermission('RDV_PRENDRE'), async (req, res) => {
  const { rows } = await db.query(
    `SELECT r.id_rdv, r.statut, r.id_rdv_origine, r.date_annulation, r.date_creation,
            cr.debut, cr.fin, c.nom AS clinique, c.ville,
            p.id_praticien, u.nom AS praticien_nom, u.prenom AS praticien_prenom, pr.specialite,
            (r.statut = 'planifie' AND cr.debut - now() >= interval '24 hours') AS modifiable
       FROM rendez_vous r
       JOIN creneaux cr USING (id_creneau)
       JOIN plages_disponibilite p USING (id_plage)
       JOIN cliniques c ON c.id_clinique = p.id_clinique
       JOIN utilisateurs u ON u.id_utilisateur = p.id_praticien
       JOIN praticiens pr ON pr.id_utilisateur = p.id_praticien
      WHERE r.id_patient = $1
      ORDER BY cr.debut DESC
      LIMIT 200`,
    [req.user.id],
  );
  res.json(rows);
});

module.exports = router;
