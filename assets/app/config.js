/*
  Fichier: assets/app/config.js.
  Centralise la config pour modifier les endpoints au meme endroit.
  Garde des tags/rangs communs pour un filtrage coherent.
  Sans effets de bord pour etre importable partout.
*/
function getBasePath() {
  let path = window.location.pathname || '/';
  if (path.length > 1 && path.endsWith('/')) {
    path = path.replace(/\/+$/, '');
  }
  if (path.endsWith('.html')) {
    return path.slice(0, path.lastIndexOf('/') + 1);
  }
  if (path.endsWith('/')) return path;
  return `${path}/`;
}

export const BASE_PATH = getBasePath();

// Endpoints regroupes pour eviter les URL en dur dispersees.
export const API = {
  auth: `${BASE_PATH}api/auth.php`,
  equipment: `${BASE_PATH}api/equipment.php`,
  dashboard: `${BASE_PATH}api/dashboard.php`,
};

// Tags de base pour les filtres rapides en UI.
export const BASE_TAGS = ['Info', 'Elen', 'Ener', 'Auto'];

// Rangs d'etat pour comparer degradations/ameliorations.
export const CONDITION_RANKS = {
  'reparation nécessaire': 0,
  passable: 1,
  bon: 2,
  neuf: 3,
};
