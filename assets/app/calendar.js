/*
  Fichier: assets/app/calendar.js.
  Concentre la logique dates pour eviter les divergences entre UI et regles.
  Reutilise la meme modale pour reservation, prolongation et maintenance.
*/
import { state } from './state.js';
import { dom } from './dom.js';
import { maxReservationDays } from './permissions.js';
import {
  escapeHtml,
  formatDisplayDate,
  formatDateLocal,
  normalizeDateOnly,
  isoWeekKey,
  weeksBetween,
  datesBetween,
  dateDiffDays,
  parseManualInput,
  formatManualInput,
} from './utils.js';

let dateStartInput = null;
let dateEndInput = null;
let blockedWeeks = [];
let blockedDates = {};
let reservationPeriods = [];
let modalMode = 'reserve';
let calendarMonth = null;
let selectedStartDate = null;
let selectedEndDate = null;
let extensionContext = null;
/**
 * Expose le mode courant de la modale.
 * Utile pour differencier reserve/extend/maintenance.
 * Retourne une chaine courte.
 */

export function getModalMode() {
  return modalMode;
}
/**
 * Expose le contexte de prolongation en cours.
 * Contient loanId, start et due.
 * Retourne null si non defini.
 */

export function getExtensionContext() {
  return extensionContext;
}
/**
 * Expose la map des dates bloquees.
 * Utilisee pour verifier une plage.
 * Retourne un objet date -> type.
 */

export function getBlockedDates() {
  return blockedDates;
}
/**
 * Prepare le contexte de prolongation depuis un pret.
 * Verifie lexistence du materiel associe.
 * Ouvre la modale en mode extend.
 */

export function openExtendModal(loan) {
  if (!loan || !loan.material_id || !loan.start || !loan.due) {
    alert('Matériel introuvable pour cette prolongation.');
    return;
  }
  const item = state.inventory.find((i) => i.id === loan.material_id);
  if (!item) {
    alert('Matériel introuvable pour cette prolongation.');
    return;
  }
  extensionContext = {
    loanId: loan.id,
    start: loan.start,
    due: loan.due,
  };
  openModal(item, 'extend');
}
/**
 * Ouvre la modale et prepare le calendrier.
 * Calcule les dates bloquees et la selection.
 * Configure les inputs et le bouton principal.
 */

export function openModal(item, mode = 'reserve') {
  if (!dom.modalTitle || !dom.modalBody || !dom.modalBackdrop) return;
  modalMode = mode;
  // On nettoie le contexte si on change de mode pour eviter un melange d'etats.
  if (modalMode !== 'extend') {
    extensionContext = null;
  }
  state.modalItem = item;
  blockedWeeks = Array.isArray(item.reserved_weeks) ? item.reserved_weeks : [];
  reservationPeriods = Array.isArray(item.reservations) ? item.reservations : [];
  // Map rapide pour verifier la dispo jour par jour.
  blockedDates = buildBlockedDates(reservationPeriods);
  if (modalMode === 'extend' && extensionContext?.start) {
    // On retire les dates de l'emprunt courant pour autoriser sa propre prolongation.
    const ownSpan = datesBetween(extensionContext.start, extensionContext.due || extensionContext.start);
    ownSpan.forEach((d) => {
      delete blockedDates[d];
    });
    selectedStartDate = extensionContext.start;
    selectedEndDate = null;
    // On ouvre le calendrier sur le mois de fin pour guider l'utilisateur.
    const baseMonth = extensionContext.due || extensionContext.start;
    calendarMonth = baseMonth ? new Date(`${baseMonth}T00:00:00`) : new Date();
  } else {
    selectedStartDate = null;
    selectedEndDate = null;
    calendarMonth = new Date();
  }
  dom.modalTitle.textContent = item.name;
  const picture = item.picture || './assets/placeholder.svg';
  const categoriesLabel = (item.categories && item.categories.length)
    ? item.categories.join(', ')
    : item.category;
  dom.modalBody.innerHTML = `
      <div class="modal-body-grid">
        <div class="modal-hero">
          <div class="hero-media">
            <img src="${picture}" alt="${escapeHtml(item.name)}" loading="lazy" />
          </div>
            <div class="hero-info">
              <div class="badge ${item.status === 'maintenance' ? 'status-maint' : 'status-ok'}">${escapeHtml(item.status || 'Etat')}</div>
              <div class="meta">Catégories : <strong>${escapeHtml(categoriesLabel || 'N/C')}</strong></div>
              <div class="meta">Référence : <strong>${escapeHtml(item.serial || 'N/C')}</strong></div>
              <div class="meta">Emplacement : <strong>${escapeHtml(item.location || 'Stock')}</strong></div>
              <p class="meta">${escapeHtml(item.description || 'Description a venir')}</p>
            </div>
          </div>
          <div class="modal-calendar">
            <div class="calendar-nav">
              <button type="button" class="ghost" id="cal-prev">&#8592;</button>
              <div class="small-title" id="cal-title"></div>
              <button type="button" class="ghost" id="cal-next">&#8594;</button>
            </div>
            <div class="input-group" style="grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); align-items:center; gap:8px; margin:10px 0;">
              <label style="font-weight:700;">Du
                <input id="manual-start" type="text" inputmode="numeric" placeholder="JJ/MM/AAAA" />
              </label>
              <label style="font-weight:700;">au
                <input id="manual-end" type="text" inputmode="numeric" placeholder="JJ/MM/AAAA" />
              </label>
            </div>
            <div class="calendar-grid" id="calendar-grid"></div>
          </div>
        </div>
      `;
  dateStartInput = dom.modalBody.querySelector('#manual-start');
  dateEndInput = dom.modalBody.querySelector('#manual-end');
  if (dateStartInput) {
    dateStartInput.addEventListener('input', handleManualDateInput);
    dateStartInput.disabled = modalMode === 'extend';
  }
  if (dateEndInput) {
    dateEndInput.addEventListener('input', handleManualDateInput);
    dateEndInput.disabled = false;
  }
  renderCalendar();
  syncManualInputs();
  if (dom.modalMsg) {
    dom.modalMsg.textContent = modalMode === 'extend' ? 'Choisissez une nouvelle date de fin.' : '';
    dom.modalMsg.className = 'message';
  }
  updateAvailabilityMessage();
  dom.modalBackdrop.classList.add('show');
  if (dom.reserveBtn) {
    // Libelles adaptes pour clarifier l'action en cours.
    dom.reserveBtn.textContent = modalMode === 'maintenance'
      ? 'Planifier maintenance'
      : (modalMode === 'extend' ? 'Prolonger' : 'Reserver');
  }
}
/**
 * Reinitialise letat de la modale.
 * Cache loverlay et oublie la selection.
 * Nettoie le contexte de prolongation.
 */

