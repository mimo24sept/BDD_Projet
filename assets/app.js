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
    activeTab: 'borrow',
    filters: { search: '', tag: null },
    modalItem: null,
    stats: null,
  };

  const logoutBtn = document.querySelector('#logout-btn');
  const userChip = document.querySelector('#user-chip');
  const tabs = document.querySelectorAll('[data-tab]');
  const sections = document.querySelectorAll('[data-section]');
  const catalogEl = document.querySelector('#catalog');
  const loansEl = document.querySelector('#loans');
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
  let dateStartInput = null;
  let dateEndInput = null;
  let blockedWeeks = [];
  let reservationPeriods = [];

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

  if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
  if (modalBackdrop) {
    modalBackdrop.addEventListener('click', (e) => {
      if (e.target === modalBackdrop) closeModal();
    });
  }

  if (reserveBtn) {
    reserveBtn.addEventListener('click', async () => {
      if (!state.user) {
        modalMsg.textContent = 'Connectez-vous pour reserver';
        modalMsg.className = 'message err';
        return;
      }
      if (!dateStartInput || !dateEndInput || !dateStartInput.value || !dateEndInput.value) {
        modalMsg.textContent = 'Choisissez des dates';
        modalMsg.className = 'message err';
        return;
      }
      if (!isRangeFree(dateStartInput.value, dateEndInput.value)) {
        modalMsg.textContent = 'Période déjà réservée (même semaine)';
        modalMsg.className = 'message err';
        return;
      }
      modalMsg.textContent = 'Reservation en cours...';
      modalMsg.className = 'message';
      try {
        const payload = {
          id: state.modalItem?.id,
          start: dateStartInput.value,
          end: dateEndInput.value,
        };
        const res = await fetch(`${API.equipment}?action=reserve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Réservation impossible');
        // Reflect status locally.
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
        modalMsg.textContent = 'Reservation enregistrée';
        modalMsg.className = 'message ok';
        closeModal();
        await Promise.all([apiFetchEquipment(), apiFetchLoans()]);
        render();
      } catch (err) {
        modalMsg.textContent = err?.message || 'Erreur de réservation';
        modalMsg.className = 'message err';
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

  async function apiReturnLoan(id) {
    const res = await fetch(`${API.dashboard}?action=return`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ id }),
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

  function setAuthUI() {
    if (userChip) {
      userChip.textContent = state.user ? `Connecte: ${state.user.login || 'profil'}` : 'Non connecte';
    }
  }

  function render() {
    updateTabs();
    renderCatalog();
    renderLoans();
    renderStats();
    renderTags();
  }

  function updateTabs() {
    tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === state.activeTab));
    sections.forEach((sec) => {
      sec.hidden = sec.dataset.section !== state.activeTab;
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
      const reservationBadge = nextReservation
        ? `<div class="meta">Prochaine résa : ${nextReservation.start} → ${nextReservation.end}</div>`
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
      const row = document.createElement('div');
      row.className = `loan-item loan-${severity}`;
      row.innerHTML = `
        <div>
          <div class="small-title">${escapeHtml(loan.status)} - ${escapeHtml(severityLabel(severity))}</div>
          <div style="font-weight:800">${escapeHtml(loan.name)}</div>
          <div class="loan-meta">Du ${loan.start} au ${loan.due}</div>
          <div class="progress" aria-hidden="true"><div style="width:${loan.progress}%; background:${barColor}"></div></div>
        </div>
        ${
          canReturn
            ? '<button type="button" class="ghost" data-id="' + loan.id + '">Rendre maintenant</button>'
            : '<button type="button" class="ghost" disabled>' +
                (loan.status === 'rendu'
                  ? 'Déjà rendu'
                  : isAdmin ? 'Réservé' : 'Retour en bureau') +
              '</button>'
        }
      `;
      const returnBtn = row.querySelector('button');
      if (canReturn) {
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

  function openModal(item) {
    state.modalItem = item;
    blockedWeeks = Array.isArray(item.reserved_weeks) ? item.reserved_weeks : [];
    reservationPeriods = Array.isArray(item.reservations) ? item.reservations : [];
    modalTitle.textContent = item.name;
    const reservationsList = reservationPeriods.length
      ? `<ul class="meta" style="padding-left:18px;margin:4px 0 8px 0;">${reservationPeriods
          .map((r) => `<li>Réservé du ${escapeHtml(r.start)} au ${escapeHtml(r.end)}</li>`)
          .join('')}</ul>`
      : '<div class="meta">Aucune réservation existante</div>';
    modalBody.innerHTML = `
      <div class="tags">${item.tags.map((t) => `<span>#${escapeHtml(t)}</span>`).join('')}</div>
      <p class="meta">${escapeHtml(item.description || 'Description a venir')}</p>
      <div class="meta">Semaines réservées: ${blockedWeeks.length ? blockedWeeks.map(escapeHtml).join(', ') : 'aucune'}</div>
      <div class="meta">Plages bloquées:</div>
      ${reservationsList}
      <div class="calendar">
        <div>
          <label for="date-start">Debut</label>
          <input type="date" id="date-start" />
        </div>
        <div>
          <label for="date-end">Retour</label>
          <input type="date" id="date-end" />
        </div>
      </div>
    `;
    dateStartInput = modalBody.querySelector('#date-start');
    dateEndInput = modalBody.querySelector('#date-end');
    const defaultStart = nextAvailableDate();
    const defaultEnd = addDays(defaultStart, 7);
    dateStartInput.value = defaultStart;
    dateEndInput.value = defaultEnd;
    modalMsg.textContent = '';
    [dateStartInput, dateEndInput].forEach((input) => {
      input.addEventListener('change', () => {
        if (!input.value) return;
        updateAvailabilityMessage();
      });
    });
    updateAvailabilityMessage();
    modalBackdrop.classList.add('show');
    if (dateStartInput?.showPicker) {
      dateStartInput.showPicker();
    }
  }

  function closeModal() {
    state.modalItem = null;
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
    const weeks = weeksBetween(start, end);
    if (!weeks.length) return false;
    return weeks.every((w) => !blockedWeeks.includes(w));
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

  function addDays(dateStr, days) {
    const d = new Date(`${dateStr}T00:00:00`);
    if (Number.isNaN(d.getTime())) return dateStr;
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  function updateAvailabilityMessage() {
    const start = dateStartInput?.value;
    const end = dateEndInput?.value || start;
    const free = isRangeFree(start, end);
    reserveBtn.disabled = !free;
    modalMsg.textContent = free ? '' : 'Période déjà réservée';
    modalMsg.className = free ? 'message' : 'message err';
    [dateStartInput, dateEndInput].forEach((input) => {
      if (!input) return;
      input.classList.toggle('blocked', !free);
      input.min = nextAvailableDate();
    });
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
    render();
  })();
})();
