// Frontend principal : catalogue, réservations, prêts, maintenance et stats.
// Tout est en vanilla JS : état global, appels API, rendu dynamique, calendrier, modales.

const API = {
  auth: './api/auth.php',
  equipment: './api/equipment.php',
  dashboard: './api/dashboard.php',
};

(() => {
  const appShell = document.querySelector('#app-shell');
  if (!appShell) return;

  // Constantes et état applicatif partagé.
  const BASE_TAGS = ['Info', 'Elen', 'Ener', 'Auto'];
  const CONDITION_RANKS = {
    'reparation nécessaire': 0,
    passable: 1,
    bon: 2,
    neuf: 3,
  };

  const state = {
    user: null,
    inventory: [],
    loans: [],
    adminLoans: [],
    accounts: [],
    activeTab: 'borrow',
    filters: { search: '', tags: [] },
    adminFilters: { search: '', tag: null, sort: 'recent' },
    maintenanceFilters: { search: '', tag: null },
    adminLoanSearch: '',
    adminHistory: [],
    adminStatsView: 'total',
    adminHistorySearch: '',
    modalItem: null,
    stats: null,
    adminStats: null,
  };

  // Sélecteurs DOM principaux.
  const logoutBtn = document.querySelector('#logout-btn');
  const userChip = document.querySelector('#user-chip');
  const tabs = document.querySelectorAll('[data-tab]');
  const sections = document.querySelectorAll('[data-section]');
  const catalogEl = document.querySelector('#catalog');
  const loansEl = document.querySelector('#loans');
  const adminLoansEl = document.querySelector('#admin-loans');
  const statsEls = {
    total: document.querySelector('#stat-total'),
    active: document.querySelector('#stat-active'),
    returned: document.querySelector('#stat-returned'),
  };
  const searchInput = document.querySelector('#search');
  const tagBar = document.querySelector('#tag-bar');
  const modalBackdrop = document.querySelector('#modal');
  const modalTitle = document.querySelector('#modal-title');
  const modalBody = document.querySelector('#modal-body');
  const reserveBtn = document.querySelector('#reserve-btn');
  const modalMsg = document.querySelector('#modal-msg');
  const closeModalBtn = document.querySelector('#close-modal');
  const adminForm = document.querySelector('#admin-form');
  const adminMsg = document.querySelector('#admin-msg');
  const adminInputs = {
    name: document.querySelector('#admin-name'),
    categories: document.querySelectorAll('input[name="admin-categories"]'),
    location: document.querySelector('#admin-location'),
    condition: document.querySelector('#admin-condition'),
  };
  const adminInventoryEl = document.querySelector('#admin-inventory');
  const adminSearchInput = document.querySelector('#admin-search');
  const adminTagBar = document.querySelector('#admin-tag-bar');
  const adminSortSelect = document.querySelector('#admin-sort');
  const maintenanceCatalogEl = document.querySelector('#maintenance-catalog');
  const maintenanceSearchInput = document.querySelector('#maintenance-search');
  const maintenanceTagBar = document.querySelector('#maintenance-tag-bar');
  const maintenanceListEl = document.querySelector('#maintenance-list');
  const accountsListEl = document.querySelector('#accounts-list');
  const adminLoanSearchInput = document.querySelector('#admin-loan-search');
  const adminStatsEls = {
    total: document.querySelector('#admin-stat-total'),
    delays: document.querySelector('#admin-stat-delays'),
    degrades: document.querySelector('#admin-stat-degrades'),
    maint: document.querySelector('#admin-stat-maint'),
    msg: document.querySelector('#admin-stats-msg'),
    search: document.querySelector('#admin-stats-search'),
    list: document.querySelector('#admin-stats-list'),
    cards: {
      total: document.querySelector('#admin-stat-card-total'),
      delays: document.querySelector('#admin-stat-card-delays'),
      degrades: document.querySelector('#admin-stat-card-degrades'),
      maint: document.querySelector('#admin-stat-card-maint'),
    },
  };
  let dateStartInput = null;
  let dateEndInput = null;
  let blockedWeeks = [];
  let blockedDates = {};
  let reservationPeriods = [];
  let modalMode = 'reserve';
  let calendarMonth = null;
  let selectedStartDate = null;
  let selectedEndDate = null;

  // Gestion logout.
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await apiLogout();
      state.user = null;
      window.location.href = 'index.html';
    });
  }

  // Navigation entre onglets.
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      state.activeTab = tab.dataset.tab;
      updateTabs();
    });
  });

  // Filtres catalogue / maintenance / prêts admin / stats admin.
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      state.filters.search = searchInput.value.toLowerCase();
      renderCatalog();
    });
  }
  if (maintenanceSearchInput) {
    maintenanceSearchInput.addEventListener('input', () => {
      state.maintenanceFilters.search = maintenanceSearchInput.value.toLowerCase();
      renderMaintenanceCatalog();
    });
  }
  if (adminLoanSearchInput) {
    adminLoanSearchInput.addEventListener('input', () => {
      state.adminLoanSearch = adminLoanSearchInput.value.toLowerCase();
      renderAdminLoans();
    });
  }
  if (adminStatsEls.search) {
    adminStatsEls.search.addEventListener('input', () => {
      state.adminHistorySearch = adminStatsEls.search.value.toLowerCase();
      renderAdminStatsList();
    });
  }
  if (adminStatsEls.cards.total) {
    adminStatsEls.cards.total.addEventListener('click', () => {
      state.adminStatsView = 'total';
      renderAdminStats();
      renderAdminStatsList();
    });
  }
  if (adminStatsEls.cards.delays) {
    adminStatsEls.cards.delays.addEventListener('click', () => {
      state.adminStatsView = 'delays';
      renderAdminStats();
      renderAdminStatsList();
    });
  }
  if (adminStatsEls.cards.degrades) {
    adminStatsEls.cards.degrades.addEventListener('click', () => {
      state.adminStatsView = 'degrades';
      renderAdminStats();
      renderAdminStatsList();
    });
  }
  if (adminStatsEls.cards.maint) {
    adminStatsEls.cards.maint.addEventListener('click', () => {
      state.adminStatsView = 'maint';
      renderAdminStats();
      renderAdminStatsList();
    });
  }
  if (adminSearchInput) {
    adminSearchInput.addEventListener('input', () => {
      state.adminFilters.search = adminSearchInput.value.toLowerCase();
      renderAdminCatalog();
    });
  }
  if (adminSortSelect) {
    adminSortSelect.addEventListener('change', () => {
      state.adminFilters.sort = adminSortSelect.value;
      renderAdminCatalog();
    });
  }

  // Modale (ouvrir/fermer) et bouton réserver/maintenance.
  if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
  if (modalBackdrop) {
    modalBackdrop.addEventListener('click', (e) => {
      if (e.target === modalBackdrop) closeModal();
    });
  }

  // Réservation ou planification maintenance depuis la modale.
  if (reserveBtn) {
    reserveBtn.addEventListener('click', async () => {
      const range = selectionRange();
      if (modalMode === 'reserve' && !state.user) {
        modalMsg.textContent = 'Connectez-vous pour reserver';
        modalMsg.className = 'message err';
        return;
      }
      if (modalMode === 'maintenance' && !isAdmin()) {
        modalMsg.textContent = 'Réservé aux administrateurs';
        modalMsg.className = 'message err';
        return;
      }
      if (!range) {
        modalMsg.textContent = 'Choisissez un debut et une fin';
        modalMsg.className = 'message err';
        return;
      }
      if (!isRangeFree(range.start, range.end)) {
        modalMsg.textContent = 'Periode deja reservee';
        modalMsg.className = 'message err';
        return;
      }
      modalMsg.textContent = modalMode === 'maintenance' ? 'Planification...' : 'Reservation en cours...';
      modalMsg.className = 'message';
      try {
        const payload = {
          id: state.modalItem?.id,
          start: range.start,
          end: range.end,
        };
        if (modalMode === 'maintenance') {
          const dates = datesBetween(range.start, range.end);
          const overrides = dates.filter((d) => blockedDates[d] && blockedDates[d] !== 'maintenance').length;
          if (overrides > 0) {
            const ok = window.confirm(`Cette maintenance écrasera ${overrides} réservation(s). Continuer ?`);
            if (!ok) {
              modalMsg.textContent = 'Planification annulée';
              modalMsg.className = 'message';
              return;
            }
          }
          await apiSetMaintenance(payload);
        } else {
          const res = await fetch(`${API.equipment}?action=reserve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(payload),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data?.error || 'Réservation impossible');
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
        modalMsg.textContent = modalMode === 'maintenance' ? 'Maintenance planifiée' : 'Reservation enregistrée';
        modalMsg.className = 'message ok';
        closeModal();
        await Promise.all([apiFetchEquipment(), apiFetchLoans(), apiFetchAdminLoans()]);
        render();
      } catch (err) {
        modalMsg.textContent = err?.message || (modalMode === 'maintenance' ? 'Planification impossible' : 'Erreur de réservation');
        modalMsg.className = 'message err';
      }
    });
  }

  // Formulaire d'ajout matériel (admin).
  if (adminForm) {
    adminForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!isAdmin()) return;
      const selectedCats = Array.from(adminInputs.categories || [])
        .filter((c) => c.checked)
        .map((c) => c.value);
      if (!selectedCats.length) {
        adminMsg.textContent = 'Choisissez au moins une catégorie';
        adminMsg.className = 'message err';
        return;
      }
      const payload = {
        name: adminInputs.name?.value?.trim(),
        categories: selectedCats,
        location: adminInputs.location?.value?.trim(),
        condition: adminInputs.condition?.value?.trim(),
      };
      adminMsg.textContent = 'Enregistrement...';
      adminMsg.className = 'message';
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
        adminMsg.textContent = 'Objet ajouté';
        adminMsg.className = 'message ok';
        adminForm.reset();
        await Promise.all([apiFetchEquipment(), apiFetchAdminLoans()]);
        render();
      } catch (err) {
        adminMsg.textContent = err?.message || 'Ajout impossible';
        adminMsg.className = 'message err';
      }
    });
  }

  // --- API : session, catalogue, emprunts, stats, CRUD matériel/prêts ---

  async function apiSession() {
    try {
      const res = await fetch(API.auth, { credentials: 'include' });
      const data = await res.json();
      state.user = data || null;
    } catch (e) {
      state.user = null;
    }
  }

  async function apiFetchEquipment() {
    try {
      const res = await fetch(API.equipment, { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'API equipement');
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
      return;
    } catch (err) {
      state.inventory = [];
    }
  }

  async function apiFetchLoans() {
    try {
      const res = await fetch(API.dashboard, { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'API emprunts');
      state.loans = (data.loans || []).filter((l) => l.status !== 'rendu');
      state.stats = data.stats || null;
      return;
    } catch (err) {
      state.loans = [];
      state.stats = null;
    }
  }

  async function apiFetchAdminLoans() {
    try {
      const res = await fetch(`${API.dashboard}?scope=all`, { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'API emprunts admin');
      state.adminLoans = data.loans || [];
      if (adminStatsEls.msg && !state.adminStats) {
        adminStatsEls.msg.textContent = '';
      }
    } catch (err) {
      state.adminLoans = [];
    }
  }

  async function apiFetchAdminStats() {
    if (!isAdmin()) return;
    try {
      const res = await fetch(`${API.dashboard}?action=admin_stats`, { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'API stats');
      state.adminStats = data || { total_year: 0, delays: 0, degrades: 0 };
      state.adminHistory = data.history || [];
      if (adminStatsEls.msg) adminStatsEls.msg.textContent = '';
    } catch (err) {
      state.adminStats = { total_year: 0, delays: 0, degrades: 0 };
      state.adminHistory = [];
      if (adminStatsEls.msg) {
        adminStatsEls.msg.textContent = err?.message || 'Stats indisponibles';
        adminStatsEls.msg.className = 'message err';
      }
    }
  }

  async function apiFetchUsers() {
    try {
      const res = await fetch(`${API.auth}?action=users`, { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'API users');
      state.accounts = Array.isArray(data) ? data : [];
    } catch (err) {
      state.accounts = [];
    }
  }

  async function apiSetUserRole(id, role) {
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

  async function apiDeleteUser(id) {
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

  async function apiReturnLoan(id, condition = '') {
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

  async function apiRequestCancel(id) {
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

  async function apiLogout() {
    try {
      await fetch(`${API.auth}?action=logout`, { method: 'POST', credentials: 'include' });
    } catch (e) {}
  }

  async function apiCreateEquipment(payload) {
    const res = await fetch(`${API.equipment}?action=create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      const err = new Error(data?.error || 'Création impossible');
      err.status = res.status;
      throw err;
    }
    return data?.equipment;
  }

  async function apiDeleteEquipment(id) {
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

  async function apiSetMaintenance(payload) {
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
    return data?.equipment;
  }

  function setAuthUI() {
    if (userChip) {
      userChip.textContent = state.user ? `Connecte: ${state.user.login || 'profil'}` : 'Non connecte';
    }
  }

  function isAdmin() {
    return (state.user?.role || '').toLowerCase().includes('admin');
  }

  function applyRoleVisibility() {
    const adminEnabled = isAdmin();
    tabs.forEach((tab) => {
      const isAdminTab = tab.dataset.role === 'admin';
      const isUserLoansTab = tab.dataset.tab === 'loans';
      const isBorrowTab = tab.dataset.tab === 'borrow';
      if (isAdminTab) {
        tab.style.display = adminEnabled ? '' : 'none';
      } else if (isUserLoansTab || isBorrowTab) {
        tab.style.display = adminEnabled ? 'none' : '';
      } else {
        tab.style.display = '';
      }
    });
    sections.forEach((sec) => {
      const isAdminSection = sec.dataset.role === 'admin';
      const isUserLoans = sec.dataset.section === 'loans';
      const isBorrow = sec.dataset.section === 'borrow';
      if (isAdminSection) {
        sec.hidden = !adminEnabled;
      } else if ((isUserLoans || isBorrow) && adminEnabled) {
        sec.hidden = true;
      } else {
        sec.hidden = false;
      }
    });
    if (adminEnabled && (state.activeTab === 'loans' || state.activeTab === 'borrow')) {
      state.activeTab = 'admin-add';
    }
    if (!adminEnabled && state.activeTab.startsWith('admin')) {
      state.activeTab = 'borrow';
    }
  }

  function render() {
    applyRoleVisibility();
    updateTabs();
    renderCatalog();
    renderAdminCatalog();
    renderLoans();
    renderAdminLoans();
    renderMaintenanceAgenda();
    renderAccounts();
    renderStats();
    renderTags();
    renderAdminTags();
    renderMaintenanceCatalog();
    renderMaintenanceTags();
    renderAdminStats();
  }

  function updateTabs() {
    tabs.forEach((tab) => {
      if (tab.dataset.role === 'admin' && !isAdmin()) {
        tab.classList.remove('active');
        return;
      }
      tab.classList.toggle('active', tab.dataset.tab === state.activeTab);
    });
    sections.forEach((sec) => {
      const isAdminSection = sec.dataset.role === 'admin';
      const isLoansSection = sec.dataset.section === 'loans';
      const isBorrowSection = sec.dataset.section === 'borrow';
      sec.hidden = sec.dataset.section !== state.activeTab
        || (isAdminSection && !isAdmin())
        || ((isLoansSection || isBorrowSection) && isAdmin());
    });
  }

  function renderTags() {
    const allTags = BASE_TAGS.filter((tag) => state.inventory.some((item) => (item.tags || []).includes(tag)));
    tagBar.innerHTML = '';
    allTags.forEach((tag) => {
      const chip = document.createElement('button');
      const isActive = state.filters.tags.includes(tag);
      chip.className = 'tag-chip' + (isActive ? ' active' : '');
      chip.type = 'button';
      chip.textContent = tag;
      chip.addEventListener('click', () => {
        if (isActive) {
          state.filters.tags = state.filters.tags.filter((t) => t !== tag);
        } else {
          state.filters.tags = [...state.filters.tags, tag];
        }
        renderCatalog();
        renderTags();
      });
      tagBar.appendChild(chip);
    });
  }

  function renderAdminTags() {
    if (!adminTagBar) return;
    if (!isAdmin()) {
      adminTagBar.innerHTML = '';
      return;
    }
    const allTags = Array.from(new Set(state.inventory.flatMap((item) => item.tags)));
    adminTagBar.innerHTML = '';
    allTags.forEach((tag) => {
      const chip = document.createElement('button');
      chip.className = 'tag-chip' + (state.adminFilters.tag === tag ? ' active' : '');
      chip.type = 'button';
      chip.textContent = tag;
      chip.addEventListener('click', () => {
        state.adminFilters.tag = state.adminFilters.tag === tag ? null : tag;
        renderAdminCatalog();
        renderAdminTags();
      });
      adminTagBar.appendChild(chip);
    });
  }

  function renderAdminCatalog() {
    if (!adminInventoryEl) return;
    adminInventoryEl.innerHTML = '';
    if (!isAdmin()) {
      adminInventoryEl.innerHTML = '<p class="meta">Accès réservé aux administrateurs.</p>';
      return;
    }

    const filtered = state.inventory.filter((item) => {
      const matchText = `${item.name} ${item.serial || ''} ${item.category} ${item.location || ''} ${item.tags.join(' ')}`.toLowerCase();
      const okSearch = matchText.includes(state.adminFilters.search);
      const okTag = !state.adminFilters.tag || item.tags.includes(state.adminFilters.tag);
      return okSearch && okTag;
    });

    const statusWeight = (status = '') => {
      const map = { disponible: 0, reserve: 1, emprunte: 1, pret: 1, maintenance: 2, hs: 3 };
      return map[status.toLowerCase()] ?? 4;
    };

    const sorted = filtered.slice().sort((a, b) => {
      switch (state.adminFilters.sort) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'category':
          return a.category.localeCompare(b.category) || a.name.localeCompare(b.name);
        case 'status':
          return statusWeight(a.status) - statusWeight(b.status) || a.name.localeCompare(b.name);
        case 'location':
          return (a.location || '').localeCompare(b.location || '') || a.name.localeCompare(b.name);
        default:
          return (b.id || 0) - (a.id || 0);
      }
    });

    if (!sorted.length) {
      adminInventoryEl.innerHTML = '<p class="meta">Aucun materiel ne correspond au filtre.</p>';
      return;
    }

    sorted.forEach((item) => {
      const card = document.createElement('article');
      card.className = 'card';
      card.innerHTML = `
        <img src="${item.picture}" alt="" loading="lazy" />
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
          <div>
            <h3>${escapeHtml(item.name)}</h3>
            <div class="meta">Lieu: ${escapeHtml(item.location || 'Stock')}</div>
          </div>
          ${statusBadge(item.status)}
        </div>
        <div class="meta">Etat: ${escapeHtml(item.condition || 'N/C')} • Ref: ${escapeHtml(item.serial || 'N/C')}</div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin:6px 0;">
          <div class="tags" style="margin:0;">${item.tags.map((t) => `<span>${escapeHtml(t)}</span>`).join('')}</div>
          <button type="button" class="ghost danger" data-del="${item.id}">Supprimer</button>
        </div>
        <div class="message" data-error></div>
      `;
      const delBtn = card.querySelector('button[data-del]');
      const errEl = card.querySelector('[data-error]');
      if (delBtn) {
        delBtn.addEventListener('click', async () => {
          if (!confirm('Supprimer définitivement ce matériel ?')) return;
          delBtn.disabled = true;
          delBtn.textContent = 'Suppression...';
          if (errEl) {
            errEl.textContent = '';
            errEl.className = 'message';
          }
          try {
            await apiDeleteEquipment(item.id);
            await Promise.all([apiFetchEquipment(), apiFetchAdminLoans()]);
            render();
          } catch (err) {
            delBtn.disabled = false;
            delBtn.textContent = 'Supprimer';
            if (errEl) {
              errEl.textContent = err?.message || 'Suppression impossible';
              errEl.className = 'message err';
            }
          }
        });
      }
      adminInventoryEl.appendChild(card);
    });
  }

  function renderMaintenanceCatalog() {
    if (!maintenanceCatalogEl) return;
    maintenanceCatalogEl.innerHTML = '';
    if (!isAdmin()) {
      maintenanceCatalogEl.innerHTML = '<p class="meta">Accès réservé aux administrateurs.</p>';
      return;
    }
    const filtered = state.inventory.filter((item) => {
      const matchText = `${item.name} ${item.serial || ''} ${item.category} ${item.tags.join(' ')}`.toLowerCase();
      const okSearch = matchText.includes(state.maintenanceFilters.search);
      const okTag = !state.maintenanceFilters.tag || item.tags.includes(state.maintenanceFilters.tag);
      return okSearch && okTag;
    });

    const sorted = filtered.slice().sort((a, b) => Number(needsRepair(b)) - Number(needsRepair(a)));

    sorted.forEach((item) => {
      const card = document.createElement('article');
      card.className = 'card' + (needsRepair(item) ? ' card-alert' : '');
      card.innerHTML = `
        <img src="${item.picture}" alt="" loading="lazy" />
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
          <div>
            <h3>${escapeHtml(item.name)}</h3>
            <div class="meta">Lieu: ${escapeHtml(item.location || 'Stock')}</div>
          </div>
          ${statusBadge(item.status)}
        </div>
        <div class="meta">Etat: ${escapeHtml(item.condition || 'N/C')} • Ref: ${escapeHtml(item.serial || 'N/C')}</div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin:6px 0;">
          <div class="tags" style="margin:0;">${item.tags.map((t) => `<span>${escapeHtml(t)}</span>`).join('')}</div>
          <button type="button" class="ghost" data-id="${item.id}">Planifier maintenance</button>
        </div>
      `;
      card.querySelector('button').addEventListener('click', () => openModal(item, 'maintenance'));
      maintenanceCatalogEl.appendChild(card);
    });

    if (!filtered.length) {
      maintenanceCatalogEl.innerHTML = '<p class="meta">Aucun materiel ne correspond au filtre.</p>';
    }
  }

  function renderMaintenanceTags() {
    if (!maintenanceTagBar) return;
    const allTags = Array.from(new Set(state.inventory.flatMap((item) => item.tags)));
    maintenanceTagBar.innerHTML = '';
    allTags.forEach((tag) => {
      const chip = document.createElement('button');
      chip.className = 'tag-chip' + (state.maintenanceFilters.tag === tag ? ' active' : '');
      chip.type = 'button';
      chip.textContent = tag;
      chip.addEventListener('click', () => {
        state.maintenanceFilters.tag = state.maintenanceFilters.tag === tag ? null : tag;
        renderMaintenanceCatalog();
        renderMaintenanceTags();
      });
      maintenanceTagBar.appendChild(chip);
    });
  }

  function renderMaintenanceAgenda() {
    if (!maintenanceListEl) return;
    maintenanceListEl.innerHTML = '';
    if (!isAdmin()) {
      maintenanceListEl.innerHTML = '<p class="meta">Accès réservé aux administrateurs.</p>';
      return;
    }
    const maints = state.adminLoans
      .filter((l) => (l.type || '').toLowerCase() === 'maintenance')
      .filter((l) => l.status !== 'rendu');

    maints.forEach((m) => {
      // Use end date to judge lateness; fallback to start if missing.
      const severity = dueSeverity(m.due || m.start);
      const barColor = severityColor(severity);
      const row = document.createElement('div');
      row.className = `loan-item loan-${severity}`;
      row.innerHTML = `
       <div>
         <div class="small-title">Maintenance planifiée - ${escapeHtml(severityLabel(severity))}</div>
         <div style="font-weight:800">${escapeHtml(m.name)}</div>
         <div class="loan-meta">Du ${formatDisplayDate(m.start)} au ${formatDisplayDate(m.due)} — ${escapeHtml(m.user || 'Administrateur')}</div>
         <div class="progress" aria-hidden="true"><div style="width:${m.progress}%; background:${barColor}"></div></div>
       </div>
        <div class="admin-actions">
          <button type="button" class="ghost" data-id="${m.id}">Fin de maintenance</button>
        </div>
      `;
      const btn = row.querySelector('button');
      if (btn) {
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          btn.textContent = 'Clôture...';
          try {
            await apiReturnLoan(m.id, '');
            await Promise.all([apiFetchAdminLoans(), apiFetchEquipment()]);
            render();
          } catch (err) {
            btn.disabled = false;
            btn.textContent = 'Fin de maintenance';
          }
        });
      }
      maintenanceListEl.appendChild(row);
    });

    if (!maints.length) {
      maintenanceListEl.innerHTML = '<p class="meta">Aucune maintenance planifiée.</p>';
    }
  }

  function renderAccounts() {
    if (!accountsListEl) return;
    accountsListEl.innerHTML = '';
    if (!isAdmin()) {
      accountsListEl.innerHTML = '<p class="meta">Accès réservé aux administrateurs.</p>';
      return;
    }
    if (!state.accounts.length) {
      accountsListEl.innerHTML = '<p class="meta">Aucun compte trouvé.</p>';
      return;
    }
    state.accounts.forEach((acc) => {
      const row = document.createElement('div');
      row.className = 'loan-item';
      row.innerHTML = `
        <div>
          <div class="small-title">${escapeHtml(acc.login || 'Utilisateur')}</div>
          <div class="loan-meta">${escapeHtml(acc.email || '')}</div>
          <div class="loan-meta">Créé le ${formatDisplayDate(acc.created)}</div>
        </div>
        <div class="admin-actions">
          <button type="button" class="ghost danger" data-del="${acc.id}">Supprimer</button>
        </div>
      `;
      const delBtn = row.querySelector('button[data-del]');
      if (delBtn) {
        const isAdminRole = (acc.role || '').toLowerCase().includes('admin');
        if (isAdminRole) {
          delBtn.disabled = true;
          delBtn.textContent = 'Admin';
        } else {
          delBtn.addEventListener('click', async () => {
            delBtn.disabled = true;
            delBtn.textContent = 'Suppression...';
            try {
              await apiDeleteUser(acc.id);
              await apiFetchUsers();
              renderAccounts();
            } catch (err) {
              delBtn.disabled = false;
              delBtn.textContent = 'Supprimer';
            }
          });
        }
      }
      accountsListEl.appendChild(row);
    });
  }

  // Catalogue public (recherche + tags) et cartes de réservation.
  function renderCatalog() {
    if (!catalogEl) return;
    catalogEl.innerHTML = '';
    const filtered = state.inventory.filter((item) => {
      const matchText = `${item.name} ${item.serial || ''} ${item.category} ${item.tags.join(' ')}`.toLowerCase();
      const okSearch = matchText.includes(state.filters.search);
      const okTags = !state.filters.tags.length
        || state.filters.tags.every((tag) => item.tags.includes(tag));
      return okSearch && okTags;
    });

    filtered.forEach((item) => {
      const nextMaintenance = (item.reservations || []).find((r) => (r.type || '').toLowerCase() === 'maintenance') || null;
      const reservationBadge = nextMaintenance
        ? `<div class="meta">Maintenance planifiée : ${formatDisplayDate(nextMaintenance.start)} → ${formatDisplayDate(nextMaintenance.end)}</div>`
        : '<div class="meta">Aucune maintenance planifiée</div>';
      const categoriesLabel = (item.categories && item.categories.length)
        ? item.categories.join(', ')
        : item.category;
      const availabilityLabel = (item.status || '').toLowerCase() === 'disponible' ? 'Disponible' : 'Indisponible';
      const card = document.createElement('article');
      card.className = 'card';
      card.innerHTML = `
        <img src="${item.picture}" alt="${escapeHtml(item.name)}" loading="lazy" />
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
          <div>
            <h3>${escapeHtml(item.name)}</h3>
            <div class="meta">${escapeHtml(categoriesLabel)}</div>
            <div class="meta">Lieu: ${escapeHtml(item.location || 'Stock')}</div>
            <div class="meta">État: ${escapeHtml(item.condition || 'N/C')}</div>
          </div>
          ${statusBadge(item.status)}
        </div>
        ${reservationBadge}
        <button type="button" class="ghost" data-id="${item.id}">Voir et reserver</button>
      `;
      card.querySelector('button').addEventListener('click', () => openModal(item));
      catalogEl.appendChild(card);
    });

    if (!filtered.length) {
      catalogEl.innerHTML = '<p class="meta">Aucun materiel ne correspond au filtre.</p>';
    }
  }

  // Bloc "Mes emprunts" côté utilisateur (retours ou annulations).
  function renderLoans() {
    loansEl.innerHTML = '';
    const isAdmin = (state.user?.role || '').toLowerCase().includes('admin');
    state.loans.forEach((loan) => {
      const severity = dueSeverity(loan.due);
      const barColor = severityColor(severity);
      const canReturn = isAdmin && loan.type === 'pret' && loan.status !== 'rendu';
      const canRequestCancel = !isAdmin
        && loan.type === 'pret'
        && loan.status !== 'rendu'
        && loan.status !== 'annulation demandee';
      const actionHtml = canReturn
        ? '<button type="button" class="ghost" data-id="' + loan.id + '">Rendre maintenant</button>'
        : canRequestCancel
          ? '<button type="button" class="ghost" data-cancel="' + loan.id + '">Demander annulation</button>'
          : isAdmin
            ? '<button type="button" class="ghost" disabled>' +
                (loan.status === 'rendu' ? 'Déjà rendu' : 'Réservé') +
              '</button>'
            : (loan.status === 'annulation demandee'
              ? '<span class="meta">Annulation demandée</span>'
              : '');

      const row = document.createElement('div');
      row.className = `loan-item loan-${severity}`;
      row.innerHTML = `
          <div>
            <div class="small-title">${escapeHtml(loan.status)} - ${escapeHtml(severityLabel(severity))}</div>
            <div style="font-weight:800">${escapeHtml(loan.name)}</div>
            <div class="loan-meta">Du ${formatDisplayDate(loan.start)} au ${formatDisplayDate(loan.due)}</div>
            <div class="progress" aria-hidden="true"><div style="width:${loan.progress}%; background:${barColor}"></div></div>
          </div>
        ${actionHtml}
      `;
      const returnBtn = canReturn ? row.querySelector('button') : null;
      const cancelBtn = !canReturn ? row.querySelector('button[data-cancel]') : null;
      if (canReturn && returnBtn) {
        returnBtn.addEventListener('click', async () => {
          returnBtn.disabled = true;
          returnBtn.textContent = 'Retour...';
          try {
            await apiReturnLoan(loan.id);
            loan.status = 'rendu';
            renderLoans();
            renderStats();
          } catch (err) {
            returnBtn.disabled = false;
            returnBtn.textContent = 'Rendre maintenant';
          }
        });
      }
      if (cancelBtn) {
        cancelBtn.addEventListener('click', async () => {
          cancelBtn.disabled = true;
          cancelBtn.textContent = 'Envoi...';
          try {
            await apiRequestCancel(loan.id);
            loan.status = 'annulation demandee';
            renderLoans();
          } catch (err) {
            cancelBtn.disabled = false;
            cancelBtn.textContent = 'Demander annulation';
          }
        });
      }
      loansEl.appendChild(row);
    });

    if (!state.loans.length) {
      loansEl.innerHTML = '<p class="meta">Aucun emprunt en cours.</p>';
    }
  }

  // Vue admin des prêts en cours/à venir + actions de rendu/annulation.
  function renderAdminLoans() {
    if (!adminLoansEl) return;
    adminLoansEl.innerHTML = '';
    if (!isAdmin()) {
      adminLoansEl.innerHTML = '<p class="meta">Accès réservé aux administrateurs.</p>';
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    const active = [];
    const upcoming = [];
    state.adminLoans
      .filter((l) => l.type !== 'maintenance')
      .filter((l) => l.status !== 'rendu')
      .filter((l) => {
        if (!state.adminLoanSearch) return true;
        const haystack = `${l.user || ''} ${l.name || ''}`.toLowerCase();
        return haystack.includes(state.adminLoanSearch);
      })
      .forEach((loan) => {
        const statusNorm = (loan.status || '').toLowerCase();
        const start = loan.start || loan.due;
        const due = loan.due || loan.start;
        const startOk = start && start <= today;
        const dueOk = due && due >= today;
        if (statusNorm === 'annulation demandee') {
          upcoming.push({ ...loan, _cancelRequested: true });
          return;
        }
        if (startOk && dueOk) {
          active.push(loan);
        } else if (start && start > today) {
          upcoming.push(loan);
        } else {
          active.push(loan);
        }
      });

    const renderList = (target, list, title, opts = {}) => {
      if (!list.length) return;
      const block = document.createElement('div');
      block.className = 'admin-subblock';
      if (opts.variant) block.classList.add(`admin-${opts.variant}`);
      block.innerHTML = '';
      list.forEach((loan) => {
        const severity = dueSeverity(loan.due);
        const barColor = severityColor(severity);
        const userLabel = escapeHtml(loan.user || 'Inconnu');
        const baseCondition = loan.condition || '';
        const conditionLabel = formatConditionLabel(baseCondition);
        const optionsHtml = buildReturnOptions(baseCondition);
        const isUpcoming = opts.variant === 'upcoming';
        const statusText = isUpcoming
          ? (loan._cancelRequested ? 'Demande d’annulation' : 'Réservation à venir')
          : loan.status;
        const severityText = isUpcoming ? '' : severityLabel(severity);
        const showActions = !isUpcoming || loan._cancelRequested;
        const showCondition = showActions && !loan._cancelRequested;
        const row = document.createElement('div');
        row.className = `loan-item loan-${severity}`;
        row.innerHTML = `
          <div>
            <div class="small-title">${escapeHtml(statusText)}${severityText ? ' - ' + escapeHtml(severityText) : ''}</div>
            <div style="font-weight:800">${escapeHtml(loan.name)}</div>
            <div class="loan-meta"><span class="user-pill">${userLabel}</span></div>
            <div class="loan-meta">Etat prêt: ${escapeHtml(conditionLabel)}</div>
            <div class="loan-meta">Du ${formatDisplayDate(loan.start)} au ${formatDisplayDate(loan.due)}</div>
            <div class="progress" aria-hidden="true"><div style="width:${loan.progress}%; background:${barColor}"></div></div>
          </div>
          ${showActions ? `
          <div class="admin-actions">
            ${showCondition ? `
            <select data-cond="${loan.id}">
              ${optionsHtml}
            </select>
            ` : ''}
            <button type="button" class="ghost" data-id="${loan.id}">${opts.actionLabel || 'Marquer rendu'}</button>
          </div>` : ''}
        `;
        const btn = row.querySelector('button');
        const cond = row.querySelector('select');
        if (btn) {
          btn.addEventListener('click', async () => {
            btn.disabled = true;
            btn.textContent = opts.actionLabel || 'Retour...';
            try {
              const condition = cond ? cond.value : '';
              await apiReturnLoan(loan.id, condition);
              await Promise.all([apiFetchAdminLoans(), apiFetchLoans()]);
              render();
            } catch (err) {
              btn.disabled = false;
              btn.textContent = opts.actionLabel || 'Marquer rendu';
            }
          });
        }
        block.appendChild(row);
      });
      target.appendChild(block);
    };

    const buildBubble = (title, subtitle, variant) => {
      const bubble = document.createElement('div');
      bubble.className = 'admin-bubble';
      if (variant) bubble.classList.add(`bubble-${variant}`);
      bubble.innerHTML = `
        <div class="bubble-head">
          <div>
            <div class="small-title">${title}</div>
            ${subtitle ? `<div class="meta">${subtitle}</div>` : ''}
          </div>
        </div>
      `;
      return bubble;
    };

    let hasContent = false;

    if (active.length) {
      const bubble = buildBubble('Réservations en cours', '', 'current');
      renderList(bubble, active, '', { variant: 'current' });
      adminLoansEl.appendChild(bubble);
      hasContent = true;
    }

    const cancels = upcoming.filter((l) => l._cancelRequested);
    const future = upcoming.filter((l) => !l._cancelRequested);
    if (future.length || cancels.length) {
      const bubble = buildBubble('Réservations à venir', '', 'upcoming');
      if (future.length) renderList(bubble, future, '', { variant: 'upcoming' });
      if (cancels.length) renderList(bubble, cancels, '', { actionLabel: 'Annuler réservation', variant: 'alert' });
      adminLoansEl.appendChild(bubble);
      hasContent = true;
    }

    if (!hasContent) {
      adminLoansEl.innerHTML = '<p class="meta">Aucune réservation en cours ou à venir.</p>';
    }
  }

  // Stats côté utilisateur (cartes synthèse).
  function renderStats() {
    const fallback = {
      total_year: state.loans.length,
      active: state.loans.filter((l) => l.status === 'en cours').length,
      returned: Math.max(0, state.loans.length - state.loans.filter((l) => l.status === 'en cours').length),
    };
    const stats = state.stats || fallback;
    statsEls.total.textContent = String(stats.total_year ?? stats.total ?? 0);
    statsEls.active.textContent = String(stats.active ?? 0);
    statsEls.returned.textContent = String(stats.returned ?? 0);
  }

  // Stats côté admin (retards / dégradations / maintenances).
  function renderAdminStats() {
    if (!adminStatsEls.total) return;
    if (!isAdmin()) {
      adminStatsEls.total.textContent = '0';
      adminStatsEls.delays.textContent = '0';
      adminStatsEls.degrades.textContent = '0';
      if (adminStatsEls.maint) adminStatsEls.maint.textContent = '0';
      return;
    }
    const stats = state.adminStats || { total_year: 0, delays: 0, degrades: 0, maints: 0 };
    adminStatsEls.total.textContent = String(stats.total_year ?? 0);
    adminStatsEls.delays.textContent = String(stats.delays ?? 0);
    adminStatsEls.degrades.textContent = String(stats.degrades ?? 0);
    if (adminStatsEls.maint) adminStatsEls.maint.textContent = String(stats.maints ?? 0);
    Object.entries(adminStatsEls.cards).forEach(([key, el]) => {
      if (!el) return;
      el.classList.toggle('active', state.adminStatsView === key.replace('card-', ''));
    });
  }

  // Historique détaillé pour les filtres de stats admin.
  function renderAdminStatsList() {
    if (!adminStatsEls.list) return;
    adminStatsEls.list.innerHTML = '';
    if (!isAdmin()) {
      adminStatsEls.list.innerHTML = '<p class="meta">Réservé aux administrateurs.</p>';
      return;
    }
    const view = state.adminStatsView;
    const all = Array.isArray(state.adminHistory) ? state.adminHistory : [];
    const filtered = all.filter((item) => {
      const matchesView = view === 'total'
        ? true
        : view === 'delays'
          ? item.is_delay
          : view === 'degrades'
            ? item.is_degrade
            : view === 'maint'
              ? item.is_maint
              : true;
      if (!matchesView) return false;
      if (!state.adminHistorySearch) return true;
      const haystack = `${item.user || ''} ${item.name || ''}`.toLowerCase();
      return haystack.includes(state.adminHistorySearch);
    });

    filtered.forEach((it) => {
      const row = document.createElement('div');
      row.className = 'loan-item';
      const badges = [];
      if (it.is_delay) badges.push('<span class="badge status-loan">Retard</span>');
      if (it.is_degrade) {
        let transition = '';
        if ((it.return_state || '').includes('->')) {
          transition = it.return_state.split(':').pop() || it.return_state;
        }
        const cleanTransition = transition ? transition.replace(/^degrade:/i, '') : '';
        const label = cleanTransition || 'Dégradé';
        badges.push(`<span class="badge status-maint">${escapeHtml(label)}</span>`);
      }
      if (it.is_maint) badges.push('<span class="badge status-ok">Maintenance</span>');
      row.innerHTML = `
        <div>
          <div class="small-title">${escapeHtml(it.name || 'Objet')}</div>
          <div class="loan-meta"><span class="user-pill">${escapeHtml(it.user || 'Inconnu')}</span></div>
          <div class="loan-meta">Du ${formatDisplayDate(it.start)} au ${formatDisplayDate(it.due)}</div>
          <div class="loan-meta">Rendu le ${it.returned ? formatDisplayDate(it.returned) : 'Non rendu'}</div>
        </div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">${badges.join('')}</div>
      `;
      adminStatsEls.list.appendChild(row);
    });

    if (!filtered.length) {
      adminStatsEls.list.innerHTML = '<p class="meta">Aucun résultat pour ce filtre.</p>';
    }
  }

  // --- Normalisation et bornage des états matériels ---
  function normalizeCondition(value = '') {
    const cleaned = String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
    if (cleaned.includes('reparation')) return 'reparation nécessaire';
    if (cleaned.includes('passable')) return 'passable';
    if (cleaned.includes('neuf')) return 'neuf';
    if (cleaned.includes('bon')) return 'bon';
    return '';
  }

  function conditionRank(value = '') {
    const norm = normalizeCondition(value);
    const maxRank = Math.max(...Object.values(CONDITION_RANKS));
    return norm && norm in CONDITION_RANKS ? CONDITION_RANKS[norm] : maxRank;
  }

  function allowedReturnConditions(baseCondition = '') {
    const rank = conditionRank(baseCondition);
    const ordered = ['neuf', 'bon', 'passable', 'reparation nécessaire'];
    return ordered.filter((c) => conditionRank(c) <= rank);
  }

  function formatConditionLabel(value = '') {
    const norm = normalizeCondition(value);
    if (norm === 'reparation nécessaire') return 'Réparation nécessaire';
    if (norm === 'passable') return 'Passable';
    if (norm === 'bon') return 'Bon';
    if (norm === 'neuf') return 'Neuf';
    return value || 'N/C';
  }

  function buildReturnOptions(baseCondition = '') {
    const allowed = allowedReturnConditions(baseCondition);
    return allowed
      .map((c) => {
        const value = normalizeCondition(c) || c;
        return `<option value="${escapeHtml(value)}">${escapeHtml(formatConditionLabel(c))}</option>`;
      })
      .join('');
  }

  // --- Modale de réservation / maintenance et calendrier custom ---
  function openModal(item, mode = 'reserve') {
    modalMode = mode;
    state.modalItem = item;
    blockedWeeks = Array.isArray(item.reserved_weeks) ? item.reserved_weeks : [];
    reservationPeriods = Array.isArray(item.reservations) ? item.reservations : [];
    blockedDates = buildBlockedDates(reservationPeriods);
    selectedStartDate = null;
    selectedEndDate = null;
    calendarMonth = new Date();
    modalTitle.textContent = item.name;
    const picture = item.picture || placeholderImage(item.name);
    const categoriesLabel = (item.categories && item.categories.length)
      ? item.categories.join(', ')
      : item.category;
    modalBody.innerHTML = `
      <div class="modal-body-grid">
        <div class="modal-hero">
          <div class="hero-media">
            <img src="${picture}" alt="${escapeHtml(item.name)}" loading="lazy" />
          </div>
          <div class="hero-info">
            <div class="badge ${item.status === 'maintenance' ? 'status-maint' : 'status-ok'}">${escapeHtml(item.status || 'Etat')}</div>
            <div class="meta">Catégories : <strong>${escapeHtml(categoriesLabel || 'N/C')}</strong></div>
            <div class="meta">Référence : <strong>${escapeHtml(item.serial || 'N/C')}</strong></div>
            <div class="meta">Condition : <strong>${escapeHtml(item.condition || 'N/C')}</strong></div>
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
          <div class="calendar-grid" id="calendar-grid"></div>
          <p class="meta">Clique un debut puis une fin (max 14 jours). Les dates grisées sont indisponibles.</p>
        </div>
      </div>
    `;
    renderCalendar();
    modalMsg.textContent = '';
    updateAvailabilityMessage();
    modalBackdrop.classList.add('show');
    reserveBtn.textContent = modalMode === 'maintenance' ? 'Planifier maintenance' : 'Reserver';
  }

  function closeModal() {
    state.modalItem = null;
    modalMode = 'reserve';
    selectedStartDate = null;
    selectedEndDate = null;
    calendarMonth = null;
    modalBackdrop.classList.remove('show');
  }

  // Helpers d'affichage (badges, échappement, formatage dates).
  function statusBadge(status = '') {
    const norm = status.toLowerCase();
    let cls = 'status-ok';
    let label = 'Disponible';
    if (['reserve', 'emprunte', 'pret'].includes(norm)) {
      cls = 'status-loan';
      label = 'Reserve';
    }
    if (['maintenance', 'hs'].includes(norm)) {
      cls = 'status-maint';
      label = 'Maintenance';
    }
    if (!label) label = status;
    return `<span class="badge ${cls}">${label}</span>`;
  }

  function escapeHtml(str = '') {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatDisplayDate(dateStr) {
    if (!dateStr) return 'N/C';
    const parts = String(dateStr).split('-');
    if (parts.length === 3) {
      const [y, m, d] = parts;
      return `${d}/${m}/${y}`;
    }
    return dateStr;
  }

  function formatDateLocal(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function canonicalCategory(cat) {
    const lower = String(cat || '').toLowerCase();
    if (lower.startsWith('info')) return 'Info';
    if (lower.startsWith('elen')) return 'Elen';
    if (lower.startsWith('ener')) return 'Ener';
    if (lower.startsWith('auto')) return 'Auto';
    return null;
  }

  function needsRepair(item) {
    const cond = String(item?.condition || '').toLowerCase();
    const plain = cond.normalize ? cond.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : cond;
    return plain.includes('reparation necessaire');
  }

  function placeholderImage(seed) {
    const s = encodeURIComponent(seed.toLowerCase());
    return `https://source.unsplash.com/collection/190727/600x400?sig=${s}`;
  }

  // Outils calendrier (semaines, dates bloquées, rendu grille).
  function isoWeekKey(dateStr) {
    if (!dateStr) return null;
    const d = new Date(`${dateStr}T00:00:00`);
    if (Number.isNaN(d.getTime())) return null;
    const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = target.getUTCDay() || 7;
    target.setUTCDate(target.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((target - yearStart) / 86400000) + 1) / 7);
    return `${target.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
  }

  function weeksBetween(start, end) {
    const s = new Date(`${start}T00:00:00`);
    const e = new Date(`${end || start}T00:00:00`);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return [];
    const weeks = [];
    const step = s <= e ? 1 : -1;
    const cursor = new Date(s);
    while ((step === 1 && cursor <= e) || (step === -1 && cursor >= e)) {
      const wk = isoWeekKey(cursor.toISOString().slice(0, 10));
      if (wk && !weeks.includes(wk)) weeks.push(wk);
      cursor.setDate(cursor.getDate() + 7 * step);
    }
    return weeks;
  }

  function isRangeFree(start, end) {
    if (!start || !end) return false;
    const dates = datesBetween(start, end);
    if (modalMode === 'maintenance') {
      return dates.every((d) => (blockedDates[d] || '') !== 'maintenance');
    }
    return dates.every((d) => !blockedDates[d]);
  }

  function buildBlockedDates(periods) {
    const dates = {};
    periods.forEach((p) => {
      const list = datesBetween(p.start, p.end || p.start);
      const type = (p.type || '').toLowerCase();
      list.forEach((d) => {
        // Prioritize maintenance if overlaps.
        if (type === 'maintenance') {
          dates[d] = 'maintenance';
        } else if (!dates[d]) {
          dates[d] = 'reserve';
        }
      });
    });
    return dates;
  }

  function datesBetween(start, end) {
    if (!start) return [];
    const s = new Date(`${start}T00:00:00`);
    const e = new Date(`${(end || start)}T00:00:00`);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return [];
    const dates = [];
    const step = s <= e ? 1 : -1;
    const cursor = new Date(s);
    while ((step === 1 && cursor <= e) || (step === -1 && cursor >= e)) {
      dates.push(formatDateLocal(cursor));
      cursor.setDate(cursor.getDate() + step);
    }
    return dates;
  }

  function renderCalendar() {
    const grid = modalBody.querySelector('#calendar-grid');
    const titleEl = modalBody.querySelector('#cal-title');
    const prev = modalBody.querySelector('#cal-prev');
    const next = modalBody.querySelector('#cal-next');
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
    const startDay = (first.getUTCDay() || 7) - 1; // Monday=0
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
      const blockedType = blockedDates[dateStr];
      const canOverride = modalMode === 'maintenance' && blockedType && blockedType !== 'maintenance';
      const blocked = Boolean(blockedType) && !canOverride;
      const selected = isDateSelected(dateStr);
      const inRange = isDateInSelection(dateStr);
      btn.textContent = String(cell.getUTCDate());
      if (blocked) btn.classList.add('blocked');
      if (blockedType === 'maintenance') btn.classList.add('blocked-maint');
      if (canOverride && blockedType !== 'maintenance') btn.classList.add('busy-loan');
      else if (blockedType && blockedType !== 'maintenance') btn.classList.add('blocked-loan');
      if (selected) btn.classList.add('selected');
      if (inRange && !selected) btn.classList.add('in-range');
      btn.onclick = () => handleDayClick(dateStr);
      grid.appendChild(btn);
    });
  }

  // Gestion de la sélection de plage sur le calendrier (avec blocage max 14 jours et dates occupées).
  function handleDayClick(dateStr) {
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
      if (range && dateDiffDays(range.start, range.end) > 14) {
        selectedStartDate = dateStr;
        selectedEndDate = null;
      } else if (range && !isRangeFree(range.start, range.end)) {
        selectedStartDate = dateStr;
        selectedEndDate = null;
      }
    }
    renderCalendar();
    updateAvailabilityMessage();
  }

  function isDateSelected(dateStr) {
    return dateStr === selectedStartDate || dateStr === selectedEndDate;
  }

  function isDateInSelection(dateStr) {
    const range = selectionRange();
    if (!range) return false;
    const list = datesBetween(range.start, range.end);
    return list.includes(dateStr);
  }

  function selectionRange() {
    if (!selectedStartDate) return null;
    if (!selectedEndDate) return null;
    const start = selectedStartDate;
    const end = selectedEndDate;
    return { start, end };
  }

  function dateDiffDays(a, b) {
    const da = new Date(`${a}T00:00:00`);
    const db = new Date(`${b}T00:00:00`);
    if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return 0;
    return Math.abs(Math.round((db - da) / (1000 * 60 * 60 * 24))) + 1;
  }

  function nextAvailableDate() {
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

  function weekStartFromDate(dateObj) {
    const d = new Date(Date.UTC(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate()));
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 1 - day); // move to Monday
    return d.toISOString().slice(0, 10);
  }

  function addDays(dateStr, days) {
    const d = new Date(`${dateStr}T00:00:00`);
    if (Number.isNaN(d.getTime())) return dateStr;
    d.setDate(d.getDate() + days);
    return formatDateLocal(d);
  }

  function updateAvailabilityMessage() {
    const range = selectionRange();
    if (!range) {
      reserveBtn.disabled = true;
      modalMsg.textContent = 'Choisissez un debut puis une fin.';
      modalMsg.className = 'message';
      return;
    }
    const free = isRangeFree(range.start, range.end);
    reserveBtn.disabled = !free;
    const label = free ? 'message ok' : 'message err';
    modalMsg.textContent = free ? `Du ${formatDisplayDate(range.start)} au ${formatDisplayDate(range.end)}` : 'Periode deja reservee';
    modalMsg.className = label;
  }

  function dueSeverity(due) {
    const dueDate = new Date(due);
    if (Number.isNaN(dueDate.getTime())) return 'ok';
    const diffDays = Math.floor((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return 'overdue';
    if (diffDays <= 2) return 'urgent';
    if (diffDays <= 5) return 'soon';
    return 'ok';
  }

  function severityColor(severity) {
    if (severity === 'urgent') return '#f97316';
    if (severity === 'overdue') return '#ef4444';
    if (severity === 'soon') return '#f59e0b';
    return 'linear-gradient(120deg, var(--accent), var(--accent-strong))';
  }

  function severityLabel(severity) {
    if (severity === 'overdue') return 'En retard';
    if (severity === 'urgent') return 'Retour imminent';
    if (severity === 'soon') return 'Retour proche';
    return 'A jour';
  }

  (async function start() {
    await apiSession();
    if (!state.user) {
      window.location.href = 'index.html';
      return;
    }
    setAuthUI();
    await Promise.all([apiFetchEquipment(), apiFetchLoans()]);
    if (isAdmin()) {
      await Promise.all([apiFetchAdminLoans(), apiFetchUsers(), apiFetchAdminStats()]);
    }
    render();
  })();
})();
