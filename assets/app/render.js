import { BASE_TAGS } from './config.js';
import { state } from './state.js';
import { dom } from './dom.js';
import {
  allowedAdminStatsViews,
  canViewAdminStats,
  hasMaintenanceAccess,
  isAdmin,
} from './permissions.js';
import {
  barColorForProgress,
  buildReturnOptions,
  dueSeverity,
  escapeHtml,
  formatConditionLabel,
  formatDateTimeFr,
  formatDisplayDate,
  needsRepair,
  normalizeDateOnly,
  progressPercentWithTime,
  severityColor,
  severityLabel,
  severityVisual,
  statusBadge,
  statusLabelText,
} from './utils.js';
import { openExtendModal, openModal } from './calendar.js';
import { applyRoleVisibility, revealInContainer, updateTabs } from './ui.js';
import {
  apiAdminCancelLoan,
  apiDecideExtension,
  apiDecideMaintenance,
  apiDecideReservationRequest,
  apiDeleteEquipment,
  apiDeleteUser,
  apiFetchAdminLoans,
  apiFetchEquipment,
  apiFetchLoans,
  apiFetchUsers,
  apiReturnLoan,
  apiRequestCancel,
} from './api.js';

export function renderApp() {
  applyRoleVisibility();
  updateTabs();
  renderNotifications();
  renderCatalog();
  renderAdminCatalog();
  renderLoans();
  renderAdminLoans();
  renderMaintenanceAgenda();
  renderAccounts();
  renderStats();
  renderUserStatsList();
  renderTags();
  renderAdminTags();
  renderMaintenanceCatalog();
  renderMaintenanceTags();
  renderAdminStats();
}

export function renderNotifications() {
  if (!dom.notificationsEl) return;
  const base = Array.isArray(state.notifications) ? state.notifications : [];
  const overdue = buildOverdueAlerts();
  const lastDay = buildLastDayAlerts();
  const list = [...lastDay, ...overdue, ...base];
  if (!list.length) {
    dom.notificationsEl.innerHTML = '';
    dom.notificationsEl.hidden = true;
    return;
  }
  dom.notificationsEl.hidden = false;
  dom.notificationsEl.innerHTML = list.map((n) => {
    const received = formatDateTimeFr(n.created_at || '');
    return `
        <div class="alert-banner">
          <div class="alert-icon" aria-hidden="true">!</div>
          <div>
            <div class="alert-title">${escapeHtml(n.message || '')}</div>
            ${received ? `<div class="alert-meta">Reçu le ${escapeHtml(received)}</div>` : ''}
          </div>
        </div>
      `;
  }).join('');
  revealInContainer(dom.notificationsEl, '.alert-banner', { stagger: 80 });
}

export function renderTags() {
  if (!dom.tagBar) return;
  const allTags = BASE_TAGS.filter((tag) => state.inventory.some((item) => (item.tags || []).includes(tag)));
  dom.tagBar.innerHTML = '';
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
    dom.tagBar.appendChild(chip);
  });
}

export function renderAdminTags() {
  if (!dom.adminTagBar) return;
  if (!isAdmin()) {
    dom.adminTagBar.innerHTML = '';
    return;
  }
  const allTags = Array.from(new Set(state.inventory.flatMap((item) => item.tags)));
  dom.adminTagBar.innerHTML = '';
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
    dom.adminTagBar.appendChild(chip);
  });
}

export function renderAdminCatalog() {
  if (!dom.adminInventoryEl) return;
  dom.adminInventoryEl.innerHTML = '';
  if (!isAdmin()) {
    dom.adminInventoryEl.innerHTML = '<p class="meta">Accès réservé aux administrateurs.</p>';
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
    dom.adminInventoryEl.innerHTML = '<p class="meta">Aucun materiel ne correspond au filtre.</p>';
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
          renderApp();
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
    dom.adminInventoryEl.appendChild(card);
  });
  revealInContainer(dom.adminInventoryEl, '.card', { stagger: 40 });
}

