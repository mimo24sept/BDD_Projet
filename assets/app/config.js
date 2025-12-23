/*
  Fichier: assets/app/config.js.
  Centralise la config pour modifier les endpoints au meme endroit.
  Garde des tags/rangs communs pour un filtrage coherent.
  Sans effets de bord pour etre importable partout.
*/
// Endpoints regroupes pour eviter les URL en dur dispersees.
export const API = {
  auth: './api/auth.php',
  equipment: './api/equipment.php',
  dashboard: './api/dashboard.php',
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
