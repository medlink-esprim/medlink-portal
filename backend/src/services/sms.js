// Passerelle SMS. Aucun contrat avec un opérateur n'existe dans le cadre du projet : le message
// est écrit dans le journal de l'API (docker compose logs api | grep SMS_SIMULE).
// En production, remplacer le corps de envoyerSms par l'appel à l'API de l'opérateur choisi.
const masquer = (numero) => String(numero || '').replace(/\d(?=\d{2})/g, '•');   // seuls les 2 derniers chiffres

async function envoyerSms(numero, texte) {
  console.log(JSON.stringify({ date: new Date().toISOString(), evenement: 'SMS_SIMULE', numero: masquer(numero), texte }));
}

module.exports = { envoyerSms };