export function renderMaintenanceCatalog() {
  if (!dom.maintenanceCatalogEl) return;
  dom.maintenanceCatalogEl.innerHTML = '';
  if (!hasMaintenanceAccess()) {
    dom.maintenanceCatalogEl.innerHTML = '<p class="meta">Accès réservé aux administrateurs ou techniciens.</p>';
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
    const urgent = needsRepair(item);
    const card = document.createElement('article');
    card.className = 'card' + (urgent ? ' card-alert card-urgent' : '');
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
        ${urgent ? '<div class="badge status-maint">Urgence : réparation nécessaire</div>' : ''}
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin:6px 0;">
          <div class="tags" style="margin:0;">${item.tags.map((t) => `<span>${escapeHtml(t)}</span>`).join('')}</div>
          <button type="button" class="ghost" data-id="${item.id}">Planifier maintenance</button>
        </div>
      `;
    card.querySelector('button').addEventListener('click', () => openModal(item, 'maintenance'));
    dom.maintenanceCatalogEl.appendChild(card);
  });
  revealInContainer(dom.maintenanceCatalogEl, '.card', { stagger: 40 });

  if (!filtered.length) {
    dom.maintenanceCatalogEl.innerHTML = '<p class="meta">Aucun materiel ne correspond au filtre.</p>';
  }
}

export function renderMaintenanceTags() {
  if (!dom.maintenanceTagBar) return;
  const allTags = Array.from(new Set(state.inventory.flatMap((item) => item.tags)));
  dom.maintenanceTagBar.innerHTML = '';
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
    dom.maintenanceTagBar.appendChild(chip);
  });
}

export function renderMaintenanceAgenda() {
  if (!dom.maintenanceListEl) return;
  dom.maintenanceListEl.innerHTML = '';
  if (!hasMaintenanceAccess()) {
    dom.maintenanceListEl.innerHTML = '<p class="meta">Accès réservé aux administrateurs ou techniciens.</p>';
    return;
  }
  const isAdminUser = isAdmin();
  const pendingRequests = (state.maintenanceRequests || [])
    .filter((r) => (r.status || '').toLowerCase() === 'pending');
  const maints = state.adminLoans
    .filter((l) => (l.type || '').toLowerCase() === 'maintenance')
    .filter((l) => l.status !== 'rendu');
  const todayStr = new Date().toISOString().slice(0, 10);

  if (pendingRequests.length) {
    const block = document.createElement('div');
    block.className = 'admin-subblock admin-alert';
    const title = document.createElement('div');
    title.className = 'small-title';
    title.textContent = 'Demandes de maintenance en attente';
    block.appendChild(title);
    pendingRequests.forEach((req) => {
      const end = req.due || req.end || req.start;
      const row = document.createElement('div');
      row.className = 'loan-item loan-cancel';
      row.innerHTML = `
         <div>
           <div class="small-title">Validation administrateur requise</div>
           <div style="font-weight:800">${escapeHtml(req.name || 'Matériel')}</div>
           <div class="loan-meta">Du ${formatDisplayDate(req.start)} au ${formatDisplayDate(end)}</div>
           <div class="loan-meta">Demandé par ${escapeHtml(req.requested_by || 'Technicien')}</div>
         </div>
         <div class="admin-actions" style="display:flex;gap:8px;flex-wrap:wrap;">
           ${isAdminUser ? `
             <button type="button" class="ghost" data-approve="${req.id}">Valider</button>
             <button type="button" class="ghost danger" data-reject="${req.id}">Refuser</button>
           ` : '<span class="meta">En attente validation admin</span>'}
         </div>
        `;
      const approveBtn = row.querySelector('button[data-approve]');
      const rejectBtn = row.querySelector('button[data-reject]');
      const setLoading = (btn, label) => {
        if (btn) {
          btn.disabled = true;
          btn.textContent = label;
        }
        if (approveBtn && approveBtn !== btn) approveBtn.disabled = true;
        if (rejectBtn && rejectBtn !== btn) rejectBtn.disabled = true;
      };
      const resetButtons = () => {
        if (approveBtn) {
          approveBtn.disabled = false;
          approveBtn.textContent = 'Valider';
        }
        if (rejectBtn) {
          rejectBtn.disabled = false;
          rejectBtn.textContent = 'Refuser';
        }
      };
      if (isAdminUser) {
        if (approveBtn) {
          approveBtn.addEventListener('click', async () => {
            setLoading(approveBtn, 'Validation...');
            try {
              await apiDecideMaintenance(req.id, 'approve');
              await Promise.all([apiFetchAdminLoans(), apiFetchEquipment()]);
              renderApp();
            } catch (err) {
              resetButtons();
              alert(err?.message || 'Validation impossible');
            }
          });
        }
        if (rejectBtn) {
          rejectBtn.addEventListener('click', async () => {
            setLoading(rejectBtn, 'Refus...');
            try {
              await apiDecideMaintenance(req.id, 'reject');
              await Promise.all([apiFetchAdminLoans(), apiFetchEquipment()]);
              renderApp();
            } catch (err) {
              resetButtons();
              alert(err?.message || 'Refus impossible');
            }
          });
        }
      }
      block.appendChild(row);
    });
    dom.maintenanceListEl.appendChild(block);
  }

  maints.forEach((m) => {
    const startStr = normalizeDateOnly(m.start);
    const hasStarted = Boolean(startStr && startStr <= todayStr);
    const progress = progressPercentWithTime(m.start, m.due);
    const severity = hasStarted ? dueSeverity(m.due || m.start) : 'future';
    const visualSeverity = hasStarted ? severityVisual(severity) : 'ok';
    const barColor = barColorForProgress(progress, visualSeverity);
    const statusLabel = hasStarted ? severityLabel(severity) : 'Planifiée';
    const row = document.createElement('div');
    row.className = `loan-item loan-${visualSeverity}`;
    row.innerHTML = `
       <div>
         <div class="small-title">Maintenance planifiée - ${escapeHtml(statusLabel)}</div>
         <div style="font-weight:800">${escapeHtml(m.name)}</div>
         <div class="loan-meta">Du ${formatDisplayDate(m.start)} au ${formatDisplayDate(m.due)} — ${escapeHtml(m.user || 'Administrateur')}</div>
         <div class="progress" aria-hidden="true"><div style="width:${progress}%; background:${barColor}"></div></div>
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
          renderApp();
        } catch (err) {
          btn.disabled = false;
          btn.textContent = 'Fin de maintenance';
        }
      });
    }
    dom.maintenanceListEl.appendChild(row);
  });

  if (!maints.length && !pendingRequests.length) {
    dom.maintenanceListEl.innerHTML = '<p class="meta">Aucune maintenance planifiée ou demande en attente.</p>';
  }
  revealInContainer(dom.maintenanceListEl, '.loan-item', { stagger: 30 });
}

