// US-41 : protection anti brute-force.
// Après 5 échecs consécutifs (mot de passe ou code MFA), le compte est verrouillé 15 minutes,
// même si le bon mot de passe est ensuite saisi. Chaque échec et chaque verrouillage sont journalisés.
// Le compteur n'est remis à zéro qu'après une connexion COMPLÈTE (mot de passe + MFA) ou une
// réinitialisation du mot de passe : connaître le mot de passe ne suffit pas à le remettre à zéro.
const db = require('../db');
const { journaliser } = require('./journal');

const SEUIL = 5;
const DUREE_MIN = 15;
const MESSAGE_VERROU = {
  message: `Compte temporairement verrouillé après ${SEUIL} tentatives échouées. Réessayez dans ${DUREE_MIN} minutes ou réinitialisez votre mot de passe.`,
};

async function enregistrerEchec(idUtilisateur, req, etape) {
  // les deux CASE lisent l'ancienne valeur du compteur : le 5e échec verrouille et remet le compteur à 0
  const { rows: [u] } = await db.query(
    `UPDATE utilisateurs
        SET tentatives_echouees = CASE WHEN tentatives_echouees + 1 >= $2 THEN 0 ELSE tentatives_echouees + 1 END,
            verrouille_jusqua   = CASE WHEN tentatives_echouees + 1 >= $2
                                       THEN now() + make_interval(mins => $3) ELSE verrouille_jusqua END
      WHERE id_utilisateur = $1
      RETURNING tentatives_echouees, COALESCE(verrouille_jusqua > now(), false) AS verrouille`,
    [idUtilisateur, SEUIL, DUREE_MIN],
  );
  if (!u) return { verrouille: false };
  journaliser('CONNEXION_ECHEC', req, { utilisateur: idUtilisateur, etape, tentatives: u.verrouille ? SEUIL : u.tentatives_echouees });
  if (u.verrouille) journaliser('COMPTE_VERROUILLE', req, { utilisateur: idUtilisateur, dureeMin: DUREE_MIN });
  return { verrouille: u.verrouille };
}

async function reinitialiserEchecs(idUtilisateur, client = db) {
  await client.query(
    `UPDATE utilisateurs SET tentatives_echouees = 0, verrouille_jusqua = NULL
      WHERE id_utilisateur = $1 AND (tentatives_echouees <> 0 OR verrouille_jusqua IS NOT NULL)`,
    [idUtilisateur],
  );
}

module.exports = { SEUIL, DUREE_MIN, MESSAGE_VERROU, enregistrerEchec, reinitialiserEchecs };