export function closeModal() {
  state.modalItem = null;
  modalMode = 'reserve';
  selectedStartDate = null;
  selectedEndDate = null;
  calendarMonth = null;
  extensionContext = null;
  if (dom.modalBackdrop) dom.modalBackdrop.classList.remove('show');
}
/**
 * Construit la grille du mois courant.
 * Marque les jours bloques et selectionnes.
 * Branche la navigation mois precedent/suivant.
 */

export function renderCalendar() {
  if (!dom.modalBody) return;
  const grid = dom.modalBody.querySelector('#calendar-grid');
  const titleEl = dom.modalBody.querySelector('#cal-title');
  const prev = dom.modalBody.querySelector('#cal-prev');
  const next = dom.modalBody.querySelector('#cal-next');
  if (!grid || !titleEl) return;
  if (!calendarMonth) calendarMonth = new Date();
  const year = calendarMonth.getUTCFullYear();
  const month = calendarMonth.getUTCMonth();
  const monthNames = ['Jan', 'Fev', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aou', 'Sep', 'Oct', 'Nov', 'Dec'];
  titleEl.textContent = `${monthNames[month]} ${year}`;
  if (prev) {
    prev.onclick = () => {
      calendarMonth.setUTCMonth(calendarMonth.getUTCMonth() - 1);
      renderCalendar();
    };
  }
  if (next) {
    next.onclick = () => {
      calendarMonth.setUTCMonth(calendarMonth.getUTCMonth() + 1);
      renderCalendar();
    };
  }
  const first = new Date(Date.UTC(year, month, 1));
  const startDay = (first.getUTCDay() || 7) - 1;
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells = [];
  for (let i = 0; i < startDay; i += 1) {
    cells.push(null);
  }
  for (let d = 1; d <= daysInMonth; d += 1) {
    cells.push(new Date(Date.UTC(year, month, d)));
  }
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }
  grid.innerHTML = '';
  const todayStr = new Date().toISOString().slice(0, 10);
  cells.forEach((cell) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'day-cell';
    if (!cell) {
      btn.classList.add('empty');
      btn.disabled = true;
      grid.appendChild(btn);
      return;
    }
    const dateStr = cell.toISOString().slice(0, 10);
    const isPast = dateStr < todayStr;
    const blockedType = blockedDates[dateStr];
    const canOverride = modalMode === 'maintenance' && blockedType && blockedType !== 'maintenance';
    const blocked = (Boolean(blockedType) && !canOverride) || isPast;
    const selected = isDateSelected(dateStr);
    const inRange = isDateInSelection(dateStr);
    btn.textContent = String(cell.getUTCDate());
    if (blocked) btn.classList.add('blocked');
    if (blockedType === 'maintenance') btn.classList.add('blocked-maint');
    if (canOverride && blockedType !== 'maintenance') btn.classList.add('busy-loan');
    else if (blockedType && blockedType !== 'maintenance') btn.classList.add('blocked-loan');
    if (isPast) btn.disabled = true;
    if (selected) btn.classList.add('selected');
    if (inRange && !selected) btn.classList.add('in-range');
    btn.onclick = () => handleDayClick(dateStr);
    grid.appendChild(btn);
  });
}
/**
 * Gere la selection start/end sur un clic jour.
 * Applique les limites de duree et disponibilite.
 * Relance le rendu et les messages.
 */

