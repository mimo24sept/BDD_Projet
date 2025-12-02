const API = {
  auth: './api/auth.php',
  equipment: './api/equipment.php',
  dashboard: './api/dashboard.php',
};

(() => {
  const appShell = document.querySelector('#app-shell');
  if (!appShell) return;

  const state = {
    user: null,
    inventory: [],
    loans: [],
    adminLoans: [],
    activeTab: 'borrow',
    filters: { search: '', tag: null },
    maintenanceFilters: { search: '', tag: null },
    modalItem: null,
    stats: null,
  };

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
    category: document.querySelector('#admin-category'),
    location: document.querySelector('#admin-location'),
    serial: document.querySelector('#admin-serial'),
    condition: document.querySelector('#admin-condition'),
  };
  const maintenanceCatalogEl = document.querySelector('#maintenance-catalog');
  const maintenanceSearchInput = document.querySelector('#maintenance-search');
  const maintenanceTagBar = document.querySelector('#maintenance-tag-bar');
  let dateStartInput = null;
  let dateEndInput = null;
  let blockedWeeks = [];
  let blockedDates = [];
  let reservationPeriods = [];
  let modalMode = 'reserve';
  let calendarMonth = null;
  let selectedStartDate = null;
  let selectedEndDate = null;

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await apiLogout();
      state.user = null;
      window.location.href = 'index.html';
    });
  }

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      state.activeTab = tab.dataset.tab;
      updateTabs();
    });
  });

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

  if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
  if (modalBackdrop) {
    modalBackdrop.addEventListener('click', (e) => {
      if (e.target === modalBackdrop) closeModal();
    });
  }

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

  if (adminForm) {
    adminForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!isAdmin()) return;
      const payload = {
        name: adminInputs.name?.value?.trim(),
        category: adminInputs.category?.value?.trim(),
        location: adminInputs.location?.value?.trim(),
        serial: adminInputs.serial?.value?.trim(),
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
        const reservations = (item.reservations || [])
          .map((r) => ({
            start: r.start,
            end: r.end || r.start,
            type: r.type || '',
          }))
          .sort((a, b) => (a.start || '').localeCompare(b.start || ''));
        const tags = (item.tags && item.tags.length ? item.tags : [
          item.category,
          item.condition,
          item.maintenance ? 'maintenance' : null,
        ]).filter(Boolean);
        const descriptionParts = [
          item.notes,
          item.condition ? `Etat: ${item.condition}` : '',
          item.next_service ? `Maintenance prevue le ${item.next_service}` : '',
        ].filter(Boolean);
        return {
          ...item,
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
    } catch (err) {
      state.adminLoans = [];
    }
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
    renderLoans();
    renderAdminLoans();
    renderStats();
    renderTags();
    renderMaintenanceCatalog();
    renderMaintenanceTags();
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
    const allTags = Array.from(new Set(state.inventory.flatMap((item) => item.tags)));
    tagBar.innerHTML = '';
    allTags.forEach((tag) => {
      const chip = document.createElement('button');
      chip.className = 'tag-chip' + (state.filters.tag === tag ? ' active' : '');
      chip.type = 'button';
      chip.textContent = `#${tag}`;
      chip.addEventListener('click', () => {
        state.filters.tag = state.filters.tag === tag ? null : tag;
        renderCatalog();
        renderTags();
      });
      tagBar.appendChild(chip);
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
      const matchText = `${item.name} ${item.category} ${item.tags.join(' ')}`.toLowerCase();
      const okSearch = matchText.includes(state.maintenanceFilters.search);
      const okTag = !state.maintenanceFilters.tag || item.tags.includes(state.maintenanceFilters.tag);
      return okSearch && okTag;
    });

    filtered.forEach((item) => {
      const nextReservation = (item.reservations && item.reservations[0]) || null;
      const nextLabel = (nextReservation?.type || '').toLowerCase() === 'maintenance'
        ? 'Maintenance planifiée'
        : 'Prochaine résa';
      const reservationBadge = nextReservation
        ? `<div class="meta">${nextLabel} : ${nextReservation.start} → ${nextReservation.end}</div>`
        : '<div class="meta">Aucune réservation à venir</div>';
      const card = document.createElement('article');
      card.className = 'card';
      card.innerHTML = `
        <img src="${item.picture}" alt="${escapeHtml(item.name)}" loading="lazy" />
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
          <div>
            <h3>${escapeHtml(item.name)}</h3>
            <div class="meta">${escapeHtml(item.category)} - ${escapeHtml(item.location || 'Stock')}</div>
          </div>
          ${statusBadge(item.status)}
        </div>
        ${reservationBadge}
        <div class="tags">${item.tags.map((t) => `<span>#${escapeHtml(t)}</span>`).join('')}</div>
        <button type="button" class="ghost" data-id="${item.id}">Planifier maintenance</button>
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
      chip.textContent = `#${tag}`;
      chip.addEventListener('click', () => {
        state.maintenanceFilters.tag = state.maintenanceFilters.tag === tag ? null : tag;
        renderMaintenanceCatalog();
        renderMaintenanceTags();
      });
      maintenanceTagBar.appendChild(chip);
    });
  }

  function renderCatalog() {
    if (!catalogEl) return;
    catalogEl.innerHTML = '';
    const filtered = state.inventory.filter((item) => {
      const matchText = `${item.name} ${item.category} ${item.tags.join(' ')}`.toLowerCase();
      const okSearch = matchText.includes(state.filters.search);
      const okTag = !state.filters.tag || item.tags.includes(state.filters.tag);
      return okSearch && okTag;
    });

    filtered.forEach((item) => {
      const nextReservation = (item.reservations && item.reservations[0]) || null;
      const nextLabel = (nextReservation?.type || '').toLowerCase() === 'maintenance'
        ? 'Maintenance planifiée'
        : 'Prochaine résa';
      const reservationBadge = nextReservation
        ? `<div class="meta">${nextLabel} : ${nextReservation.start} → ${nextReservation.end}</div>`
        : '<div class="meta">Aucune réservation à venir</div>';
      const card = document.createElement('article');
      card.className = 'card';
      card.innerHTML = `
        <img src="${item.picture}" alt="${escapeHtml(item.name)}" loading="lazy" />
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
          <div>
            <h3>${escapeHtml(item.name)}</h3>
            <div class="meta">${escapeHtml(item.category)} - ${escapeHtml(item.location || 'Stock')}</div>
          </div>
          ${statusBadge(item.status)}
        </div>
        ${reservationBadge}
        <div class="tags">${item.tags.map((t) => `<span>#${escapeHtml(t)}</span>`).join('')}</div>
        <button type="button" class="ghost" data-id="${item.id}">Voir et reserver</button>
      `;
      card.querySelector('button').addEventListener('click', () => openModal(item));
      catalogEl.appendChild(card);
    });

    if (!filtered.length) {
      catalogEl.innerHTML = '<p class="meta">Aucun materiel ne correspond au filtre.</p>';
    }
  }

  function renderLoans() {
    loansEl.innerHTML = '';
    const isAdmin = (state.user?.role || '').toLowerCase().includes('admin');
    state.loans.forEach((loan) => {
      const severity = dueSeverity(loan.due);
      const barColor = severityColor(severity);
      const canReturn = isAdmin && loan.type === 'pret' && loan.status !== 'rendu';
      const actionHtml = canReturn
        ? '<button type="button" class="ghost" data-id="' + loan.id + '">Rendre maintenant</button>'
        : isAdmin
          ? '<button type="button" class="ghost" disabled>' +
              (loan.status === 'rendu' ? 'Déjà rendu' : 'Réservé') +
            '</button>'
          : '';

      const row = document.createElement('div');
      row.className = `loan-item loan-${severity}`;
      row.innerHTML = `
        <div>
          <div class="small-title">${escapeHtml(loan.status)} - ${escapeHtml(severityLabel(severity))}</div>
          <div style="font-weight:800">${escapeHtml(loan.name)}</div>
          <div class="loan-meta">Du ${loan.start} au ${loan.due}</div>
          <div class="progress" aria-hidden="true"><div style="width:${loan.progress}%; background:${barColor}"></div></div>
        </div>
        ${actionHtml}
      `;
      const returnBtn = canReturn ? row.querySelector('button') : null;
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
      loansEl.appendChild(row);
    });

    if (!state.loans.length) {
      loansEl.innerHTML = '<p class="meta">Aucun emprunt en cours.</p>';
    }
  }

  function renderAdminLoans() {
    if (!adminLoansEl) return;
    adminLoansEl.innerHTML = '';
    if (!isAdmin()) {
      adminLoansEl.innerHTML = '<p class="meta">Accès réservé aux administrateurs.</p>';
      return;
    }
    state.adminLoans
      .filter((l) => l.status !== 'rendu')
      .forEach((loan) => {
        const severity = dueSeverity(loan.due);
        const barColor = severityColor(severity);
        const row = document.createElement('div');
        row.className = `loan-item loan-${severity}`;
        row.innerHTML = `
          <div>
            <div class="small-title">${escapeHtml(loan.status)} - ${escapeHtml(severityLabel(severity))}</div>
            <div style="font-weight:800">${escapeHtml(loan.name)}</div>
            <div class="loan-meta">Du ${loan.start} au ${loan.due} — ${escapeHtml(loan.user || 'Inconnu')}</div>
            <div class="progress" aria-hidden="true"><div style="width:${loan.progress}%; background:${barColor}"></div></div>
          </div>
          <div class="admin-actions">
            <select data-cond="${loan.id}">
              <option value="">Etat au retour</option>
              <option value="neuf">Neuf</option>
              <option value="bon">Bon</option>
              <option value="passable">Passable</option>
              <option value="reparation nécessaire">Réparation nécessaire</option>
            </select>
            <button type="button" class="ghost" data-id="${loan.id}">Marquer rendu</button>
          </div>
        `;
        const btn = row.querySelector('button');
        const cond = row.querySelector('select');
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          btn.textContent = 'Retour...';
          try {
            await apiReturnLoan(loan.id, cond?.value || '');
            await Promise.all([apiFetchAdminLoans(), apiFetchLoans()]);
            render();
          } catch (err) {
            btn.disabled = false;
            btn.textContent = 'Marquer rendu';
          }
        });
        adminLoansEl.appendChild(row);
      });

    if (!state.adminLoans.filter((l) => l.status !== 'rendu').length) {
      adminLoansEl.innerHTML = '<p class="meta">Aucune réservation en cours.</p>';
    }
  }

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
    modalBody.innerHTML = `
      <div class="modal-body-grid">
        <div class="modal-hero">
          <div class="hero-media">
            <img src="${picture}" alt="${escapeHtml(item.name)}" loading="lazy" />
          </div>
          <div class="hero-info">
            <div class="badge ${item.status === 'maintenance' ? 'status-maint' : 'status-ok'}">${escapeHtml(item.status || 'Etat')}</div>
            <div class="meta">Condition : <strong>${escapeHtml(item.condition || 'N/C')}</strong></div>
            <div class="meta">Emplacement : <strong>${escapeHtml(item.location || 'Stock')}</strong></div>
            <div class="tags">${item.tags.map((t) => `<span>#${escapeHtml(t)}</span>`).join('')}</div>
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

  function placeholderImage(seed) {
    const s = encodeURIComponent(seed.toLowerCase());
    return `https://source.unsplash.com/collection/190727/600x400?sig=${s}`;
  }

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
    return dates.every((d) => !blockedDates.includes(d));
  }

  function buildBlockedDates(periods) {
    const dates = new Set();
    periods.forEach((p) => {
      const list = datesBetween(p.start, p.end || p.start);
      list.forEach((d) => dates.add(d));
    });
    return Array.from(dates);
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
      dates.push(cursor.toISOString().slice(0, 10));
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
      const blocked = blockedDates.includes(dateStr);
      const selected = isDateSelected(dateStr);
      const inRange = isDateInSelection(dateStr);
      btn.textContent = String(cell.getUTCDate());
      if (blocked) btn.classList.add('blocked');
      if (selected) btn.classList.add('selected');
      if (inRange && !selected) btn.classList.add('in-range');
      btn.onclick = () => handleDayClick(dateStr);
      grid.appendChild(btn);
    });
  }

  function handleDayClick(dateStr) {
    if (blockedDates.includes(dateStr)) return;
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
        return cursor.toISOString().slice(0, 10);
      }
      cursor.setDate(cursor.getDate() + 7);
    }
    return new Date().toISOString().slice(0, 10);
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
    return d.toISOString().slice(0, 10);
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
    modalMsg.textContent = free ? `Du ${range.start} au ${range.end}` : 'Periode deja reservee';
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
      await apiFetchAdminLoans();
    }
    render();
  })();
})();
