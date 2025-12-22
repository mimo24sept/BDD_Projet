/*
  Fichier: assets/app/config.js
  Role: configuration statique partagee.
  Expose les endpoints API utilises par le front.
  Definit les tags de base et les rangs detat.
  Charge sans effets de bord.
*/
export const API = {
  auth: './api/auth.php',
  equipment: './api/equipment.php',
  dashboard: './api/dashboard.php',
};

export const BASE_TAGS = ['Info', 'Elen', 'Ener', 'Auto'];

export const CONDITION_RANKS = {
  'reparation nécessaire': 0,
  passable: 1,
  bon: 2,
  neuf: 3,
};
