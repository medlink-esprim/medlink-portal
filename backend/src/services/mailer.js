// Envoi des e-mails. En développement, Mailpit les capture : http://localhost:8025
const nodemailer = require('nodemailer');
const config = require('../config');

const transporter = nodemailer.createTransport(config.smtpUrl);

async function sendMail({ to, subject, text }) {
  await transporter.sendMail({ from: config.mailFrom, to, subject, text });
}

const link = (pagePath, token) => `${config.appUrl}${pagePath}?token=${encodeURIComponent(token)}`;

module.exports = {
  sendMail,
  sendVerification: (to, prenom, token) => sendMail({
    to,
    subject: 'MedLink — vérifiez votre adresse e-mail',
    text: `Bonjour ${prenom},\n\nPour activer votre compte patient, ouvrez ce lien (valable 24 heures) :\n${link('/verification', token)}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message.`,
  }),
  sendReset: (to, prenom, token) => sendMail({
    to,
    subject: 'MedLink — réinitialisation du mot de passe',
    text: `Bonjour ${prenom},\n\nPour choisir un nouveau mot de passe, ouvrez ce lien (valable 30 minutes) :\n${link('/reinitialisation', token)}\n\nSi vous n'avez rien demandé, ignorez ce message : votre mot de passe reste inchangé.`,
  }),
  sendActivation: (to, prenom, token) => sendMail({
    to,
    subject: 'MedLink — activez votre compte',
    text: `Bonjour ${prenom},\n\nUn compte MedLink a été créé pour vous. Pour l'activer et choisir votre mot de passe, ouvrez ce lien (valable 72 heures) :\n${link('/activation', token)}`,
  }),
};
