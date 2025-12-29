/*
  Fichier: assets/app.js.
  Point d'entree unique pour garder un flux d'initialisation clair.
  Regroupe le wiring des evenements et le chargement initial des donnees.
*/
import { API, BASE_PATH } from './app/config.js';
import { state } from './app/state.js';
import { dom } from './app/dom.js';
import {
  apiChangePassword,
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
  apiUpdateEquipment,
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

function buildQueryWithFlag() {
  const params = new URLSearchParams(window.location.search || '');
  const flag = params.get('i');
  if (!flag) params.set('i', '1');
  const query = params.toString();
  return query ? `?${query}` : '';
}

function isValidHttpUrl(value) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (err) {
    return false;
  }
}

function isPdfFile(file) {
  if (!file) return false;
  if (file.type === 'application/pdf') return true;
  return file.name && file.name.toLowerCase().endsWith('.pdf');
}

if (!dom.appShell) {
  // Sortie rapide pour eviter d'accrocher des events hors dashboard.
} else {
  // Prepare l'indicateur d'onglets avant les interactions.
  setupTabIndicatorResize();

  if (dom.logoutBtn) {
    dom.logoutBtn.addEventListener('click', async () => {
      // Logout puis nettoyage local pour eviter un etat stale.
      await apiLogout();
      state.user = null;
      sessionStorage.removeItem('temp_password');
      const suffix = `${buildQueryWithFlag()}${window.location.hash || ''}`;
      window.location.href = `${BASE_PATH}index.html${suffix}`;
    });
  }

  const resetPasswordForm = () => {
    if (dom.passwordForm) dom.passwordForm.reset();
    if (dom.passwordMsg) {
      dom.passwordMsg.textContent = '';
      dom.passwordMsg.className = 'message';
    }
  };

  let passwordMenuOpen = false;
  let forcePasswordChange = false;
  const setPasswordMenuOpen = (open) => {
    passwordMenuOpen = open;
    if (dom.passwordPanel) dom.passwordPanel.hidden = !open;
    if (dom.passwordToggleBtn) {
      dom.passwordToggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    if (open && dom.passwordInputs?.current) {
      dom.passwordInputs.current.focus();
    }
    if (!open) resetPasswordForm();
  };

  const applyForcePasswordChange = (required) => {
    forcePasswordChange = required;
    document.body.classList.toggle('force-password', required);
    if (required) {
      setPasswordMenuOpen(true);
      const tempPassword = sessionStorage.getItem('temp_password') || '';
      if (dom.passwordInputs?.current) {
        dom.passwordInputs.current.value = tempPassword;
        if (tempPassword && dom.passwordInputs?.next) {
          dom.passwordInputs.next.focus();
        }
      }
      if (dom.passwordMsg) {
        dom.passwordMsg.textContent = 'Veuillez changer votre mot de passe.';
        dom.passwordMsg.className = 'message err';
      }
    }
  };

  if (dom.passwordToggleBtn && dom.passwordPanel && dom.passwordMenu) {
    dom.passwordToggleBtn.addEventListener('click', () => {
      if (forcePasswordChange) {
        setPasswordMenuOpen(true);
        return;
      }
      setPasswordMenuOpen(!passwordMenuOpen);
    });
    document.addEventListener('click', (event) => {
      if (!passwordMenuOpen || forcePasswordChange) return;
      if (!dom.passwordMenu.contains(event.target)) {
        setPasswordMenuOpen(false);
      }
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && passwordMenuOpen && !forcePasswordChange) {
        setPasswordMenuOpen(false);
      }
    });
  }

  if (dom.passwordForm) {
    dom.passwordForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const current = dom.passwordInputs?.current?.value || '';
      const next = dom.passwordInputs?.next?.value || '';
      const confirm = dom.passwordInputs?.confirm?.value || '';
      if (!current || !next || !confirm) return;
      if (!dom.passwordMsg) return;
      if (next !== confirm) {
        dom.passwordMsg.textContent = 'Mots de passe differents';
        dom.passwordMsg.className = 'message err';
        return;
      }
      if (next === current) {
        dom.passwordMsg.textContent = 'Le nouveau mot de passe doit etre different';
        dom.passwordMsg.className = 'message err';
        return;
      }
      dom.passwordMsg.textContent = 'Mise a jour...';
      dom.passwordMsg.className = 'message';
      try {
        await apiChangePassword({ current, next, confirm });
        dom.passwordMsg.textContent = 'Mot de passe mis a jour';
        dom.passwordMsg.className = 'message ok';
        if (dom.passwordForm) dom.passwordForm.reset();
        if (forcePasswordChange) {
          applyForcePasswordChange(false);
          if (state.user) state.user.must_change_password = false;
        }
        sessionStorage.removeItem('temp_password');
        setTimeout(() => setPasswordMenuOpen(false), 900);
      } catch (err) {
        dom.passwordMsg.textContent = err?.message || 'Mise a jour impossible';
        dom.passwordMsg.className = 'message err';
      }
    });
  }

  dom.tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const nextTab = tab.dataset.tab;
      if (state.activeTab === nextTab) return;
      // Stocke l'onglet actif pour maintenir l'etat UI.
      state.activeTab = nextTab;
      updateTabs();
    });
  });

  if (dom.searchInput) {
    dom.searchInput.addEventListener('input', () => {
      // Filtre instantane pour eviter un aller-retour reseau.
      state.filters.search = dom.searchInput.value.toLowerCase();
      renderCatalog();
    });
  }
  if (dom.resetFiltersBtn) {
    dom.resetFiltersBtn.addEventListener('click', () => {
      state.filters.search = '';
      state.filters.tags = [];
      if (dom.searchInput) dom.searchInput.value = '';
      renderCatalog();
      renderTags();
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
      // Vue "total" par defaut pour la synthese.
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
      // Export declenche uniquement par action explicite.
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
      const modalMode = getModalMode();
      if (modalMode === 'edit') {
        // Edition en modale: lecture du formulaire puis update admin.
        if (!isAdmin()) {
          if (dom.modalMsg) {
            dom.modalMsg.textContent = 'Réservé aux administrateurs';
            dom.modalMsg.className = 'message err';
          }
          return;
        }
        const form = dom.modalBody?.querySelector('[data-edit-form]');
        if (!form || !state.modalItem?.id) {
          if (dom.modalMsg) {
            dom.modalMsg.textContent = 'Formulaire introuvable';
            dom.modalMsg.className = 'message err';
          }
          return;
        }
        const name = String(form.querySelector('input[name="name"]')?.value || '').trim();
        const location = String(form.querySelector('input[name="location"]')?.value || '').trim();
        const condition = String(form.querySelector('select[name="condition"]')?.value || '');
        const categories = Array.from(form.querySelectorAll('input[name="edit-categories"]:checked'))
          .map((input) => input.value);
        const pictureInput = form.querySelector('input[name="picture"]');
        const picture = pictureInput && pictureInput.files && pictureInput.files[0]
          ? pictureInput.files[0]
          : null;
        const datasheetInput = form.querySelector('input[name="datasheet-file"]');
        const datasheetFile = datasheetInput && datasheetInput.files && datasheetInput.files[0]
          ? datasheetInput.files[0]
          : null;
        const datasheetUrlRaw = String(form.querySelector('input[name="datasheet-url"]')?.value || '').trim();
        const datasheetUrl = datasheetFile ? '' : datasheetUrlRaw;
        if (!name || !location) {
          if (dom.modalMsg) {
            dom.modalMsg.textContent = 'Nom et emplacement requis.';
            dom.modalMsg.className = 'message err';
          }
          return;
        }
        if (!condition) {
          if (dom.modalMsg) {
            dom.modalMsg.textContent = 'Etat requis.';
            dom.modalMsg.className = 'message err';
          }
          return;
        }
        if (!categories.length) {
          if (dom.modalMsg) {
            dom.modalMsg.textContent = 'Sélectionnez au moins une catégorie.';
            dom.modalMsg.className = 'message err';
          }
          return;
        }
        if (picture && !picture.type.startsWith('image/')) {
          if (dom.modalMsg) {
            dom.modalMsg.textContent = 'Format image non supporté';
            dom.modalMsg.className = 'message err';
          }
          return;
        }
        if (picture && picture.size > 4 * 1024 * 1024) {
          if (dom.modalMsg) {
            dom.modalMsg.textContent = 'Image trop lourde (4 Mo max)';
            dom.modalMsg.className = 'message err';
          }
          return;
        }
        if (datasheetUrl && !isValidHttpUrl(datasheetUrl)) {
          if (dom.modalMsg) {
            dom.modalMsg.textContent = 'Lien de fiche technique invalide';
            dom.modalMsg.className = 'message err';
          }
          return;
        }
        if (datasheetFile && !isPdfFile(datasheetFile)) {
          if (dom.modalMsg) {
            dom.modalMsg.textContent = 'Format PDF requis pour la fiche technique';
            dom.modalMsg.className = 'message err';
          }
          return;
        }
        if (datasheetFile && datasheetFile.size > 8 * 1024 * 1024) {
          if (dom.modalMsg) {
            dom.modalMsg.textContent = 'PDF trop lourd (8 Mo max)';
            dom.modalMsg.className = 'message err';
          }
          return;
        }
        if (dom.modalMsg) {
          dom.modalMsg.textContent = 'Mise a jour...';
          dom.modalMsg.className = 'message';
        }
        dom.reserveBtn.disabled = true;
        dom.reserveBtn.textContent = 'Enregistrement...';
        try {
          await apiUpdateEquipment({
            id: state.modalItem.id,
            name,
            location,
            condition,
            categories,
            picture,
            datasheetUrl: datasheetUrl || undefined,
            datasheetFile,
          });
          if (dom.modalMsg) {
            dom.modalMsg.textContent = 'Materiel mis a jour';
            dom.modalMsg.className = 'message ok';
          }
          closeModal();
          await Promise.all([apiFetchEquipment(), apiFetchAdminLoans()]);
          renderApp();
        } catch (err) {
          if (dom.modalMsg) {
            dom.modalMsg.textContent = err?.message || 'Mise a jour impossible';
            dom.modalMsg.className = 'message err';
          }
        } finally {
          dom.reserveBtn.disabled = false;
          dom.reserveBtn.textContent = 'Enregistrer';
        }
        return;
      }
      const range = selectionRange();
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
        // Prolongation: on ne touche que la date de fin.
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
        // Reserve uniquement si l'utilisateur est connecte.
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
          // Maintenance peut ecraser des reservations, confirmation necessaire.
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
          // Reservation standard via endpoint equipement.
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
      // Validation rapide cote front avant l'upload.
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
      const datasheetFile = dom.adminInputs.datasheetFile?.files?.[0] || null;
      const datasheetUrlRaw = dom.adminInputs.datasheetUrl?.value?.trim() || '';
      const datasheetUrl = datasheetFile ? '' : datasheetUrlRaw;
      if (datasheetUrl && !isValidHttpUrl(datasheetUrl)) {
        dom.adminMsg.textContent = 'Lien de fiche technique invalide';
        dom.adminMsg.className = 'message err';
        return;
      }
      if (datasheetFile && !isPdfFile(datasheetFile)) {
        dom.adminMsg.textContent = 'Format PDF requis pour la fiche technique';
        dom.adminMsg.className = 'message err';
        return;
      }
      if (datasheetFile && datasheetFile.size > 8 * 1024 * 1024) {
        dom.adminMsg.textContent = 'PDF trop lourd (8 Mo max)';
        dom.adminMsg.className = 'message err';
        return;
      }
      const payload = {
        name: dom.adminInputs.name?.value?.trim(),
        categories: selectedCats,
        location: dom.adminInputs.location?.value?.trim(),
        condition: dom.adminInputs.condition?.value?.trim(),
        picture: pictureFile,
        datasheetUrl: datasheetUrl || undefined,
        datasheetFile,
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
  /**
   * Demarrage unique pour charger session + donnees avant rendu.
   * Evite un affichage partiel qui pourrait tromper l'utilisateur.
   */
  (async function start() {
    await apiSession();
    if (!state.user) {
      const suffix = `${buildQueryWithFlag()}${window.location.hash || ''}`;
      window.location.href = `${BASE_PATH}index.html${suffix}`;
      return;
    }
    if (state.user?.must_change_password) {
      applyForcePasswordChange(true);
    }
    if (isTechnician() && !isAdmin()) {
      // Les techniciens arrivent directement sur la maintenance.
      state.adminStatsView = 'degrades';
      state.activeTab = 'admin-maintenance';
    } else if (isAdmin()) {
      // Les admins arrivent sur l'ajout de materiel.
      state.activeTab = 'admin-add';
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
