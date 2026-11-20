// US-35 : consultation du journal d'audit des accès aux dossiers médicaux (US-47) par l'administrateur.
// Montée sur /api/admin/audit (permission AUDIT_CONSULTER) :
//   GET /            liste filtrée et paginée (utilisateur, dossier, action, date et heure)
//   GET /export.csv  même filtre, fichier CSV (5 000 lignes au plus)
//   GET /alertes, PATCH /alertes/:id  (US-36) alertes d'accès suspect, à marquer comme traitées
// Toute consultation du journal est elle-même journalisée (AUDIT_CONSULTE).
const express = require('express');
const Joi = require('joi');
const db = require('../db');
const { requirePermission } = require('../middleware/auth');
const { journaliser } = require('../security/journal');
const { ACTIONS } = require('../security/acces');

const router = express.Router();
router.use(requirePermission('AUDIT_CONSULTER'));

const dateIso = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).custom((v, helpers) => (
  new Date(`${v}T00:00:00Z`).toISOString().startsWith(v) ? v : helpers.error('any.invalid')
), 'date du calendrier');
const filtreSchema = Joi.object({
  utilisateur: Joi.string().trim().max(80).allow(''),
  patient: Joi.string().trim().max(80).allow(''),
  action: Joi.string().valid(...ACTIONS).allow(''),
  du: dateIso.allow(''),
  au: dateIso.allow(''),
  page: Joi.number().integer().min(1).max(1000).default(1),
});
const motif = (q) => (q ? `%${q.replace(/[\\%_]/g, '\\$&')}%` : null);

// filtre commun à la liste et à l'export ; dates en heure de Tunis, bornes incluses
const FROM_WHERE = `
    FROM journal_acces_dossiers j
    LEFT JOIN utilisateurs u ON u.id_utilisateur = j.id_utilisateur
    LEFT JOIN utilisateurs p ON p.id_utilisateur = j.id_patient
    LEFT JOIN patients pa ON pa.id_utilisateur = j.id_patient
    LEFT JOIN documents_medicaux doc ON doc.id_document = j.id_document
   WHERE ($1::text IS NULL OR u.nom ILIKE $1 OR u.prenom ILIKE $1 OR u.email ILIKE $1 OR (u.prenom || ' ' || u.nom) ILIKE $1)
     AND ($2::text IS NULL OR p.nom ILIKE $2 OR p.prenom ILIKE $2 OR pa.numero_dossier ILIKE $2 OR (p.prenom || ' ' || p.nom) ILIKE $2)
     AND ($3::text IS NULL OR j.action = $3)
     AND ($4::date IS NULL OR j.date_acces >= $4::date::timestamp AT TIME ZONE 'Africa/Tunis')
     AND ($5::date IS NULL OR j.date_acces < ($5::date + 1)::timestamp AT TIME ZONE 'Africa/Tunis')`;
const COLONNES = `
  SELECT j.id_acces, j.date_acces, j.role, j.action, host(j.adresse_ip) AS adresse_ip,
         u.prenom AS utilisateur_prenom, u.nom AS utilisateur_nom, u.email AS utilisateur_email,
         p.prenom AS patient_prenom, p.nom AS patient_nom, pa.numero_dossier, doc.titre AS document`;

function filtres(req, res) {
  const { error, value } = filtreSchema.validate(req.query, { stripUnknown: true });
  if (error) { res.status(400).json({ message: 'Filtre invalide' }); return null; }
  return { value, params: [motif(value.utilisateur), motif(value.patient), value.action || null, value.du || null, value.au || null] };
}

const PAR_PAGE = 100;

router.get('/', async (req, res) => {
  const f = filtres(req, res);
  if (!f) return undefined;
  const [lignes, total] = await Promise.all([
    db.query(`${COLONNES} ${FROM_WHERE} ORDER BY j.id_acces DESC LIMIT ${PAR_PAGE} OFFSET $6`, [...f.params, (f.value.page - 1) * PAR_PAGE]),
    db.query(`SELECT count(*)::int AS n ${FROM_WHERE}`, f.params),
  ]);
  journaliser('AUDIT_CONSULTE', req, { filtres: f.value });
  return res.json({ total: total.rows[0].n, page: f.value.page, parPage: PAR_PAGE, lignes: lignes.rows });
});

// CSV : séparateur « ; » (Excel français), champs entre guillemets, formules neutralisées
const cellule = (v) => {
  let t = v === null || v === undefined ? '' : (v instanceof Date ? v.toISOString() : String(v));
  if (/^[=+\-@]/.test(t)) t = `'${t}`;
  return `"${t.replace(/"/g, '""')}"`;
};

router.get('/export.csv', async (req, res) => {
  const f = filtres(req, res);
  if (!f) return undefined;
  const { rows } = await db.query(`${COLONNES} ${FROM_WHERE} ORDER BY j.id_acces DESC LIMIT 5000`, f.params);
  journaliser('AUDIT_EXPORTE', req, { filtres: f.value, lignes: rows.length });
  const entete = ['date', 'role', 'utilisateur', 'email', 'patient', 'numero_dossier', 'action', 'document', 'adresse_ip'];
  const lignes = rows.map((r) => [r.date_acces, r.role, `${r.utilisateur_prenom || ''} ${r.utilisateur_nom || ''}`.trim(), r.utilisateur_email,
    `${r.patient_prenom || ''} ${r.patient_nom || ''}`.trim(), r.numero_dossier, r.action, r.document, r.adresse_ip].map(cellule).join(';'));
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', 'attachment; filename="journal-audit-medlink.csv"');
  res.set('Cache-Control', 'no-store');
  return res.send(`\uFEFF${entete.join(';')}\r\n${lignes.join('\r\n')}\r\n`);
});

// ===================== US-36 : alertes d'accès suspect =====================
router.get('/alertes', async (req, res) => {
  const { rows } = await db.query(
    `SELECT a.id_alerte, a.date_alerte, a.regle, a.nb_dossiers, a.details, a.statut, a.date_traitement,
            u.prenom, u.nom, u.email, r.code AS role
       FROM alertes_securite a
       LEFT JOIN utilisateurs u ON u.id_utilisateur = a.id_utilisateur
       LEFT JOIN roles r ON r.id_role = u.id_role
      ORDER BY (a.statut = 'nouvelle') DESC, a.date_alerte DESC
      LIMIT 50`,
  );
  res.json({ nouvelles: rows.filter((a) => a.statut === 'nouvelle').length, alertes: rows });
});

router.patch('/alertes/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(404).json({ message: 'Alerte introuvable' });
  const { rowCount } = await db.query(
    `UPDATE alertes_securite SET statut = 'traitee', id_traitant = $2, date_traitement = now()
      WHERE id_alerte = $1 AND statut = 'nouvelle'`,
    [id, req.user.id],
  );
  if (!rowCount) return res.status(404).json({ message: 'Alerte introuvable ou déjà traitée' });
  journaliser('ALERTE_TRAITEE', req, { alerte: id });
  return res.json({ message: 'Alerte marquée comme traitée' });
});

module.exports = router;
