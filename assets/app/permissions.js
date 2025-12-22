/*
  Fichier: assets/app/permissions.js
  Role: regles de roles et permissions.
  Calcule les acces admin/technicien/professeur.
  Definit les limites de reservation.
  Utilise pour filtrer onglets et actions.
*/
import { state } from './state.js';
/**
 * Teste si le role courant contient admin.
 * Utilise state.user et retourne un booleen.
 */

export function isAdmin() {
  return (state.user?.role || '').toLowerCase().includes('admin');
}
/**
 * Teste si le role courant contient technicien.
 * Retourne false si l utilisateur est absent.
 */

export function isTechnician() {
  return (state.user?.role || '').toLowerCase().includes('technicien');
}
/**
 * Teste si le role courant contient prof.
 * Utilise un match simple sur la chaine du role.
 */

export function isProfessor() {
  return (state.user?.role || '').toLowerCase().includes('prof');
}
/**
 * Autorise l acces maintenance pour admin ou technicien.
 * Centralise la regle dans un helper.
 */

export function hasMaintenanceAccess() {
  return isTechnician() || isAdmin();
}
/**
 * Renvoie la duree max autorisee pour une reservation.
 * 21 jours pour professeurs, 14 jours sinon.
 */

export function maxReservationDays() {
  return isProfessor() ? 21 : 14;
}
/**
 * Active les stats admin pour admin ou technicien.
 * Utilise la meme regle que l acces maintenance.
 */

export function canViewAdminStats() {
  return isAdmin() || isTechnician();
}
/**
 * Liste les vues stats autorisees selon le role.
 * Permet de filtrer l UI et les onglets.
 */

export function allowedAdminStatsViews() {
  if (isAdmin()) return ['total', 'delays', 'degrades', 'maint'];
  if (isTechnician()) return ['degrades', 'maint'];
  return [];
}
