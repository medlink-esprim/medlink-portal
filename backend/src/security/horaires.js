// US-49 : disponibilité du portail de 6 h à 22 h (heure de Tunis).
// HORAIRES_SERVICE=06:00-22:00 ; une plage qui passe minuit (22:00-06:00) est acceptée ; vide = toujours ouvert.
// Hors plage : 503 + message, sauf pour la santé du service, l'état des horaires et l'annonce de maintenance.
const config = require('../config');

const TOUJOURS = ['/health', '/horaires', '/maintenance/annonce'];

function lirePlage(texte) {
  const m = /^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/.exec(String(texte || '').trim());
  if (!m) return null;
  const [h1, m1, h2, m2] = m.slice(1).map(Number);
  if (h1 > 23 || m1 > 59 || m2 > 59 || h2 > 24 || (h2 === 24 && m2 > 0)) return null;
  return { debut: h1 * 60 + m1, fin: h2 * 60 + m2, texte: `${m[1]}:${m[2]}-${m[3]}:${m[4]}` };
}

function minutesTunis(date) {
  const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Tunis', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .format(date).split(':').map(Number);
  return h * 60 + m;
}

const hhmm = (min) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

function etatService(date = new Date(), texte = config.horairesService) {
  const plage = lirePlage(texte);
  if (!plage) return { ouvert: true, plage: null };
  const t = minutesTunis(date);
  const ouvert = plage.debut <= plage.fin ? t >= plage.debut && t < plage.fin : t >= plage.debut || t < plage.fin;
  return { ouvert, plage: plage.texte, ouverture: hhmm(plage.debut), fermeture: hhmm(plage.fin) };
}

function horsService(req, res, next) {
  if (!config.horairesService || TOUJOURS.includes(req.path)) return next();
  const etat = etatService();
  if (etat.ouvert) return next();
  res.set('Retry-After', '3600');
  return res.status(503).json({
    horsService: true,
    message: `MedLink est accessible de ${etat.ouverture.replace(':', ' h ')} à ${etat.fermeture.replace(':', ' h ')} (heure de Tunis). En cas d'urgence, appelez directement votre clinique.`,
    ...etat,
  });
}

module.exports = { etatService, horsService, lirePlage };
