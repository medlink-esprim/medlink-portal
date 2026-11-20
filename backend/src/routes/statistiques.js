// Statistiques d'activité (Release 3). Montée sur /api/statistiques :
//   GET /supervision?du=&au=   (US-31, SUPERVISION_CONSULTER) occupation et rendez-vous par clinique
//   GET /export.csv?du=&au=    (US-32, STATS_EXPORTER) export anonymisé (US-46) semaine × clinique × spécialité
//   GET /synthese?annee=       (US-50, SYNTHESE_CONSULTER) chiffres clés par clinique et par mois
//   GET /appels?du=&au=        (US-51, SYNTHESE_CONSULTER) part des rendez-vous pris en ligne, mois par mois
// Aucune donnée nominative : uniquement des comptages par clinique.
const express = require('express');
const Joi = require('joi');
const db = require('../db');
const { requirePermission } = require('../middleware/auth');
const { journaliser } = require('../security/journal');
const { masquerPetitsEffectifs, versCsv } = require('../services/anonymisation');

const router = express.Router();

const dateIso = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).custom((v, helpers) => (
  new Date(`${v}T00:00:00Z`).toISOString().startsWith(v) ? v : helpers.error('any.invalid')
), 'date du calendrier');
const periodeSchema = Joi.object({ du: dateIso, au: dateIso });

