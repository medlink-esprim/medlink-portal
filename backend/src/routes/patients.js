// Espace patient : « moi » est toujours le patient du jeton, jamais un identifiant reçu.
// Montée sur /api/patients :
//   GET /moi/rendez-vous          (US-11) rendez-vous à venir, passés, annulés et reportés
//   GET /moi                      (US-15) profil, préférences et consentement
//   PUT /moi/coordonnees          (US-15) téléphone ; e-mail avec mot de passe actuel puis vérification
//   PUT /moi/preferences          (US-12) canaux de notification et rappel
//   POST /moi/consentement        (US-04) nouveau consentement à la politique en vigueur
const express = require('express');
const Joi = require('joi');
const argon2 = require('argon2');
const db = require('../db');
const validate = require('../middleware/validate');
const { requirePermission, requireRole } = require('../middleware/auth');
const { issueToken } = require('../security/tokens');
const mailer = require('../services/mailer');
const { POLITIQUE_VERSION } = require('../politique');

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

// US-15 : profil du patient connecté
router.get('/moi', requireRole('PATIENT'), async (req, res) => {
  const { rows: [u] } = await db.query(
    `SELECT u.nom, u.prenom, u.email, u.telephone, p.numero_dossier,
            COALESCE(pn.email_actif, true) AS email_actif, COALESCE(pn.sms_actif, false) AS sms_actif,
            COALESCE(pn.rappel_actif, true) AS rappel_actif,
            c.version_politique, c.date_consentement
       FROM utilisateurs u
       JOIN patients p ON p.id_utilisateur = u.id_utilisateur
       LEFT JOIN preferences_notification pn ON pn.id_patient = u.id_utilisateur
       LEFT JOIN LATERAL (SELECT version_politique, date_consentement FROM consentements
                           WHERE id_patient = u.id_utilisateur ORDER BY date_consentement DESC LIMIT 1) c ON true
      WHERE u.id_utilisateur = $1`,
    [req.user.id],
  );
  res.json({
    nom: u.nom,
    prenom: u.prenom,
    email: u.email,
    telephone: u.telephone,
    numeroDossier: u.numero_dossier,
    preferences: { emailActif: u.email_actif, smsActif: u.sms_actif, rappelActif: u.rappel_actif },
    consentement: u.version_politique ? { version: u.version_politique, date: u.date_consentement } : null,
    politiqueVersion: POLITIQUE_VERSION,
  });
});

const coordonneesSchema = Joi.object({
  telephone: Joi.string().trim().pattern(/^\+?[0-9 ]{8,20}$/).required(),
  email: Joi.string().trim().lowercase().email().max(160).required(),
  motDePasseActuel: Joi.string().max(128).allow(''),
});

// US-15 : coordonnées. Changer d'e-mail exige le mot de passe actuel, puis la vérification de
// la nouvelle adresse (lien envoyé) ; l'ancienne adresse est prévenue du changement.
router.put('/moi/coordonnees', requireRole('PATIENT'), validate(coordonneesSchema), async (req, res) => {
  const { telephone, email, motDePasseActuel } = req.body;
  const { rows: [u] } = await db.query('SELECT email, prenom, mot_de_passe_hash FROM utilisateurs WHERE id_utilisateur = $1', [req.user.id]);

  if (email === u.email) {
    await db.query('UPDATE utilisateurs SET telephone = $1 WHERE id_utilisateur = $2', [telephone, req.user.id]);
    return res.json({ message: 'Coordonnées enregistrées' });
  }

  let ok = false;
  try { ok = Boolean(motDePasseActuel) && await argon2.verify(u.mot_de_passe_hash, motDePasseActuel); } catch { ok = false; }
  if (!ok) return res.status(403).json({ message: 'Mot de passe actuel incorrect' });

  let token;
  try {
    token = await db.withTransaction(async (client) => {
      await client.query(
        'UPDATE utilisateurs SET telephone = $1, email = $2, email_verifie = false WHERE id_utilisateur = $3',
        [telephone, email, req.user.id],
      );
      return issueToken(client, req.user.id, 'verification_email', 24 * 60);
    });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'Cette adresse e-mail est déjà utilisée' });
    throw err;
  }
  await mailer.sendVerification(email, u.prenom, token);
  await mailer.sendMail({
    to: u.email,
    subject: 'MedLink — adresse e-mail modifiée',
    text: `Bonjour ${u.prenom},\n\nL'adresse e-mail de votre compte MedLink vient d'être remplacée par ${email}.\nSi vous n'êtes pas à l'origine de ce changement, contactez immédiatement votre clinique.`,
  });
  return res.json({ message: 'Coordonnées enregistrées. Confirmez la nouvelle adresse avec le lien reçu avant votre prochaine connexion.' });
});

const preferencesSchema = Joi.object({
  emailActif: Joi.boolean().required(),
  smsActif: Joi.boolean().required(),
  rappelActif: Joi.boolean().required(),
});

// US-12 : préférences de notification (rappel la veille, e-mail, SMS)
router.put('/moi/preferences', requireRole('PATIENT'), validate(preferencesSchema), async (req, res) => {
  const { emailActif, smsActif, rappelActif } = req.body;
  if (smsActif) {
    const { rows: [u] } = await db.query('SELECT telephone FROM utilisateurs WHERE id_utilisateur = $1', [req.user.id]);
    if (!u.telephone) return res.status(422).json({ message: 'Ajoutez un numéro de téléphone pour recevoir des SMS' });
  }
  await db.query(
    `INSERT INTO preferences_notification (id_patient, email_actif, sms_actif, rappel_actif)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (id_patient) DO UPDATE
       SET email_actif = EXCLUDED.email_actif, sms_actif = EXCLUDED.sms_actif, rappel_actif = EXCLUDED.rappel_actif`,
    [req.user.id, emailActif, smsActif, rappelActif],
  );
  return res.json({ message: 'Préférences enregistrées', preferences: { emailActif, smsActif, rappelActif } });
});

// US-04 : consentement à une nouvelle version de la politique (historisé, jamais écrasé)
router.post('/moi/consentement', requireRole('PATIENT'), async (req, res) => {
  await db.query(
    'INSERT INTO consentements (id_patient, version_politique, adresse_ip) VALUES ($1, $2, $3)',
    [req.user.id, POLITIQUE_VERSION, req.ip || null],
  );
  return res.status(201).json({ message: 'Consentement enregistré', version: POLITIQUE_VERSION });
});

module.exports = router;
