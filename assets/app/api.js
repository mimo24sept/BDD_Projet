/*
  Fichier: assets/app/api.js.
  Centralise les appels reseau pour garder un seul point de maintenance.
  Normalise les reponses afin d'alimenter un state stable.
*/
import { API } from './config.js';
import { state } from './state.js';
import { dom } from './dom.js';
import {
  canonicalCategory,
  formatDisplayDate,
  placeholderImage,
} from './utils.js';
/**
 * Recupere la session utilisateur courante.
 * Met a jour state.user selon la reponse.
 * En cas derreur, force user a null.
 */

export async function apiSession() {
  try {
    // Credentials pour reutiliser la session PHP existante.
    const res = await fetch(API.auth, { credentials: 'include' });
    const data = await res.json();
    state.user = data || null;
  } catch (e) {
    state.user = null;
  }
}
/**
 * Charge le catalogue depuis le backend.
 * Normalise categories, tags et reservations.
 * Complete picture/description dans state.inventory.
 */

export async function apiFetchEquipment() {
  try {
    const res = await fetch(API.equipment, { credentials: 'include' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'API equipement');
    // Normalisation pour simplifier les filtres et l'affichage.
    state.inventory = data.map((item) => {
      const rawCategories = Array.isArray(item.categories)
        ? item.categories
        : String(item.category || '')
          .split(/[,;]+/)
          .map((c) => c.trim())
          .filter(Boolean);
      const normalizedCategories = rawCategories
        .map(canonicalCategory)
        .filter(Boolean);
      const categories = normalizedCategories.length ? normalizedCategories : rawCategories;
      const tags = normalizedCategories.filter(Boolean);
      const categoryLabel = categories.length ? categories.join(', ') : (item.category || 'Non classé');
      const reservations = (item.reservations || [])
        .map((r) => ({
          start: r.start,
          end: r.end || r.start,
          type: r.type || '',
        }))
        .sort((a, b) => (a.start || '').localeCompare(b.start || ''));
      const descriptionParts = [
        item.notes,
        item.condition ? `Etat: ${item.condition}` : '',
        item.next_service ? `Maintenance prevue le ${formatDisplayDate(item.next_service)}` : '',
      ].filter(Boolean);
      return {
        ...item,
        category: categoryLabel,
        categories,
        tags,
        reservations,
        picture: item.picture || placeholderImage(item.name),
        description: descriptionParts.join(' — ') || 'Description a venir.',
      };
    });
  } catch (err) {
    state.inventory = [];
  }
}
/**
 * Charge les emprunts utilisateur et les stats.
 * Filtre les rendus et normalise l historique.
 * Met a jour notifications et demandes.
 */

export async function apiFetchLoans() {
  try {
    const res = await fetch(API.dashboard, { credentials: 'include' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'API emprunts');
    // On exclut les rendus pour ne garder que l'actif dans la liste.
    state.loans = (data.loans || []).filter((l) => l.status !== 'rendu');
    const rawHistory = Array.isArray(data?.stats?.history) ? data.stats.history : (data.loans || []);
    const history = normalizeHistory(rawHistory);
    state.loanHistory = history;
    state.stats = data.stats ? { ...data.stats, history } : { history };
    state.notifications = Array.isArray(data.notifications) ? data.notifications : [];
    state.maintenanceRequests = Array.isArray(data.maintenance_requests) ? data.maintenance_requests : [];
    state.reservationRequests = Array.isArray(data.reservation_requests) ? data.reservation_requests : [];
    if (dom.statsEls.msg) {
      dom.statsEls.msg.textContent = '';
      dom.statsEls.msg.className = 'message';
    }
  } catch (err) {
    state.loans = [];
    state.stats = null;
    state.loanHistory = [];
    state.notifications = [];
    state.maintenanceRequests = [];
    state.reservationRequests = [];
    if (dom.statsEls.msg) {
      dom.statsEls.msg.textContent = err?.message || 'Stats indisponibles';
      dom.statsEls.msg.className = 'message err';
    }
  }
}
/**
 * Charge les emprunts globaux cote admin.
 * Recupere aussi les demandes en attente.
 * Met a jour state.adminLoans et listes associees.
 */

export async function apiFetchAdminLoans() {
  try {
    // Scope=all pour charger les emprunts globaux cote admin.
    const res = await fetch(`${API.dashboard}?scope=all`, { credentials: 'include' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'API emprunts admin');
    state.adminLoans = data.loans || [];
    state.maintenanceRequests = Array.isArray(data.maintenance_requests) ? data.maintenance_requests : [];
    state.reservationRequests = Array.isArray(data.reservation_requests) ? data.reservation_requests : [];
    if (dom.adminStatsEls.msg && !state.adminStats) {
      dom.adminStatsEls.msg.textContent = '';
    }
  } catch (err) {
    state.adminLoans = [];
    state.maintenanceRequests = [];
    state.reservationRequests = [];
  }
}
/**
 * Charge les stats admin depuis le backend.
 * Met a jour state.adminStats et adminHistory.
 * Alimente le message derreur si besoin.
 */

export async function apiFetchAdminStats() {
  try {
    // Route dediee pour eviter de charger tout le dashboard.
    const res = await fetch(`${API.dashboard}?action=admin_stats`, { credentials: 'include' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'API stats');
    state.adminStats = data || { total_year: 0, delays: 0, degrades: 0 };
    state.adminHistory = data.history || [];
    if (dom.adminStatsEls.msg) dom.adminStatsEls.msg.textContent = '';
  } catch (err) {
    state.adminStats = { total_year: 0, delays: 0, degrades: 0 };
    state.adminHistory = [];
    if (dom.adminStatsEls.msg) {
      dom.adminStatsEls.msg.textContent = err?.message || 'Stats indisponibles';
      dom.adminStatsEls.msg.className = 'message err';
    }
  }
}
/**
 * Charge la liste des comptes utilisateurs.
 * Met a jour state.accounts.
 * Retourne une liste vide en cas derreur.
 */

export async function apiFetchUsers() {
  try {
    const res = await fetch(`${API.auth}?action=users`, { credentials: 'include' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'API users');
    state.accounts = Array.isArray(data) ? data : [];
  } catch (err) {
    state.accounts = [];
  }
}
/**
 * Envoie une mise a jour de role utilisateur.
 * Lance une erreur si le backend refuse.
 * Renvoie la reponse JSON en succes.
 */

export async function apiSetUserRole(id, role) {
  const res = await fetch(`${API.auth}?action=set_role`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ id, role }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || 'Mise à jour impossible');
  }
  return data;
}
/**
 * Supprime un utilisateur via l API.
 * Lance une erreur si le backend refuse.
 * Renvoie la reponse JSON en succes.
 */

export async function apiDeleteUser(id) {
  const res = await fetch(`${API.auth}?action=delete_user`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ id }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || 'Suppression impossible');
  }
  return data;
}
/**
 * Marque un pret comme rendu avec un etat.
 * Declenche ensuite un refresh des emprunts.
 * Lance une erreur si le retour est refuse.
 */

export async function apiReturnLoan(id, condition = '') {
  const res = await fetch(`${API.dashboard}?action=return`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ id, condition }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || 'Retour impossible');
  }
  await apiFetchLoans();
}
/**
 * Annule un pret cote admin.
 * Rafraichit les emprunts apres validation.
 * Lance une erreur si l annulation echoue.
 */

