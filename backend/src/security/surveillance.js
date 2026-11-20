// US-36 : détection d'accès suspect. Règle « ACCES_MASSIFS » : un même utilisateur ouvre au moins
// SEUIL_ACCES_SUSPECTS dossiers patients DIFFÉRENTS en une heure glissante (défaut : 20).
// Une seule alerte par utilisateur, règle et heure (contrainte UNIQUE) : l'administrateur reçoit
// un e-mail avec le détail des accès (numéros de dossier, jamais de donnée médicale).
const db = require('../db');
const config = require('../config');
const { journaliser } = require('./journal');

const REGLE = 'ACCES_MASSIFS';

async function verifierAccesSuspects(req) {
  if (!req.user || req.user.role === 'PATIENT') return null;   // un patient n'ouvre que son propre dossier
  const { rows: [c] } = await db.query(
    `SELECT count(DISTINCT j.id_patient)::int AS n,
            array_agg(DISTINCT pa.numero_dossier) FILTER (WHERE pa.numero_dossier IS NOT NULL) AS dossiers
       FROM journal_acces_dossiers j
       LEFT JOIN patients pa ON pa.id_utilisateur = j.id_patient
      WHERE j.id_utilisateur = $1 AND j.date_acces > now() - interval '1 hour'`,
    [req.user.id],
  );
  if (c.n < config.seuilAccesSuspects) return null;

  const details = { dossiers: (c.dossiers || []).slice(0, 50), seuil: config.seuilAccesSuspects, fenetre: '1 heure' };
  const { rows: [alerte] } = await db.query(
    `INSERT INTO alertes_securite (fenetre_debut, id_utilisateur, regle, nb_dossiers, details)
     VALUES (date_trunc('hour', now()), $1, $2, $3, $4)
     ON CONFLICT (id_utilisateur, regle, fenetre_debut) DO NOTHING
     RETURNING id_alerte`,
    [req.user.id, REGLE, c.n, details],
  );
  if (!alerte) return null;   // déjà signalé pour cette heure
  journaliser('ACCES_SUSPECT', req, { alerte: alerte.id_alerte, regle: REGLE, dossiers: c.n });

  const { rows: [u] } = await db.query('SELECT prenom, nom, email FROM utilisateurs WHERE id_utilisateur = $1', [req.user.id]);
  // chargé ici pour éviter une dépendance circulaire (notifications -> ... -> acces -> surveillance)
  const { notifierAdmins } = require('../services/notifications');
  await notifierAdmins({
    sujet: 'MedLink — ALERTE : accès suspect à des dossiers médicaux',
    texte: `Bonjour,\n\n${u ? `${u.prenom} ${u.nom} (${u.email})` : req.user.id} — rôle ${req.user.role} — a ouvert ${c.n} dossiers patients différents en moins d'une heure (seuil : ${config.seuilAccesSuspects}).\n\nDossiers concernés : ${details.dossiers.join(', ')}\nAdresse IP : ${req.ip}\n\nDétail complet : ${config.appUrl}/admin/audit\nSi l'accès n'est pas justifié, désactivez le compte depuis « Comptes ».`,
  });
  return alerte.id_alerte;
}

module.exports = { verifierAccesSuspects, REGLE };
