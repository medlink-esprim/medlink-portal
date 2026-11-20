// Statistiques d'activité (Release 3). Montée sur /api/statistiques :
//   GET /supervision?du=&au=   (US-31, SUPERVISION_CONSULTER) occupation et rendez-vous par clinique
// Aucune donnée nominative : uniquement des comptages par clinique.
const express = require('express');
const Joi = require('joi');
const db = require('../db');
const { requirePermission } = require('../middleware/auth');

const router = express.Router();

const dateIso = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).custom((v, helpers) => (
  new Date(`${v}T00:00:00Z`).toISOString().startsWith(v) ? v : helpers.error('any.invalid')
), 'date du calendrier');
const periodeSchema = Joi.object({ du: dateIso, au: dateIso });

// période par défaut : le mois en cours (heure de Tunis) ; 366 jours au plus
async function lirePeriode(req, res) {
  const { error, value } = periodeSchema.validate(req.query, { stripUnknown: true });
  if (error) { res.status(400).json({ message: 'Période invalide' }); return null; }
  const { rows: [p] } = await db.query(
    `WITH a AS (SELECT (now() AT TIME ZONE 'Africa/Tunis')::date AS j)
     SELECT to_char(COALESCE($1::date, date_trunc('month', a.j)::date), 'YYYY-MM-DD') AS du,
            to_char(COALESCE($2::date, (date_trunc('month', a.j) + interval '1 month - 1 day')::date), 'YYYY-MM-DD') AS au
       FROM a`,
    [value.du || null, value.au || null],
  );
  if (p.au < p.du || (new Date(p.au) - new Date(p.du)) / 86400000 > 366) {
    res.status(400).json({ message: 'Période invalide (366 jours au plus)' });
    return null;
  }
  return p;
}

// US-31 : par clinique — créneaux ouverts (hors bloqués), réservés, taux d'occupation,
// rendez-vous par statut et par origine (en ligne / accueil). Un report ne compte qu'une fois.
const SQL_SUPERVISION = `
  WITH periode AS (SELECT $1::date::timestamp AT TIME ZONE 'Africa/Tunis' AS d1,
                          ($2::date + 1)::timestamp AT TIME ZONE 'Africa/Tunis' AS d2),
  cr AS (SELECT p.id_clinique, c.statut
           FROM creneaux c JOIN plages_disponibilite p USING (id_plage), periode
          WHERE c.debut >= periode.d1 AND c.debut < periode.d2),
  rv AS (SELECT p.id_clinique, r.statut, r.origine
           FROM rendez_vous r JOIN creneaux c USING (id_creneau) JOIN plages_disponibilite p USING (id_plage), periode
          WHERE c.debut >= periode.d1 AND c.debut < periode.d2 AND r.statut <> 'reporte')
  SELECT k.id_clinique, k.nom, k.ville,
         (SELECT count(*) FROM cr WHERE cr.id_clinique = k.id_clinique AND cr.statut <> 'bloque')::int AS creneaux_ouverts,
         (SELECT count(*) FROM cr WHERE cr.id_clinique = k.id_clinique AND cr.statut = 'reserve')::int AS creneaux_reserves,
         (SELECT count(*) FROM rv WHERE rv.id_clinique = k.id_clinique)::int AS rendez_vous,
         (SELECT count(*) FROM rv WHERE rv.id_clinique = k.id_clinique AND rv.statut = 'planifie')::int AS planifies,
         (SELECT count(*) FROM rv WHERE rv.id_clinique = k.id_clinique AND rv.statut = 'honore')::int AS honores,
         (SELECT count(*) FROM rv WHERE rv.id_clinique = k.id_clinique AND rv.statut = 'manque')::int AS manques,
         (SELECT count(*) FROM rv WHERE rv.id_clinique = k.id_clinique AND rv.statut = 'annule')::int AS annules,
         (SELECT count(*) FROM rv WHERE rv.id_clinique = k.id_clinique AND rv.origine = 'en_ligne')::int AS en_ligne,
         (SELECT count(*) FROM rv WHERE rv.id_clinique = k.id_clinique AND rv.origine = 'accueil')::int AS accueil,
         (SELECT count(DISTINCT pc.id_praticien) FROM praticien_clinique pc
            JOIN utilisateurs u ON u.id_utilisateur = pc.id_praticien
           WHERE pc.id_clinique = k.id_clinique AND pc.actif AND u.statut = 'actif')::int AS praticiens
    FROM cliniques k
   ORDER BY k.ville`;

const taux = (n, d) => (d ? Math.round((1000 * n) / d) / 10 : null);

router.get('/supervision', requirePermission('SUPERVISION_CONSULTER'), async (req, res) => {
  const p = await lirePeriode(req, res);
  if (!p) return undefined;
  const { rows } = await db.query(SQL_SUPERVISION, [p.du, p.au]);
  const cliniques = rows.map((r) => ({ ...r, taux_occupation: taux(r.creneaux_reserves, r.creneaux_ouverts) }));
  const somme = (k) => cliniques.reduce((s, c) => s + c[k], 0);
  const total = Object.fromEntries(['creneaux_ouverts', 'creneaux_reserves', 'rendez_vous', 'honores', 'annules', 'en_ligne', 'accueil'].map((k) => [k, somme(k)]));
  return res.json({ du: p.du, au: p.au, cliniques, total: { ...total, taux_occupation: taux(total.creneaux_reserves, total.creneaux_ouverts) } });
});

module.exports = router;
module.exports.lirePeriode = lirePeriode;
