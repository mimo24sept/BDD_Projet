/*
  Fichier: assets/app.js
  Role: point dentree du tableau de bord.
  Initialise letat, branche les events et lance les chargements.
  Coordonne les rendus et les redirections.
  Sappuie sur les modules du dossier assets/app/.
*/
import { API } from './app/config.js';
import { state } from './app/state.js';
import { dom } from './app/dom.js';
import {
  apiCreateEquipment,
  apiFetchAdminLoans,
  apiFetchAdminStats,
  apiFetchEquipment,
  apiFetchLoans,
  apiFetchUsers,
  apiLogout,
  apiRequestExtension,
  apiSession,
  apiSetMaintenance,
} from './app/api.js';
import {
  closeModal,
  datesBetween,
  getBlockedDates,
  getExtensionContext,
  getModalMode,
  isRangeFree,
  selectionRange,
} from './app/calendar.js';
import { hasMaintenanceAccess, isAdmin, isTechnician } from './app/permissions.js';
import {
  exportInventoryPdf,
  renderAdminCatalog,
  renderAdminLoans,
  renderAdminStats,
  renderAdminStatsList,
  renderApp,
  renderCatalog,
  renderLoans,
  renderMaintenanceCatalog,
  renderTags,
  renderUserStatsList,
  renderStats,
} from './app/render.js';
import { setAuthUI, setupTabIndicatorResize, updateTabs } from './app/ui.js';
import { placeholderImage } from './app/utils.js';