// période par défaut : le mois en cours (heure de Tunis) ; 366 jours au plus
async function lirePeriode(req, res, parDefaut = {}) {
  const { error, value } = periodeSchema.validate({ ...parDefaut, ...req.query }, { stripUnknown: true });
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

// US-32 : export CSV anonymisé — une ligne par semaine ISO, clinique, spécialité, origine et statut.
// Aucune colonne nominative ; les effectifs de 1 ou 2 sont masqués (« <3 »).
const SQL_EXPORT = `
  SELECT to_char(c.debut AT TIME ZONE 'Africa/Tunis', 'IYYY-"S"IW') AS semaine,
         k.ville AS clinique, COALESCE(pr.specialite, 'Non renseignée') AS specialite,
         r.origine::text AS origine, r.statut::text AS statut, count(*)::int AS nombre
    FROM rendez_vous r
    JOIN creneaux c USING (id_creneau)
    JOIN plages_disponibilite p USING (id_plage)
    JOIN cliniques k ON k.id_clinique = p.id_clinique
    LEFT JOIN praticiens pr ON pr.id_utilisateur = p.id_praticien
   WHERE c.debut >= $1::date::timestamp AT TIME ZONE 'Africa/Tunis'
     AND c.debut < ($2::date + 1)::timestamp AT TIME ZONE 'Africa/Tunis'
     AND r.statut <> 'reporte'
   GROUP BY 1, 2, 3, 4, 5
   ORDER BY 1, 2, 3, 4, 5`;
const COLONNES_EXPORT = ['semaine', 'clinique', 'specialite', 'origine', 'statut', 'nombre'];

router.get('/export.csv', requirePermission('STATS_EXPORTER'), async (req, res) => {
  const p = await lirePeriode(req, res);
  if (!p) return undefined;
  const { rows } = await db.query(SQL_EXPORT, [p.du, p.au]);
  const lignes = masquerPetitsEffectifs(rows);
  journaliser('STATS_EXPORTEES', req, { du: p.du, au: p.au, lignes: lignes.length });
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="statistiques-medlink-${p.du}-${p.au}.csv"`);
  res.set('Cache-Control', 'no-store');
  return res.send(versCsv(COLONNES_EXPORT, lignes));
});

// ===================== US-50 : synthèse de la Direction =====================
// Chiffres clés par clinique et par mois (mois du rendez-vous, heure de Tunis), pour une année.
const SQL_SYNTHESE = `
  SELECT k.ville AS clinique, extract(month FROM c.debut AT TIME ZONE 'Africa/Tunis')::int AS mois,
         count(*)::int AS rendez_vous,
         count(*) FILTER (WHERE r.statut = 'honore')::int AS honores,
         count(*) FILTER (WHERE r.statut = 'manque')::int AS manques,
         count(*) FILTER (WHERE r.statut = 'annule')::int AS annules,
         count(*) FILTER (WHERE r.origine = 'en_ligne')::int AS en_ligne,
         count(DISTINCT r.id_patient)::int AS patients
    FROM rendez_vous r
    JOIN creneaux c USING (id_creneau)
    JOIN plages_disponibilite p USING (id_plage)
    JOIN cliniques k ON k.id_clinique = p.id_clinique
   WHERE extract(year FROM c.debut AT TIME ZONE 'Africa/Tunis') = $1 AND r.statut <> 'reporte'
   GROUP BY 1, 2`;
const CHIFFRES = ['rendez_vous', 'honores', 'manques', 'annules', 'en_ligne'];

router.get('/synthese', requirePermission('SYNTHESE_CONSULTER'), async (req, res) => {
  const { error, value } = Joi.object({ annee: Joi.number().integer().min(2020).max(2100) }).validate(req.query, { stripUnknown: true });
  if (error) return res.status(400).json({ message: 'Année invalide' });
  const annee = value.annee || Number(new Intl.DateTimeFormat('en', { timeZone: 'Africa/Tunis', year: 'numeric' }).format(new Date()));
  const [{ rows }, { rows: cliniques }] = await Promise.all([
    db.query(SQL_SYNTHESE, [annee]),
    db.query('SELECT ville, nom FROM cliniques ORDER BY ville'),
  ]);
  const vide = () => Object.fromEntries(CHIFFRES.map((k) => [k, 0]));
  const parClinique = cliniques.map((k) => {
    const mois = Array.from({ length: 12 }, (_, i) => ({ mois: i + 1, ...vide(), ...(rows.find((r) => r.clinique === k.ville && r.mois === i + 1) || {}) }))
      .map(({ clinique, patients, ...m }) => ({ ...m, taux_en_ligne: taux(m.en_ligne, m.rendez_vous) }));
    const total = Object.fromEntries(CHIFFRES.map((c) => [c, mois.reduce((s, m) => s + m[c], 0)]));
    return { clinique: k.ville, nom: k.nom, mois, total: { ...total, taux_honores: taux(total.honores, total.rendez_vous - total.annules), taux_en_ligne: taux(total.en_ligne, total.rendez_vous) } };
  });
  const total = Object.fromEntries(CHIFFRES.map((c) => [c, parClinique.reduce((s, k) => s + k.total[c], 0)]));
  return res.json({ annee, cliniques: parClinique, total: { ...total, taux_en_ligne: taux(total.en_ligne, total.rendez_vous) } });
});

// ===================== US-51 : suivi de la baisse des appels =====================
// Part des rendez-vous pris en ligne (date de prise du rendez-vous), mois par mois.
// Hypothèse du cahier des charges : avant le portail, tous les rendez-vous passaient par le standard ;
// une part en ligne de 40 % correspond donc à la baisse de 40 % des appels visée.
const OBJECTIF_EN_LIGNE = 40;
const SQL_APPELS = `
  SELECT to_char(r.date_creation AT TIME ZONE 'Africa/Tunis', 'YYYY-MM') AS mois,
         count(*)::int AS rendez_vous,
         count(*) FILTER (WHERE r.origine = 'en_ligne')::int AS en_ligne,
         count(*) FILTER (WHERE r.origine = 'accueil')::int AS accueil
    FROM rendez_vous r
   WHERE r.date_creation >= $1::date::timestamp AT TIME ZONE 'Africa/Tunis'
     AND r.date_creation < ($2::date + 1)::timestamp AT TIME ZONE 'Africa/Tunis'
     AND r.statut <> 'reporte'
   GROUP BY 1 ORDER BY 1`;

router.get('/appels', requirePermission('SYNTHESE_CONSULTER'), async (req, res) => {
  let parDefaut = {};
  if (!req.query.du && !req.query.au) {     // par défaut : les 12 derniers mois
    const { rows: [d] } = await db.query(
      `SELECT to_char(date_trunc('month', (now() AT TIME ZONE 'Africa/Tunis')::date) - interval '11 months', 'YYYY-MM-DD') AS du,
              to_char((now() AT TIME ZONE 'Africa/Tunis')::date, 'YYYY-MM-DD') AS au`,
    );
    parDefaut = d;
  }
  const p = await lirePeriode(req, res, parDefaut);
  if (!p) return undefined;
  const { rows } = await db.query(SQL_APPELS, [p.du, p.au]);
  let precedent = null;
  const mois = rows.map((m) => {
    const part = taux(m.en_ligne, m.rendez_vous);
    const evolution = precedent === null || part === null ? null : Math.round((part - precedent) * 10) / 10;
    precedent = part;
    return { ...m, part_en_ligne: part, evolution };
  });
  const somme = (k) => rows.reduce((s, m) => s + m[k], 0);
  const part = taux(somme('en_ligne'), somme('rendez_vous'));
  return res.json({
    du: p.du, au: p.au, objectif: OBJECTIF_EN_LIGNE, mois,
    total: { rendez_vous: somme('rendez_vous'), en_ligne: somme('en_ligne'), accueil: somme('accueil'), part_en_ligne: part, objectif_atteint: part !== null && part >= OBJECTIF_EN_LIGNE },
  });
});

module.exports = router;
module.exports.lirePeriode = lirePeriode;