export async function apiAdminCancelLoan(id) {
  const res = await fetch(`${API.dashboard}?action=admin_cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ id }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || 'Annulation impossible');
  }
  await apiFetchLoans();
}
/**
 * Demande une annulation de pret cote user.
 * Rafraichit les emprunts apres envoi.
 * Lance une erreur si la demande echoue.
 */

export async function apiRequestCancel(id) {
  const res = await fetch(`${API.dashboard}?action=cancel_request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ id }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || 'Annulation impossible');
  }
  await apiFetchLoans();
}
/**
 * Demande une prolongation pour un pret.
 * Rafraichit les emprunts apres envoi.
 * Renvoie la reponse pour affichage.
 */

export async function apiRequestExtension(id, newDue) {
  const res = await fetch(`${API.dashboard}?action=extend_request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ id, new_due: newDue }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || 'Prolongation impossible');
  }
  await apiFetchLoans();
  return data;
}
/**
 * Accepte ou refuse une prolongation (admin).
 * Rafraichit les listes user/admin.
 * Renvoie la reponse pour feedback.
 */

export async function apiDecideExtension(id, decision) {
  const res = await fetch(`${API.dashboard}?action=extend_decide`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ id, decision }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || 'Traitement impossible');
  }
  await Promise.all([apiFetchLoans(), apiFetchAdminLoans()]);
  return data;
}
/**
 * Accepte ou refuse une reservation en attente.
 * Rafraichit catalogue et emprunts admin.
 * Renvoie la reponse du backend.
 */

export async function apiDecideReservationRequest(id, decision) {
  const res = await fetch(`${API.dashboard}?action=reservation_decide`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ id, decision }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || 'Traitement impossible');
  }
  await Promise.all([apiFetchAdminLoans(), apiFetchEquipment()]);
  return data;
}
/**
 * Appelle la route de deconnexion.
 * Ignore silencieusement les erreurs reseau.
 * Ne modifie pas le state directement.
 */

export async function apiLogout() {
  try {
    // Echec silencieux pour ne pas bloquer la redirection.
    await fetch(`${API.auth}?action=logout`, { method: 'POST', credentials: 'include' });
  } catch (e) {
    // Pas de remontee d'erreur pour ne pas bloquer la navigation.
  }
}
/**
 * Cree un materiel via FormData (image incluse).
 * Remonte les erreurs HTTP avec message.
 * Renvoie le materiel cree.
 */

export async function apiCreateEquipment(payload) {
  const form = new FormData();
  if (payload?.name) form.append('name', payload.name);
  if (payload?.location) form.append('location', payload.location);
  if (payload?.condition) form.append('condition', payload.condition);
  (payload?.categories || []).forEach((cat) => form.append('categories[]', cat));
  if (payload?.picture) form.append('picture', payload.picture);
  const res = await fetch(`${API.equipment}?action=create`, {
    method: 'POST',
    credentials: 'include',
    body: form,
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data?.error || 'Création impossible');
    err.status = res.status;
    throw err;
  }
  return data?.equipment;
}
/**
 * Supprime un materiel par identifiant.
 * Remonte les erreurs HTTP avec message.
 * Renvoie la reponse JSON.
 */

export async function apiDeleteEquipment(id) {
  const res = await fetch(`${API.equipment}?action=delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ id }),
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data?.error || 'Suppression impossible');
    err.status = res.status;
    throw err;
  }
  return data;
}
/**
 * Planifie une maintenance sur une periode.
 * Remonte les erreurs HTTP avec message.
 * Renvoie le resultat serveur.
 */

