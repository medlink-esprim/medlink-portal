// US-46 : anonymisation des statistiques exportées.
//  - uniquement des agrégats (comptages) : aucune colonne nominative ni identifiant ;
//  - petits effectifs masqués : un comptage entre 1 et SEUIL-1 devient « <3 »
//    (on ne peut pas reconnaître un patient à partir d'une ligne trop fine) ;
//  - CSV « ; » avec formules neutralisées.
const SEUIL = 3;
const COLONNES_INTERDITES = /(^|_)(nom|prenom|email|telephone|cin|adresse|ip|id_patient|id_utilisateur|id_praticien|numero_dossier|motif)($|_)/i;

function verifierColonnes(colonnes) {
  const interdite = colonnes.find((c) => COLONNES_INTERDITES.test(c));
  if (interdite) throw new Error(`Colonne non anonyme dans un export : ${interdite}`);
}

// masque les petits effectifs d'un tableau de lignes { ..., nombre }
function masquerPetitsEffectifs(lignes, champ = 'nombre', seuil = SEUIL) {
  return lignes.map((l) => {
    const n = Number(l[champ]);
    return n > 0 && n < seuil ? { ...l, [champ]: `<${seuil}` } : { ...l, [champ]: n };
  });
}

const cellule = (v) => {
  let t = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@]/.test(t)) t = `'${t}`;
  return `"${t.replace(/"/g, '""')}"`;
};

function versCsv(colonnes, lignes) {
  verifierColonnes(colonnes);
  const corps = lignes.map((l) => colonnes.map((c) => cellule(l[c])).join(';'));
  return `\uFEFF${colonnes.join(';')}\r\n${corps.join('\r\n')}${corps.length ? '\r\n' : ''}`;
}

module.exports = { SEUIL, verifierColonnes, masquerPetitsEffectifs, versCsv };
