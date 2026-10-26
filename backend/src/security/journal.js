// US-39 : journal de sécurité. Chaque refus d'accès est écrit sur une ligne JSON
// (sortie standard du conteneur : docker compose logs api | grep ACCES_REFUSE).
// Au Sprint 4, ces événements seront aussi enregistrés dans la table journal_audit.
function journaliser(evenement, req, details = {}) {
  const ligne = {
    date: new Date().toISOString(),
    evenement,
    utilisateur: req.user ? req.user.id : null,
    role: req.user ? req.user.role : null,
    methode: req.method,
    route: req.originalUrl,
    ip: req.ip,
    ...details,
  };
  console.warn(JSON.stringify(ligne));
}

module.exports = { journaliser };