export function exportInventoryPdf() {
  if (!isAdmin()) {
    alert('Accès réservé aux administrateurs.');
    return;
  }
  const list = state.inventory || [];
  if (!list.length) {
    alert('Aucun matériel à exporter.');
    return;
  }
  const popup = window.open('', '_blank', 'width=900,height=700');
  if (!popup) {
    alert("Impossible d'ouvrir la fenêtre d'export (bloqueur de pop-up ?).");
    return;
  }
  const dateLabel = new Date().toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
  const rowsHtml = list.map((item, idx) => {
    const categories = Array.isArray(item.categories) ? item.categories.join(', ') : (item.category || 'Non classé');
    const condition = formatConditionLabel(item.condition || '');
    const status = statusLabelText(item.status || '');
    const reservationsCount = Array.isArray(item.reservations) ? item.reservations.length : 0;
    const location = item.location || 'Stock';
    return `<tr>
        <td>${idx + 1}</td>
        <td>${escapeHtml(item.name || 'Matériel')}</td>
        <td>${escapeHtml(categories)}</td>
        <td>${escapeHtml(condition)}</td>
        <td>${escapeHtml(status)}</td>
        <td style="text-align:center;">${reservationsCount}</td>
        <td>${escapeHtml(location)}</td>
      </tr>`;
  }).join('');
  const style = `
      body { font-family: Manrope, 'Inter', system-ui, -apple-system, sans-serif; padding: 24px; color: #0f172a; }
      h1 { margin: 0; font-size: 20px; }
      .meta { margin-top: 4px; color: #475569; font-size: 12px; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }
      th, td { border: 1px solid #e2e8f0; padding: 8px; }
      th { background: #fff3e6; text-align: left; }
      tr:nth-child(even) { background: #f8fafc; }
      .footer { margin-top: 12px; color: #64748b; font-size: 12px; }
    `;
  const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8" />
          <title>Inventaire - Parc Materiels</title>
          <style>${style}</style>
        </head>
        <body>
          <h1>Inventaire complet</h1>
          <div class="meta">Export du ${escapeHtml(dateLabel)} — ${list.length} matériel(s)</div>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Nom</th>
                <th>Catégories</th>
                <th>Etat</th>
                <th>Statut</th>
                <th>Réservations</th>
                <th>Emplacement</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
          <div class="footer">Généré automatiquement depuis l’interface admin.</div>
        </body>
      </html>
    `;
  popup.document.write(html);
  popup.document.close();
  popup.focus();
  setTimeout(() => {
    popup.print();
  }, 200);
}

export function renderAccounts() {
  if (!dom.accountsListEl) return;
  dom.accountsListEl.innerHTML = '';
  if (!isAdmin()) {
    dom.accountsListEl.innerHTML = '<p class="meta">Accès réservé aux administrateurs.</p>';
    return;
  }
  if (!state.accounts.length) {
    dom.accountsListEl.innerHTML = '<p class="meta">Aucun compte trouvé.</p>';
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
    dom.accountsListEl.appendChild(row);
  });
  revealInContainer(dom.accountsListEl, '.loan-item', { stagger: 30 });
}

export function renderCatalog() {
  if (!dom.catalogEl) return;
  dom.catalogEl.innerHTML = '';
  const filtered = state.inventory.filter((item) => {
    const matchText = `${item.name} ${item.serial || ''} ${item.category} ${item.tags.join(' ')}`.toLowerCase();
    const okSearch = matchText.includes(state.filters.search);
    const okTags = !state.filters.tags.length
      || state.filters.tags.every((tag) => item.tags.includes(tag));
    return okSearch && okTags;
  });

  filtered.forEach((item) => {
    const tagsHtml = item.tags.map((t) => `<span>${escapeHtml(t)}</span>`).join('');
    const card = document.createElement('article');
    card.className = 'card';
    card.innerHTML = `
        <img src="${item.picture}" alt="${escapeHtml(item.name)}" loading="lazy" />
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
          <div>
            <h3>${escapeHtml(item.name)}</h3>
            <div class="meta">Lieu: ${escapeHtml(item.location || 'Stock')}</div>
          </div>
          ${statusBadge(item.status)}
        </div>
        <div class="meta">Etat: ${escapeHtml(item.condition || 'N/C')} • Ref: ${escapeHtml(item.serial || 'N/C')}</div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin:6px 0;">
          <div class="tags" style="margin:0;">${tagsHtml}</div>
          <button type="button" class="ghost" data-id="${item.id}">Voir et reserver</button>
        </div>
      `;
    card.querySelector('button').addEventListener('click', () => openModal(item));
    dom.catalogEl.appendChild(card);
  });
  revealInContainer(dom.catalogEl, '.card', { stagger: 60 });

  if (!filtered.length) {
    dom.catalogEl.innerHTML = '<p class="meta">Aucun materiel ne correspond au filtre.</p>';
  }
}

export function renderLoans() {
  if (!dom.loansEl) return;
  dom.loansEl.innerHTML = '';
  const adminFlag = isAdmin();
  const today = normalizeDateOnly(new Date());
  const filteredLoans = state.loans.filter((loan) => {
    if (!state.loanSearch) return true;
    const haystack = `${loan.name || ''} ${loan.status || ''}`.toLowerCase();
    return haystack.includes(state.loanSearch);
  });
  const sortedLoans = filteredLoans.sort((a, b) => {
    const started = (loan) => {
      const startStr = normalizeDateOnly(loan.start);
      return startStr && today && startStr <= today;
    };
    const severityKey = (loan) => {
      if (!started(loan)) return 'future';
      return dueSeverity(loan.due);
    };
    const weight = (key) => {
      const map = { overdue: 0, urgent: 1, soon: 2, ok: 3, future: 4 };
      return map[key] ?? 5;
    };
    const wa = weight(severityKey(a));
    const wb = weight(severityKey(b));
    if (wa !== wb) return wa - wb;
    if (wa === weight('future')) {
      return (a.start || '').localeCompare(b.start || '');
    }
    return (a.due || '').localeCompare(b.due || '');
  });

  sortedLoans.forEach((loan) => {
    const startStr = normalizeDateOnly(loan.start);
    const dueStr = normalizeDateOnly(loan.due);
    const hasStarted = Boolean(startStr && today && startStr <= today);
    const progress = progressPercentWithTime(loan.start, loan.due);
    const severity = hasStarted ? dueSeverity(loan.due) : 'ok';
    const visualSeverity = severityVisual(severity);
    const barColor = hasStarted ? barColorForProgress(progress, visualSeverity) : '#e5e7eb';
    const statusLower = (loan.status || '').toLowerCase();
    const isOngoing = hasStarted && statusLower === 'en cours';
    const userStateLabel = isOngoing
      ? (severity === 'overdue'
        ? 'Retard'
        : severity === 'lastday'
          ? 'Dernier jour'
          : (severity === 'urgent' || severity === 'soon')
            ? 'Retour proche'
            : 'A jour')
      : 'A venir';
    const canReturn = adminFlag && loan.type === 'pret' && loan.status !== 'rendu';
    const canRequestCancel = !adminFlag
      && loan.type === 'pret'
      && loan.status !== 'rendu'
      && loan.status !== 'annulation demandee'
      && !hasStarted;
    const extension = loan.extension || null;
    const extensionStatus = (extension?.status || '').toLowerCase();
    const extensionPending = extensionStatus === 'pending';
    const extensionRejected = extensionStatus === 'rejected';
    const extensionApproved = extensionStatus === 'approved';
    const requestedDue = extension?.requested_due || loan.due;
    const canRequestExtension = !adminFlag
      && loan.type === 'pret'
      && loan.status !== 'rendu'
      && statusLower !== 'annulation demandee'
      && hasStarted
      && !extensionPending;

    const actions = [];
    if (canReturn) {
      actions.push(`<button type="button" class="ghost" data-id="${loan.id}">Rendre maintenant</button>`);
    }
    if (canRequestCancel) {
      actions.push(`<button type="button" class="ghost" data-cancel="${loan.id}">Demander annulation</button>`);
    }
    if (canRequestExtension) {
      actions.push(`<button type="button" class="ghost" data-extend="${loan.id}">Prolonger</button>`);
    }
    const actionHtml = actions.length
      ? `<div class="loan-actions" style="display:flex;gap:8px;flex-wrap:wrap;">${actions.join('')}</div>`
      : (loan.status === 'annulation demandee'
        ? '<span class="meta">Annulation demandée</span>'
        : '');

    let extensionMsg = '';
    if (extensionPending) {
      extensionMsg = `Prolongation demandée jusqu'au ${formatDisplayDate(requestedDue)}`;
    } else if (extensionApproved && requestedDue) {
      extensionMsg = `Prolongé jusqu'au ${formatDisplayDate(requestedDue)}`;
    } else if (extensionRejected) {
      extensionMsg = 'Prolongation refusée';
    }

    const row = document.createElement('div');
    row.className = `loan-item loan-${visualSeverity}`;
    row.innerHTML = `
          <div>
            <div class="small-title">${escapeHtml(userStateLabel)}</div>
            <div style="font-weight:800">${escapeHtml(loan.name)}</div>
            <div class="loan-meta">Du ${formatDisplayDate(loan.start)} au ${formatDisplayDate(loan.due)}</div>
            ${extensionMsg ? `<div class="loan-meta">${escapeHtml(extensionMsg)}</div>` : ''}
            <div class="progress" aria-hidden="true"><div style="width:${progress}%; background:${barColor}"></div></div>
          </div>
        ${actionHtml}
      `;
    const returnBtn = canReturn ? row.querySelector('button') : null;
    const cancelBtn = !canReturn ? row.querySelector('button[data-cancel]') : null;
    const extendBtn = row.querySelector('button[data-extend]');
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
    if (extendBtn) {
      extendBtn.addEventListener('click', async () => {
        openExtendModal(loan);
      });
    }
    dom.loansEl.appendChild(row);
  });

  if (!state.loans.length) {
    dom.loansEl.innerHTML = '<p class="meta">Aucun emprunt en cours.</p>';
  }
  revealInContainer(dom.loansEl, '.loan-item', { stagger: 30 });
}

