/*
  Fichier: assets/app/ui.js
  Role: comportements UI generaux.
  Anime lindicateur donglets et les transitions.
  Gere la visibilite des sections selon les roles.
  Expose des helpers de reveal et resize.
*/
import { dom } from './dom.js';
import { state } from './state.js';
import { canViewAdminStats, hasMaintenanceAccess, isAdmin, isTechnician } from './permissions.js';

const tabsBar = document.querySelector('.tabs');
const tabOrder = Array.from(dom.tabs).map((tab) => tab.dataset.tab);
let tabIndicator = null;
let tabIndicatorReady = false;

if (tabsBar) {
  tabIndicator = tabsBar.querySelector('.tab-indicator');
  if (!tabIndicator) {
    tabIndicator = document.createElement('div');
    tabIndicator.className = 'tab-indicator';
    tabsBar.appendChild(tabIndicator);
  }
}

const revealObservers = new Map();
let resizeBound = false;

function getRevealObserver(root) {
  const key = root || 'viewport';
  if (revealObservers.has(key)) return revealObservers.get(key);
  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      obs.unobserve(entry.target);
    });
  }, {
    root: root || null,
    threshold: 0.12,
    rootMargin: '0px 0px -8% 0px',
  });
  revealObservers.set(key, observer);
  return observer;
}

export function revealInContainer(container, selector, options = {}) {
  if (!container) return;
  const items = container.querySelectorAll(selector);
  if (!items.length) return;
  const prefersReduced = window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const supportsObserver = 'IntersectionObserver' in window;
  const root = container.classList.contains('scroll-area') || container.classList.contains('admin-scroll')
    ? container
    : container.closest('.scroll-area, .admin-scroll');
  const observer = (!prefersReduced && supportsObserver) ? getRevealObserver(root || null) : null;
  const stagger = Number.isFinite(options.stagger) ? options.stagger : 60;
  items.forEach((el, index) => {
    if (el.dataset.reveal === '1') return;
    el.dataset.reveal = '1';
    el.classList.add('reveal-item');
    if (!observer) {
      el.classList.add('is-visible');
      return;
    }
    const delay = Math.min(index, 8) * stagger;
    el.style.setProperty('--reveal-delay', `${delay}ms`);
    observer.observe(el);
  });
}

function tabSlideDirection(prevTab, nextTab) {
  const prevIndex = tabOrder.indexOf(prevTab);
  const nextIndex = tabOrder.indexOf(nextTab);
  if (prevIndex === -1 || nextIndex === -1) return 'from-right';
  return nextIndex < prevIndex ? 'from-left' : 'from-right';
}

function animateSectionEntrance(section, directionClass) {
  if (!section) return;
  section.classList.remove('tab-enter', 'from-left', 'from-right');
  void section.offsetWidth;
  section.classList.add('tab-enter', directionClass);
  section.addEventListener('animationend', () => {
    section.classList.remove('tab-enter', 'from-left', 'from-right');
  }, { once: true });
}

function updateTabIndicator(animate = true) {
  if (!tabsBar || !tabIndicator) return;
  const activeTab = tabsBar.querySelector('.tab.active');
  if (!activeTab || activeTab.offsetParent === null) {
    tabIndicator.style.opacity = '0';
    return;
  }
  const barRect = tabsBar.getBoundingClientRect();
  const tabRect = activeTab.getBoundingClientRect();
  const x = tabRect.left - barRect.left;
  const y = tabRect.top - barRect.top;
  if (!animate) {
    tabIndicator.classList.remove('ready');
    tabIndicatorReady = false;
  }
  tabIndicator.style.width = `${tabRect.width}px`;
  tabIndicator.style.height = `${tabRect.height}px`;
  tabIndicator.style.transform = `translate(${x}px, ${y}px)`;
  tabIndicator.style.opacity = '1';
  if (!tabIndicatorReady) {
    requestAnimationFrame(() => {
      tabIndicator.classList.add('ready');
      tabIndicatorReady = true;
    });
  }
}

export function setupTabIndicatorResize() {
  if (resizeBound || !tabsBar) return;
  resizeBound = true;
  window.addEventListener('resize', () => updateTabIndicator(false));
}

export function setAuthUI() {
  if (dom.userChip) {
    const login = state.user?.login || 'profil';
    const prettyLogin = login.charAt(0).toUpperCase() + login.slice(1);
    dom.userChip.textContent = state.user ? `Utilisateur : ${prettyLogin}` : 'Non connecte';
  }
}