if (!dom.appShell) {
  // Stop early if we are not on the dashboard page.
} else {
  setupTabIndicatorResize();

  if (dom.logoutBtn) {
    dom.logoutBtn.addEventListener('click', async () => {
      await apiLogout();
      state.user = null;
      window.location.href = 'index.html';
    });
  }

  dom.tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const nextTab = tab.dataset.tab;
      if (state.activeTab === nextTab) return;
      state.activeTab = nextTab;
      updateTabs();
    });
  });

  if (dom.searchInput) {
    dom.searchInput.addEventListener('input', () => {
      state.filters.search = dom.searchInput.value.toLowerCase();
      renderCatalog();
    });
  }
  if (dom.loanSearchInput) {
    dom.loanSearchInput.addEventListener('input', () => {
      state.loanSearch = dom.loanSearchInput.value.toLowerCase();
      renderLoans();
    });
  }
  if (dom.maintenanceSearchInput) {
    dom.maintenanceSearchInput.addEventListener('input', () => {
      state.maintenanceFilters.search = dom.maintenanceSearchInput.value.toLowerCase();
      renderMaintenanceCatalog();
    });
  }
  if (dom.adminLoanSearchInput) {
    dom.adminLoanSearchInput.addEventListener('input', () => {
      state.adminLoanSearch = dom.adminLoanSearchInput.value.toLowerCase();
      renderAdminLoans();
    });
  }
  if (dom.adminStatsEls.search) {
    dom.adminStatsEls.search.addEventListener('input', () => {
      state.adminHistorySearch = dom.adminStatsEls.search.value.toLowerCase();
      renderAdminStatsList();
    });
  }
  if (dom.statsEls.cards.total) {
    dom.statsEls.cards.total.addEventListener('click', () => {
      state.userStatsView = 'total';
      renderStats();
      renderUserStatsList();
    });
  }
  if (dom.statsEls.cards.delays) {
    dom.statsEls.cards.delays.addEventListener('click', () => {
      state.userStatsView = 'delays';
      renderStats();
      renderUserStatsList();
    });
  }
  if (dom.statsEls.cards.degrades) {
    dom.statsEls.cards.degrades.addEventListener('click', () => {
      state.userStatsView = 'degrades';
      renderStats();
      renderUserStatsList();
    });
  }
  if (dom.adminStatsEls.cards.total) {
    dom.adminStatsEls.cards.total.addEventListener('click', () => {
      state.adminStatsView = 'total';
      renderAdminStats();
      renderAdminStatsList();
    });
  }
  if (dom.adminStatsEls.cards.delays) {
    dom.adminStatsEls.cards.delays.addEventListener('click', () => {
      state.adminStatsView = 'delays';
      renderAdminStats();
      renderAdminStatsList();
    });
  }
  if (dom.adminStatsEls.cards.degrades) {
    dom.adminStatsEls.cards.degrades.addEventListener('click', () => {
      state.adminStatsView = 'degrades';
      renderAdminStats();
      renderAdminStatsList();
    });
  }
  if (dom.adminStatsEls.cards.maint) {
    dom.adminStatsEls.cards.maint.addEventListener('click', () => {
      state.adminStatsView = 'maint';
      renderAdminStats();
      renderAdminStatsList();
    });
  }
  if (dom.adminSearchInput) {
    dom.adminSearchInput.addEventListener('input', () => {
      state.adminFilters.search = dom.adminSearchInput.value.toLowerCase();
      renderAdminCatalog();
    });
  }
  if (dom.adminSortSelect) {
    dom.adminSortSelect.addEventListener('change', () => {
      state.adminFilters.sort = dom.adminSortSelect.value;
      renderAdminCatalog();
    });
  }
  if (dom.adminExportBtn) {
    dom.adminExportBtn.addEventListener('click', () => {
      exportInventoryPdf();
    });
  }

  if (dom.closeModalBtn) dom.closeModalBtn.addEventListener('click', closeModal);
  if (dom.modalBackdrop) {
    dom.modalBackdrop.addEventListener('click', (e) => {
      if (e.target === dom.modalBackdrop) closeModal();
    });
  }

  if (dom.reserveBtn) {
    dom.reserveBtn.addEventListener('click', async () => {
      const range = selectionRange();
      const modalMode = getModalMode();
      const extensionContext = getExtensionContext();
      const blockedDates = getBlockedDates();
      if (!range) {
        if (dom.modalMsg) {
          dom.modalMsg.textContent = 'Choisissez un debut et une fin';
          dom.modalMsg.className = 'message err';
        }
        return;
      }
      if (modalMode === 'extend') {
        const todayStr = new Date().toISOString().slice(0, 10);
        const baseDue = extensionContext?.due || '';
        if (!extensionContext?.loanId) {
          dom.modalMsg.textContent = 'Prêt introuvable pour prolongation.';
          dom.modalMsg.className = 'message err';
          return;
        }
        if (range.end < todayStr) {
          dom.modalMsg.textContent = 'La nouvelle date doit être future.';
          dom.modalMsg.className = 'message err';
          return;
        }
        if (baseDue && range.end <= baseDue) {
          dom.modalMsg.textContent = 'Choisissez une date après la fin actuelle.';
          dom.modalMsg.className = 'message err';
          return;
        }
        if (!isRangeFree(range.start, range.end)) {
          dom.modalMsg.textContent = 'Periode deja reservee';
          dom.modalMsg.className = 'message err';
          return;
        }
        dom.modalMsg.textContent = 'Prolongation en cours...';
        dom.modalMsg.className = 'message';
        try {
          await apiRequestExtension(extensionContext.loanId, range.end);
          dom.modalMsg.textContent = 'Prolongation demandée';
          dom.modalMsg.className = 'message ok';
          closeModal();
          await Promise.all([apiFetchEquipment(), apiFetchLoans(), apiFetchAdminLoans()]);
          renderApp();
        } catch (err) {
          dom.modalMsg.textContent = err?.message || 'Prolongation impossible';
          dom.modalMsg.className = 'message err';
        }
        return;
      }
      if (modalMode === 'reserve' && !state.user) {
        dom.modalMsg.textContent = 'Connectez-vous pour reserver';
        dom.modalMsg.className = 'message err';
        return;
      }
      if (modalMode === 'maintenance' && !hasMaintenanceAccess()) {
        dom.modalMsg.textContent = 'Réservé aux administrateurs ou techniciens';
        dom.modalMsg.className = 'message err';
        return;
      }
      const todayStr = new Date().toISOString().slice(0, 10);
      if (range.start < todayStr) {
        dom.modalMsg.textContent = 'Impossible de reserver dans le passe.';
        dom.modalMsg.className = 'message err';
        return;
      }
      if (!isRangeFree(range.start, range.end)) {
        dom.modalMsg.textContent = 'Periode deja reservee';
        dom.modalMsg.className = 'message err';
        return;
      }
      dom.modalMsg.textContent = modalMode === 'maintenance' ? 'Planification...' : 'Reservation en cours...';
      dom.modalMsg.className = 'message';
      try {
        const payload = {
          id: state.modalItem?.id,
          start: range.start,
          end: range.end,
        };
        let pendingMaintenance = false;
        let pendingReservation = false;
        if (modalMode === 'maintenance') {
          const dates = datesBetween(range.start, range.end);
          const overrides = dates.filter((d) => blockedDates[d] && blockedDates[d] !== 'maintenance').length;
          const techOnly = isTechnician() && !isAdmin();
          if (overrides > 0 && !techOnly) {
            const ok = window.confirm(`Cette maintenance écrasera ${overrides} réservation(s). Continuer ?`);
            if (!ok) {
              dom.modalMsg.textContent = 'Planification annulée';
              dom.modalMsg.className = 'message';
              return;
            }
          }
          const result = await apiSetMaintenance(payload);
          pendingMaintenance = result?.status === 'pending';
          if (pendingMaintenance) {
            dom.modalMsg.textContent = 'Demande envoyée pour validation administrateur';
            dom.modalMsg.className = 'message ok';
          }
        } else {
          const res = await fetch(`${API.equipment}?action=reserve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(payload),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data?.error || 'Réservation impossible');
          pendingReservation = data?.status === 'pending';
          if (data?.equipment) {
            const idx = state.inventory.findIndex((i) => i.id === data.equipment.id);
            if (idx !== -1) {
              state.inventory[idx] = {
                ...state.inventory[idx],
                ...data.equipment,
                status: 'reserve',
              };
              renderCatalog();
            }
          }
        }
        const successMsg = modalMode === 'maintenance'
          ? (pendingMaintenance ? 'Demande envoyée pour validation administrateur' : 'Maintenance planifiée')
          : (pendingReservation ? 'Demande envoyée pour validation administrateur' : 'Reservation enregistrée');
        dom.modalMsg.textContent = successMsg;
        dom.modalMsg.className = 'message ok';
        closeModal();
        await Promise.all([apiFetchEquipment(), apiFetchLoans(), apiFetchAdminLoans()]);
        renderApp();
      } catch (err) {
        dom.modalMsg.textContent = err?.message || (modalMode === 'maintenance' ? 'Planification impossible' : 'Erreur de réservation');
        dom.modalMsg.className = 'message err';
      }
    });
  }

  if (dom.adminForm) {
    dom.adminForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!isAdmin()) return;
      const selectedCats = Array.from(dom.adminInputs.categories || [])
        .filter((c) => c.checked)
        .map((c) => c.value);
      if (!selectedCats.length) {
        dom.adminMsg.textContent = 'Choisissez au moins une catégorie';
        dom.adminMsg.className = 'message err';
        return;
      }
      const pictureFile = dom.adminInputs.picture?.files?.[0] || null;
      if (pictureFile && !pictureFile.type.startsWith('image/')) {
        dom.adminMsg.textContent = 'Format image non supporté';
        dom.adminMsg.className = 'message err';
        return;
      }
      if (pictureFile && pictureFile.size > 4 * 1024 * 1024) {
        dom.adminMsg.textContent = 'Image trop lourde (4 Mo max)';
        dom.adminMsg.className = 'message err';
        return;
      }
      const payload = {
        name: dom.adminInputs.name?.value?.trim(),
        categories: selectedCats,
        location: dom.adminInputs.location?.value?.trim(),
        condition: dom.adminInputs.condition?.value?.trim(),
        picture: pictureFile,
      };
      dom.adminMsg.textContent = 'Enregistrement...';
      dom.adminMsg.className = 'message';
      try {
        const created = await apiCreateEquipment(payload);
        if (created) {
          state.inventory.unshift({
            ...created,
            tags: created.tags || [],
            reservations: created.reservations || [],
            picture: created.picture || placeholderImage(created.name),
            description: created.description || '',
          });
        }
        dom.adminMsg.textContent = 'Objet ajouté';
        dom.adminMsg.className = 'message ok';
        dom.adminForm.reset();
        await Promise.all([apiFetchEquipment(), apiFetchAdminLoans()]);
        renderApp();
      } catch (err) {
        dom.adminMsg.textContent = err?.message || 'Ajout impossible';
        dom.adminMsg.className = 'message err';
      }
    });
  }

  (async function start() {
    await apiSession();
    if (!state.user) {
      window.location.href = 'index.html';
      return;
    }
    if (isTechnician() && !isAdmin()) {
      state.adminStatsView = 'degrades';
      state.activeTab = 'admin-maintenance';
    }
    setAuthUI();
    await Promise.all([apiFetchEquipment(), apiFetchLoans()]);
    if (hasMaintenanceAccess() || isAdmin()) {
      await apiFetchAdminLoans();
    }
    if (isAdmin()) {
      await Promise.all([apiFetchUsers(), apiFetchAdminStats()]);
    } else if (isTechnician()) {
      await apiFetchAdminStats();
    }
    renderApp();
  })();
}