export function renderAdminLoans() {
  if (!dom.adminLoansEl) return;
  dom.adminLoansEl.innerHTML = '';
  if (!isAdmin()) {
    dom.adminLoansEl.innerHTML = '<p class="meta">Accès réservé aux administrateurs.</p>';
    return;
  }
  const layout = document.createElement('div');
  layout.className = 'admin-bubble-columns';
  const activeCol = document.createElement('div');
  activeCol.className = 'admin-bubble-col';
  const priorityCol = document.createElement('div');
  priorityCol.className = 'admin-bubble-col';
  const today = new Date().toISOString().slice(0, 10);
  const active = [];
  const upcoming = [];
  const extensionRequests = [];
  const reservationRequests = (state.reservationRequests || []).filter((req) => {
    const statusNorm = (req.status || '').toLowerCase();
    if (statusNorm && statusNorm !== 'pending') return false;
    if (!state.adminLoanSearch) return true;
    const haystack = `${req.requested_by || ''} ${req.name || ''}`.toLowerCase();
    return haystack.includes(state.adminLoanSearch);
  });
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
      const hasPendingExtension = (loan.extension?.status || '').toLowerCase() === 'pending';
      if (hasPendingExtension) {
        extensionRequests.push(loan);
        return;
      }
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
      const progress = progressPercentWithTime(loan.start, loan.due);
      const severity = dueSeverity(loan.due);
      const visualSeverity = severityVisual(severity);
      const barColor = barColorForProgress(progress, visualSeverity);
      const userLabel = escapeHtml(loan.user || 'Inconnu');
      const baseCondition = loan.condition || '';
      const conditionLabel = formatConditionLabel(baseCondition);
      const optionsHtml = buildReturnOptions(baseCondition);
      const isUpcoming = opts.variant === 'upcoming';
      const isCancelRequest = Boolean(loan._cancelRequested);
      const allowCancel = (isUpcoming && opts.cancelable) || isCancelRequest;
      const statusText = isCancelRequest
        ? 'Annulation demande'
        : isUpcoming
          ? 'Réservation à venir'
          : loan.status;
      const severityText = (!isUpcoming && !isCancelRequest) ? severityLabel(severity) : '';
      const showActions = !isUpcoming || allowCancel;
      const showCondition = showActions && !allowCancel && !isCancelRequest;
      const actionLabel = isCancelRequest
        ? (opts.actionLabel || 'Valider annulation')
        : allowCancel
          ? (opts.actionLabel || 'Supprimer la réservation')
          : (opts.actionLabel || 'Marquer rendu');
      const row = document.createElement('div');
      const cancelClass = isCancelRequest ? ' loan-cancel' : '';
      row.className = `loan-item loan-${visualSeverity}${cancelClass}`;
      row.innerHTML = `
          <div>
            <div class="small-title">${escapeHtml(statusText)}${severityText ? ' - ' + escapeHtml(severityText) : ''}</div>
            <div style="font-weight:800">${escapeHtml(loan.name)}</div>
            <div class="loan-meta"><span class="user-pill">${userLabel}</span></div>
            <div class="loan-meta">Etat prêt: ${escapeHtml(conditionLabel)}</div>
            <div class="loan-meta">Du ${formatDisplayDate(loan.start)} au ${formatDisplayDate(loan.due)}</div>
            <div class="progress" aria-hidden="true"><div style="width:${progress}%; background:${barColor}"></div></div>
          </div>
          ${showActions ? `
          <div class="admin-actions">
            ${showCondition ? `
            <select data-cond="${loan.id}">
              ${optionsHtml}
            </select>
            ` : ''}
            <button type="button" class="ghost" data-id="${loan.id}">${actionLabel}</button>
          </div>` : ''}
        `;
      const btn = row.querySelector('button');
      const cond = row.querySelector('select');
      if (btn) {
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          btn.textContent = allowCancel ? 'Annulation...' : (opts.actionLabel || 'Retour...');
          try {
            if (allowCancel) {
              await apiAdminCancelLoan(loan.id);
            } else {
              const condition = cond ? cond.value : '';
              await apiReturnLoan(loan.id, condition);
            }
            await Promise.all([apiFetchAdminLoans(), apiFetchLoans()]);
            renderApp();
          } catch (err) {
            btn.disabled = false;
            btn.textContent = actionLabel;
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
    activeCol.appendChild(bubble);
    hasContent = true;
  }

  const cancels = upcoming.filter((l) => l._cancelRequested);
  const future = upcoming.filter((l) => !l._cancelRequested);
  if (reservationRequests.length) {
    const bubble = buildBubble('Réservations à valider', '', 'alert');
    const block = document.createElement('div');
    block.className = 'admin-subblock admin-alert';
    reservationRequests.forEach((req) => {
      const end = req.due || req.end || req.start;
      const userLabel = escapeHtml(req.requested_by || 'Inconnu');
      const row = document.createElement('div');
      row.className = 'loan-item loan-cancel';
      row.innerHTML = `
          <div>
            <div class="small-title">Demande de réservation</div>
            <div style="font-weight:800">${escapeHtml(req.name || 'Matériel')}</div>
            <div class="loan-meta"><span class="user-pill">${userLabel}</span></div>
            <div class="loan-meta">Du ${formatDisplayDate(req.start)} au ${formatDisplayDate(end)}</div>
          </div>
          <div class="admin-actions" style="display:flex;gap:8px;flex-wrap:wrap;">
            <button type="button" class="ghost" data-approve="${req.id}">Valider</button>
            <button type="button" class="ghost danger" data-reject="${req.id}">Refuser</button>
          </div>
        `;
      const approveBtn = row.querySelector('button[data-approve]');
      const rejectBtn = row.querySelector('button[data-reject]');
      const setLoading = (btn, label) => {
        btn.disabled = true;
        btn.textContent = label;
        if (approveBtn && approveBtn !== btn) approveBtn.disabled = true;
        if (rejectBtn && rejectBtn !== btn) rejectBtn.disabled = true;
      };
      const resetButtons = () => {
        if (approveBtn) {
          approveBtn.disabled = false;
          approveBtn.textContent = 'Valider';
        }
        if (rejectBtn) {
          rejectBtn.disabled = false;
          rejectBtn.textContent = 'Refuser';
        }
      };
      if (approveBtn) {
        approveBtn.addEventListener('click', async () => {
          setLoading(approveBtn, 'Validation...');
          try {
            await apiDecideReservationRequest(req.id, 'approve');
            renderApp();
          } catch (err) {
            resetButtons();
            alert(err?.message || 'Validation impossible');
          }
        });
      }
      if (rejectBtn) {
        rejectBtn.addEventListener('click', async () => {
          setLoading(rejectBtn, 'Refus...');
          try {
            await apiDecideReservationRequest(req.id, 'reject');
            renderApp();
          } catch (err) {
            resetButtons();
            alert(err?.message || 'Refus impossible');
          }
        });
      }
      block.appendChild(row);
    });
    bubble.appendChild(block);
    priorityCol.appendChild(bubble);
    hasContent = true;
  }
  if (extensionRequests.length) {
    const bubble = buildBubble('Prolongations à traiter', '', 'alert');
    const block = document.createElement('div');
    block.className = 'admin-subblock admin-alert';
    extensionRequests.forEach((loan) => {
      const severity = dueSeverity(loan.due);
      const barColor = severityColor(severity);
      const userLabel = escapeHtml(loan.user || 'Inconnu');
      const requested = loan.extension?.requested_due || loan.due;
      const row = document.createElement('div');
      row.className = 'loan-item loan-cancel';
      row.innerHTML = `
          <div>
            <div class="small-title">Prolongation demandée</div>
            <div style="font-weight:800">${escapeHtml(loan.name)}</div>
            <div class="loan-meta"><span class="user-pill">${userLabel}</span></div>
            <div class="loan-meta">Actuel: ${formatDisplayDate(loan.start)} au ${formatDisplayDate(loan.due)}</div>
            <div class="loan-meta">Demandé: ${formatDisplayDate(loan.start)} au ${formatDisplayDate(requested)}</div>
            <div class="progress" aria-hidden="true"><div style="width:${loan.progress}%; background:${barColor}"></div></div>
          </div>
          <div class="admin-actions" style="display:flex;gap:8px;flex-wrap:wrap;">
            <button type="button" class="ghost" data-approve="${loan.id}">Valider</button>
            <button type="button" class="ghost danger" data-reject="${loan.id}">Refuser</button>
          </div>
        `;
      const approveBtn = row.querySelector('button[data-approve]');
      const rejectBtn = row.querySelector('button[data-reject]');
      const setLoading = (btn, label) => {
        btn.disabled = true;
        btn.textContent = label;
        if (approveBtn && approveBtn !== btn) approveBtn.disabled = true;
        if (rejectBtn && rejectBtn !== btn) rejectBtn.disabled = true;
      };
      const resetButtons = () => {
        if (approveBtn) {
          approveBtn.disabled = false;
          approveBtn.textContent = 'Valider';
        }
        if (rejectBtn) {
          rejectBtn.disabled = false;
          rejectBtn.textContent = 'Refuser';
        }
      };
      if (approveBtn) {
        approveBtn.addEventListener('click', async () => {
          setLoading(approveBtn, 'Validation...');
          try {
            await apiDecideExtension(loan.id, 'approve');
            renderApp();
          } catch (err) {
            resetButtons();
            alert(err?.message || 'Validation impossible');
          }
        });
      }
      if (rejectBtn) {
        rejectBtn.addEventListener('click', async () => {
          setLoading(rejectBtn, 'Refus...');
          try {
            await apiDecideExtension(loan.id, 'reject');
            renderApp();
          } catch (err) {
            resetButtons();
            alert(err?.message || 'Refus impossible');
          }
        });
      }
      block.appendChild(row);
    });
    bubble.appendChild(block);
    priorityCol.appendChild(bubble);
    hasContent = true;
  }
  if (cancels.length) {
    const bubble = buildBubble('Annulations à traiter', '', 'alert');
    renderList(bubble, cancels, '', { actionLabel: 'Valider annulation', variant: 'alert', cancelable: true });
    priorityCol.appendChild(bubble);
    hasContent = true;
  }
  if (future.length) {
    const bubble = buildBubble('Réservations à venir', '', 'upcoming');
    renderList(bubble, future, '', { variant: 'upcoming', cancelable: true, actionLabel: 'Supprimer la réservation' });
    priorityCol.appendChild(bubble);
    hasContent = true;
  }

  if (!hasContent) {
    dom.adminLoansEl.innerHTML = '<p class="meta">Aucune réservation en cours ou à venir.</p>';
  } else {
    if (activeCol.childElementCount) layout.appendChild(activeCol);
    if (priorityCol.childElementCount) layout.appendChild(priorityCol);
    dom.adminLoansEl.appendChild(layout);
  }
  revealInContainer(dom.adminLoansEl, '.loan-item', { stagger: 30 });
}

export function renderStats() {
  if (!dom.statsEls.total) return;
  const history = Array.isArray(state.stats?.history)
    ? state.stats.history
    : Array.isArray(state.loanHistory)
      ? state.loanHistory
      : [];
  const safeHistory = Array.isArray(history) ? history : [];
  const currentYear = new Date().getFullYear();
  const yearHistory = safeHistory.filter((item) => {
    if (!item.start) return false;
    const dt = new Date(`${item.start}T00:00:00`);
    return !Number.isNaN(dt.getTime()) && dt.getFullYear() === currentYear;
  });
  const fallback = {
    total_year: yearHistory.length,
    delays: yearHistory.filter((h) => h.is_delay).length,
    degrades: yearHistory.filter((h) => h.is_degrade).length,
    history: safeHistory,
  };
  const stats = state.stats ? { ...fallback, ...state.stats, history: safeHistory } : fallback;
  dom.statsEls.total.textContent = String(stats.total_year ?? stats.total ?? 0);
  if (dom.statsEls.delays) dom.statsEls.delays.textContent = String(stats.delays ?? 0);
  if (dom.statsEls.degrades) dom.statsEls.degrades.textContent = String(stats.degrades ?? 0);
  Object.entries(dom.statsEls.cards || {}).forEach(([key, el]) => {
    if (!el) return;
    el.classList.toggle('active', state.userStatsView === key);
  });
}

export function renderUserStatsList() {
  if (!dom.statsEls.list) return;
  const history = Array.isArray(state.stats?.history)
    ? state.stats.history
    : Array.isArray(state.loanHistory)
      ? state.loanHistory
      : [];
  dom.statsEls.list.innerHTML = '';
  if (!history.length) {
    dom.statsEls.list.innerHTML = '<p class="meta">Pas encore d\'historique.</p>';
    return;
  }
  const filtered = history.filter((it) => {
    if (state.userStatsView === 'delays') return Boolean(it.is_delay);
    if (state.userStatsView === 'degrades') return Boolean(it.is_degrade);
    return true;
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
    row.innerHTML = `
        <div>
          <div class="small-title">${escapeHtml(it.name || 'Objet')}</div>
          <div class="loan-meta">Du ${formatDisplayDate(it.start)} au ${formatDisplayDate(it.due)}</div>
          <div class="loan-meta">${it.returned ? `Rendu le ${formatDisplayDate(it.returned)}` : 'Pas encore rendu'}</div>
        </div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">${badges.join('')}</div>
      `;
    dom.statsEls.list.appendChild(row);
  });
  revealInContainer(dom.statsEls.list, '.loan-item', { stagger: 30 });

  if (!filtered.length) {
    dom.statsEls.list.innerHTML = '<p class="meta">Aucun élément pour ce filtre.</p>';
  }
}

export function renderAdminStats() {
  if (!dom.adminStatsEls.total) return;
  if (!canViewAdminStats()) {
    dom.adminStatsEls.total.textContent = '0';
    dom.adminStatsEls.delays.textContent = '0';
    dom.adminStatsEls.degrades.textContent = '0';
    if (dom.adminStatsEls.maint) dom.adminStatsEls.maint.textContent = '0';
    return;
  }
  const allowedViews = allowedAdminStatsViews();
  if (!allowedViews.includes(state.adminStatsView)) {
    state.adminStatsView = allowedViews[0] || 'degrades';
  }
  const stats = state.adminStats || { total_year: 0, delays: 0, degrades: 0, maints: 0 };
  dom.adminStatsEls.total.textContent = String(stats.total_year ?? 0);
  dom.adminStatsEls.delays.textContent = String(stats.delays ?? 0);
  dom.adminStatsEls.degrades.textContent = String(stats.degrades ?? 0);
  if (dom.adminStatsEls.maint) dom.adminStatsEls.maint.textContent = String(stats.maints ?? 0);
  Object.entries(dom.adminStatsEls.cards).forEach(([key, el]) => {
    if (!el) return;
    const viewKey = key.replace('card-', '');
    el.style.display = allowedViews.includes(viewKey) ? '' : 'none';
    el.classList.toggle('active', state.adminStatsView === viewKey);
  });
}

export function renderAdminStatsList() {
  if (!dom.adminStatsEls.list) return;
  dom.adminStatsEls.list.innerHTML = '';
  if (!canViewAdminStats()) {
    dom.adminStatsEls.list.innerHTML = '<p class="meta">Réservé aux administrateurs ou techniciens.</p>';
    return;
  }
  const allowedViews = allowedAdminStatsViews();
  const view = allowedViews.includes(state.adminStatsView) ? state.adminStatsView : (allowedViews[0] || 'degrades');
  state.adminStatsView = view;
  const all = Array.isArray(state.adminHistory) ? state.adminHistory : [];
  const filtered = all.filter((item) => {
    const isMaint = Boolean(item.is_maint);
    const matchesView = view === 'maint'
      ? isMaint
      : view === 'delays'
        ? item.is_delay && !isMaint
        : view === 'degrades'
          ? item.is_degrade && !isMaint
          : view === 'total'
            ? !isMaint
            : !isMaint;
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
    dom.adminStatsEls.list.appendChild(row);
  });
  revealInContainer(dom.adminStatsEls.list, '.loan-item', { stagger: 30 });

  if (!filtered.length) {
    dom.adminStatsEls.list.innerHTML = '<p class="meta">Aucun résultat pour ce filtre.</p>';
  }
}

function buildOverdueAlerts() {
  if (isAdmin()) return [];
  const overdueLoans = (state.loans || []).filter((loan) => {
    if ((loan.type || 'pret') !== 'pret') return false;
    if ((loan.status || '').toLowerCase() === 'rendu') return false;
    return dueSeverity(loan.due) === 'overdue';
  });
  return overdueLoans.map((loan) => ({
    id: `overdue-${loan.id}`,
    message: `Votre réservation pour ${loan.name || 'un matériel'} est en retard depuis le ${formatDisplayDate(loan.due)}.`,
    created_at: loan.due || '',
  }));
}

function buildLastDayAlerts() {
  if (isAdmin()) return [];
  const lastDayLoans = (state.loans || []).filter((loan) => {
    if ((loan.type || 'pret') !== 'pret') return false;
    if ((loan.status || '').toLowerCase() === 'rendu') return false;
    return dueSeverity(loan.due) === 'lastday';
  });
  return lastDayLoans.map((loan) => ({
    id: `lastday-${loan.id}`,
    message: `Dernier jour pour rendre ${loan.name || 'un matériel'} (retour attendu le ${formatDisplayDate(loan.due)}).`,
    created_at: loan.due || '',
  }));
}
