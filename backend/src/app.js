// Application Express : middlewares communs + routes.
// server.js démarre l'écoute ; app.js est importé tel quel par les tests (Supertest).
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const config = require('./config');
const db = require('./db');
const rateLimit = require('express-rate-limit');

const app = express();
app.set('trust proxy', config.trustProxy); // derrière le proxy Vite / Nginx
app.disable('x-powered-by');
app.use(helmet());
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
// US-61 (scan ZAP) : réponses de l'API jamais mises en cache (données médicales)
app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

// Page de test (US-56) : lit une donnée en base via l'API
app.get('/api/health', async (req, res) => {
  const { rows } = await db.query('SELECT count(*)::int AS cliniques FROM cliniques');
  res.json({ status: 'ok', cliniques: rows[0].cliniques });
});

// US-49 : hors de la plage d'ouverture (HORAIRES_SERVICE), l'API répond 503 avec un message explicatif
const { horsService, etatService } = require('./security/horaires');
app.get('/api/horaires', (req, res) => res.json(etatService()));
app.use('/api', horsService);

// US-61 (scan ZAP) : frein global contre l'abus en production (600 requêtes / 5 min / adresse IP)
app.use('/api', rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: config.isProd ? 600 : 100000,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Trop de requêtes, réessayez dans quelques minutes.' },
}));

// ===== ROUTES : chaque user story ajoute sa ligne ici =====
// US-02 : frein contre les essais répétés (le verrouillage de compte arrive au Sprint 3, US-41)
app.use('/api/auth', rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.isProd ? 20 : 200,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // US-40 : la session courante, le rafraîchissement et la déconnexion ne comptent pas comme des essais
  skip: (req) => ['/me', '/refresh', '/logout'].includes(req.path),
  message: { message: 'Trop de tentatives, réessayez dans 15 minutes.' },
}));
app.use('/api/auth', require('./routes/session'));       // US-02 Iheb
app.use('/api/auth', require('./routes/mfa'));           // US-17, US-34 Jasser
app.use('/api/auth', require('./routes/inscription'));   // US-01 Akram
app.use('/api/auth', require('./routes/motDePasse'));    // US-03 Akram
app.use('/api/auth', require('./routes/activation'));    // US-27 Akram
app.use('/api/comptes', require('./routes/comptes'));    // US-27 Akram
app.use('/api/disponibilites', require('./routes/disponibilites'));   // US-18 Akram
app.use('/api/praticiens', require('./routes/praticiens'));         // US-05 Akram
app.use('/api/creneaux', require('./routes/creneaux'));             // US-06 Akram
app.use('/api/rendez-vous', require('./routes/rendezVous'));        // US-07 Iheb
app.use('/api/admin/roles', require('./routes/roles'));             // US-33 Iheb
app.use('/api/patients', require('./routes/patients'));             // US-11, US-12, US-13, US-15 Akram
app.use('/api/documents', require('./routes/documents'));           // US-14 Iheb
app.use('/api/praticien', require('./routes/praticien'));          // US-19 à US-25 (Sprint 4)
app.use('/api/accueil', require('./routes/accueil'));              // US-30 Akram
app.use('/api/admin/audit', require('./routes/audit'));            // US-35, US-36 Jasser
app.use('/api/maintenance', require('./routes/maintenance'));       // US-38 Iheb
app.use('/api/admin/demandes', require('./routes/demandes'));      // US-16 Akram
app.use('/api/statistiques', require('./routes/statistiques'));    // US-31 Akram, US-32, US-46, US-50, US-51
// ===== FIN DES ROUTES =====

// 404 pour toute route /api inconnue
app.use('/api', (req, res) => res.status(404).json({ message: 'Ressource introuvable' }));

// Gestionnaire d'erreurs : aucun détail technique n'est renvoyé au client
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // US-25 : corps trop volumineux (PDF > 10 Mo, JSON > 100 ko) ou illisible : erreur du client, pas du serveur
  if (err.type === 'entity.too.large') return res.status(413).json({ message: 'Fichier ou requête trop volumineux (10 Mo maximum pour un PDF)' });
  if (err.status >= 400 && err.status < 500 && err.expose) return res.status(err.status).json({ message: 'Requête invalide' });
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} :`, err.message);
  res.status(500).json({ message: 'Erreur interne du serveur' });
});

module.exports = app;
