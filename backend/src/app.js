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

// Page de test (US-56) : lit une donnée en base via l'API
app.get('/api/health', async (req, res) => {
  const { rows } = await db.query('SELECT count(*)::int AS cliniques FROM cliniques');
  res.json({ status: 'ok', cliniques: rows[0].cliniques });
});

// ===== ROUTES : chaque user story ajoute sa ligne ici =====
// US-02 : frein contre les essais répétés (le verrouillage de compte arrive au Sprint 3, US-41)
app.use('/api/auth', rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.isProd ? 20 : 200,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Trop de tentatives, réessayez dans 15 minutes.' },
}));
app.use('/api/auth', require('./routes/session'));       // US-02 Iheb
app.use('/api/auth', require('./routes/inscription'));   // US-01 Akram
app.use('/api/auth', require('./routes/motDePasse'));    // US-03 Akram
app.use('/api/auth', require('./routes/activation'));    // US-27 Akram
app.use('/api/comptes', require('./routes/comptes'));    // US-27 Akram
// ===== FIN DES ROUTES =====

// 404 pour toute route /api inconnue
app.use('/api', (req, res) => res.status(404).json({ message: 'Ressource introuvable' }));

// Gestionnaire d'erreurs : aucun détail technique n'est renvoyé au client
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} :`, err.message);
  res.status(500).json({ message: 'Erreur interne du serveur' });
});

module.exports = app;