function handleDayClick(dateStr) {
  const todayStr = new Date().toISOString().slice(0, 10);
  if (modalMode === 'extend') {
    // En prolongation, le debut est fixe sur l'emprunt d'origine.
    if (!extensionContext?.start) return;
    if (dateStr < extensionContext.start) return;
    selectedStartDate = extensionContext.start;
    selectedEndDate = dateStr;
    const maxDays = maxReservationDays();
    const range = selectionRange();
    if (range && dateDiffDays(range.start, range.end) > maxDays) {
      selectedEndDate = null;
      if (dom.modalMsg) {
        dom.modalMsg.textContent = `Sélection limitée à ${maxDays} jours.`;
        dom.modalMsg.className = 'message err';
      }
    } else if (range && !isRangeFree(range.start, range.end)) {
      selectedEndDate = null;
      if (dom.modalMsg) {
        dom.modalMsg.textContent = 'Periode deja reservee';
        dom.modalMsg.className = 'message err';
      }
    }
    renderCalendar();
    syncManualInputs();
    updateAvailabilityMessage();
    return;
  }
  if (dateStr < todayStr) return;
  if (blockedDates[dateStr] && !(modalMode === 'maintenance' && blockedDates[dateStr] !== 'maintenance')) return;
  if (!selectedStartDate || (selectedStartDate && selectedEndDate)) {
    selectedStartDate = dateStr;
    selectedEndDate = null;
  } else if (!selectedEndDate) {
    if (new Date(`${dateStr}T00:00:00`) < new Date(`${selectedStartDate}T00:00:00`)) {
      selectedEndDate = selectedStartDate;
      selectedStartDate = dateStr;
    } else {
      selectedEndDate = dateStr;
    }
    const range = selectionRange();
    // Maintenance accepte des periodes longues, pas les reservations classiques.
    const maxDays = modalMode === 'maintenance' ? 365 : maxReservationDays();
    if (range && modalMode !== 'maintenance' && dateDiffDays(range.start, range.end) > maxDays) {
      selectedStartDate = dateStr;
      selectedEndDate = null;
    } else if (range && !isRangeFree(range.start, range.end)) {
      selectedStartDate = dateStr;
      selectedEndDate = null;
    }
  }
  renderCalendar();
  syncManualInputs();
  updateAvailabilityMessage();
}
/**
 * Indique si une date est un bord de selection.
 * Compare avec start ou end.
 * Retourne un booleen.
 */

function isDateSelected(dateStr) {
  return dateStr === selectedStartDate || dateStr === selectedEndDate;
}
/**
 * Teste si une date est a linterieur de la plage.
 * Sappuie sur datesBetween.
 * Retourne un booleen.
 */

function isDateInSelection(dateStr) {
  const range = selectionRange();
  if (!range) return false;
  const list = datesBetween(range.start, range.end);
  return list.includes(dateStr);
}
/**
 * Retourne la plage selectionnee start/end.
 * Ne renvoie rien si selection incomplete.
 * Utilisee avant validation.
 */

export function selectionRange() {
  if (!selectedStartDate) return null;
  if (!selectedEndDate) return null;
  const start = selectedStartDate;
  const end = selectedEndDate;
  return { start, end };
}
/**
 * Verifie quune plage ne chevauche pas de blocage.
 * Tient compte du mode maintenance.
 * Retourne true si libre.
 */

export function isRangeFree(start, end) {
  if (!start || !end) return false;
  const list = datesBetween(start, end);
  if (modalMode === 'maintenance') {
    return list.every((d) => (blockedDates[d] || '') !== 'maintenance');
  }
  return list.every((d) => !blockedDates[d]);
}
/**
 * Transforme les periodes en dates bloquees.
 * Priorise les maintenances sur les reservations.
 * Retourne une map date -> type.
 */

function buildBlockedDates(periods) {
  const dates = {};
  periods.forEach((p) => {
    const list = datesBetween(p.start, p.end || p.start);
    const type = (p.type || '').toLowerCase();
    // Maintenance prioritaire pour ne pas l'ecraser par une reservation.
    list.forEach((d) => {
      if (type === 'maintenance') {
        dates[d] = 'maintenance';
      } else if (!dates[d]) {
        dates[d] = 'reserve';
      }
    });
  });
  return dates;
}
/**
 * Repercute la selection dans les inputs manuels.
 * Formate en JJ/MM/AAAA.
 * Efface si aucune selection.
 */