export function applyRoleVisibility() {
  const adminEnabled = isAdmin();
  const techEnabled = isTechnician();
  const maintenanceAccess = hasMaintenanceAccess();
  const techOnly = techEnabled && !adminEnabled;
  dom.tabs.forEach((tab) => {
    const isAdminTab = tab.dataset.role === 'admin';
    const isUserLoansTab = tab.dataset.tab === 'loans';
    const isBorrowTab = tab.dataset.tab === 'borrow';
    const isStatsTab = tab.dataset.tab === 'stats';
    const isMaintenanceTab = tab.dataset.tab === 'admin-maintenance';
    const isAdminStatsTab = tab.dataset.tab === 'admin-stats';
    if (techOnly && !isAdminTab && !isMaintenanceTab) {
      tab.style.display = 'none';
      return;
    }
    if (isAdminTab) {
      if (isMaintenanceTab) {
        tab.style.display = maintenanceAccess ? '' : 'none';
      } else if (isAdminStatsTab && canViewAdminStats()) {
        tab.style.display = '';
      } else {
        tab.style.display = adminEnabled ? '' : 'none';
      }
    } else if (isUserLoansTab || isBorrowTab || isStatsTab) {
      tab.style.display = adminEnabled ? 'none' : '';
    } else {
      tab.style.display = '';
    }
  });
  dom.sections.forEach((sec) => {
    const isAdminSection = sec.dataset.role === 'admin';
    const isUserLoans = sec.dataset.section === 'loans';
    const isBorrow = sec.dataset.section === 'borrow';
    const isStats = sec.dataset.section === 'stats';
    const isMaintenanceSection = sec.dataset.section === 'admin-maintenance';
    const isAdminStatsSection = sec.dataset.section === 'admin-stats';
    if (techOnly && !isMaintenanceSection && !isAdminStatsSection) {
      sec.hidden = true;
      return;
    }
    if (isAdminSection) {
      if (isMaintenanceSection) {
        sec.hidden = !maintenanceAccess;
      } else if (isAdminStatsSection) {
        sec.hidden = !canViewAdminStats();
      } else {
        sec.hidden = !adminEnabled;
      }
    } else if ((isUserLoans || isBorrow || isStats) && adminEnabled) {
      sec.hidden = true;
    } else {
      sec.hidden = false;
    }
  });
  if (techOnly) {
    const allowedTabs = ['admin-maintenance', 'admin-stats'];
    if (!allowedTabs.includes(state.activeTab)) {
      state.activeTab = 'admin-maintenance';
    }
  } else if (adminEnabled && (state.activeTab === 'loans' || state.activeTab === 'borrow' || state.activeTab === 'stats')) {
    state.activeTab = 'admin-add';
  } else if (!maintenanceAccess && state.activeTab === 'admin-maintenance') {
    state.activeTab = adminEnabled ? 'admin-add' : 'borrow';
  } else if (!maintenanceAccess && !adminEnabled && state.activeTab.startsWith('admin')) {
    state.activeTab = 'borrow';
  }
}

export function updateTabs() {
  const previousTab = state.lastActiveTab;
  const nextTab = state.activeTab;
  const shouldAnimate = Boolean(previousTab && previousTab !== nextTab);
  const directionClass = shouldAnimate ? tabSlideDirection(previousTab, nextTab) : 'from-right';
  dom.tabs.forEach((tab) => {
    const isMaintenanceTab = tab.dataset.tab === 'admin-maintenance';
    if (isMaintenanceTab && !hasMaintenanceAccess()) {
      tab.classList.remove('active');
      tab.style.display = 'none';
      return;
    }
    if (tab.dataset.role === 'admin' && !isAdmin()) {
      const isAdminStatsTab = tab.dataset.tab === 'admin-stats';
      const allowed = (isMaintenanceTab && hasMaintenanceAccess()) || (isAdminStatsTab && canViewAdminStats());
      if (!allowed) {
        tab.classList.remove('active');
        tab.style.display = tab.style.display || 'none';
        return;
      }
    }
    tab.classList.toggle('active', tab.dataset.tab === state.activeTab);
  });
  dom.sections.forEach((sec) => {
    const isAdminSection = sec.dataset.role === 'admin';
    const isLoansSection = sec.dataset.section === 'loans';
    const isBorrowSection = sec.dataset.section === 'borrow';
    const isStatsSection = sec.dataset.section === 'stats';
    const isMaintenanceSection = sec.dataset.section === 'admin-maintenance';
    const isAdminStatsSection = sec.dataset.section === 'admin-stats';
    const isUserSection = isLoansSection || isBorrowSection || isStatsSection;
    const allowAdminSection = isAdmin()
      || (isMaintenanceSection && hasMaintenanceAccess())
      || (isAdminStatsSection && canViewAdminStats());
    const shouldShow = sec.dataset.section === state.activeTab
      && (!isAdminSection || allowAdminSection)
      && !(isUserSection && isAdmin());
    if (shouldShow) {
      sec.hidden = false;
      if (shouldAnimate) animateSectionEntrance(sec, directionClass);
    } else {
      sec.hidden = true;
      sec.classList.remove('tab-enter', 'from-left', 'from-right');
    }
  });
  updateTabIndicator(shouldAnimate);
  state.lastActiveTab = nextTab;
}
