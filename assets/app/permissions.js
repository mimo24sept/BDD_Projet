/*
  Fichier: assets/app/permissions.js
  Role: regles de roles et permissions.
  Calcule les acces admin/technicien/professeur.
  Definit les limites de reservation.
  Utilise pour filtrer onglets et actions.
*/
import { state } from './state.js';

export function isAdmin() {
  return (state.user?.role || '').toLowerCase().includes('admin');
}

export function isTechnician() {
  return (state.user?.role || '').toLowerCase().includes('technicien');
}

export function isProfessor() {
  return (state.user?.role || '').toLowerCase().includes('prof');
}

export function hasMaintenanceAccess() {
  return isTechnician() || isAdmin();
}

export function maxReservationDays() {
  return isProfessor() ? 21 : 14;
}

export function canViewAdminStats() {
  return isAdmin() || isTechnician();
}

export function allowedAdminStatsViews() {
  if (isAdmin()) return ['total', 'delays', 'degrades', 'maint'];
  if (isTechnician()) return ['degrades', 'maint'];
  return [];
}