function syncManualInputs() {
  if (dateStartInput) {
    dateStartInput.value = selectedStartDate ? formatManualInput(selectedStartDate) : '';
  }
  if (dateEndInput) {
    dateEndInput.value = selectedEndDate ? formatManualInput(selectedEndDate) : '';
  }
}
/**
 * Parse la saisie manuelle des dates.
 * Ajuste la selection et verifie les inversions.
 * Relance le rendu et les messages.
 */

function handleManualDateInput() {
  const startRaw = dateStartInput ? dateStartInput.value : '';
  const endRaw = dateEndInput ? dateEndInput.value : '';
  const start = parseManualInput(startRaw);
  const end = parseManualInput(endRaw);
  const todayStr = new Date().toISOString().slice(0, 10);
  if (modalMode === 'extend') {
    selectedStartDate = extensionContext?.start || null;
    if (end) {
      selectedEndDate = end;
      if (selectedStartDate && selectedEndDate < selectedStartDate) {
        selectedEndDate = null;
      }
    } else if (endRaw.trim() === '') {
      selectedEndDate = null;
    }
    renderCalendar();
    updateAvailabilityMessage();
    return;
  }
  if (start) {
    selectedStartDate = start < todayStr ? todayStr : start;
  } else if (startRaw.trim() === '') {
    selectedStartDate = null;
  }
  if (end) {
    selectedEndDate = end < todayStr ? todayStr : end;
  } else if (endRaw.trim() === '') {
    selectedEndDate = null;
  }
  if (selectedStartDate && selectedEndDate) {
    const startDate = new Date(`${selectedStartDate}T00:00:00`);
    const endDate = new Date(`${selectedEndDate}T00:00:00`);
    if (startDate > endDate) {
      [selectedStartDate, selectedEndDate] = [selectedEndDate, selectedStartDate];
    }
  }
  renderCalendar();
  updateAvailabilityMessage();
}
/**
 * Met a jour le bouton et le message de la modale.
 * Applique les regles de dates et de duree.
 * Active ou desactive le bouton selon la dispo.
 */

export function updateAvailabilityMessage() {
  const range = selectionRange();
  if (!dom.reserveBtn || !dom.modalMsg) return;
  if (!range) {
    dom.reserveBtn.disabled = true;
    dom.modalMsg.textContent = modalMode === 'extend' ? 'Choisissez une nouvelle date de fin.' : 'Choisissez un debut puis une fin.';
    dom.modalMsg.className = 'message';
    return;
  }
  const todayStr = new Date().toISOString().slice(0, 10);
  if (modalMode !== 'extend') {
    if (range.start < todayStr) {
      dom.reserveBtn.disabled = true;
      dom.modalMsg.textContent = 'Impossible de reserver dans le passe.';
      dom.modalMsg.className = 'message err';
      return;
    }
  } else {
    if (range.end < todayStr) {
      dom.reserveBtn.disabled = true;
      dom.modalMsg.textContent = 'La nouvelle date doit être future.';
      dom.modalMsg.className = 'message err';
      return;
    }
    const baseDue = extensionContext?.due || '';
    if (baseDue && range.end <= baseDue) {
      dom.reserveBtn.disabled = true;
      dom.modalMsg.textContent = 'Choisissez une date après la fin actuelle.';
      dom.modalMsg.className = 'message err';
      return;
    }
  }
  const maxDays = modalMode === 'maintenance' ? 365 : maxReservationDays();
  const diff = dateDiffDays(range.start, range.end);
  if (modalMode !== 'maintenance' && diff > maxDays) {
    dom.reserveBtn.disabled = true;
    dom.modalMsg.textContent = `Sélection limitée à ${maxDays} jours.`;
    dom.modalMsg.className = 'message err';
    return;
  }
  const free = isRangeFree(range.start, range.end);
  dom.reserveBtn.disabled = !free;
  const label = free ? 'message ok' : 'message err';
  dom.modalMsg.textContent = free
    ? `Du ${formatDisplayDate(range.start)} au ${formatDisplayDate(range.end)}`
    : 'Periode deja reservee';
  dom.modalMsg.className = label;
}
/**
 * Recherche la prochaine semaine non bloquee.
 * Teste jusqua 52 semaines a partir daujourdhui.
 * Retourne une date locale formatee.
 */

export function nextAvailableDate() {
  let cursor = new Date();
  for (let i = 0; i < 52; i += 1) {
    const key = isoWeekKey(cursor.toISOString().slice(0, 10));
    if (key && !blockedWeeks.includes(key)) {
      return formatDateLocal(cursor);
    }
    cursor.setDate(cursor.getDate() + 7);
  }
  return formatDateLocal(new Date());
}

export { datesBetween } from './utils.js';