export async function apiSetMaintenance(payload) {
  const res = await fetch(`${API.equipment}?action=maintenance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data?.error || 'Maintenance impossible');
    err.status = res.status;
    throw err;
  }
  return data;
}
/**
 * Accepte ou refuse une demande maintenance.
 * Remonte les erreurs HTTP avec message.
 * Renvoie la reponse JSON.
 */

export async function apiDecideMaintenance(id, decision) {
  const res = await fetch(`${API.equipment}?action=maintenance_decide`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ id, decision }),
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data?.error || 'Traitement maintenance impossible');
    err.status = res.status;
    throw err;
  }
  return data;
}
/**
 * Normalise l historique pour les stats.
 * Ignore les entrees maintenance et calcule delai/degradation.
 * Ajoute des flags is_delay/is_degrade par defaut.
 */

function normalizeHistory(list = []) {
  const today = new Date();
  // Le backend peut renvoyer partiellement les flags, on les complete ici.
  return (Array.isArray(list) ? list : [])
    .filter((item) => (item.type || 'pret') !== 'maintenance')
    .map((item) => {
      const dueDate = item.due ? new Date(`${item.due}T00:00:00`) : null;
      const returnedDate = item.returned ? new Date(`${item.returned}T00:00:00`) : null;
      const dueValid = dueDate && !Number.isNaN(dueDate.getTime());
      const returnedValid = returnedDate && !Number.isNaN(returnedDate.getTime());
      const isDelayComputed = Boolean(dueValid)
        && ((returnedValid && returnedDate > dueDate) || (!returnedValid && dueDate < today));
      const returnState = item.return_state || '';
      const lowerState = String(returnState).toLowerCase();
      const isDegradeComputed = lowerState.startsWith('degrade') || String(returnState).includes('->');
      return {
        ...item,
        is_delay: item.is_delay ?? isDelayComputed,
        is_degrade: item.is_degrade ?? isDegradeComputed,
        type: item.type || 'pret',
      };
    });
}
