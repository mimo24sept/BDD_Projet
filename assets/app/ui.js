/*
  Fichier: assets/app/ui.js.
  Regroupe les comportements UI pour garder un rendu homogene.
  Centralise animations/visibilite pour eviter les divergences.
*/
import { dom } from './dom.js';
import { state } from './state.js';
import { canViewAdminStats, hasMaintenanceAccess, isAdmin, isTechnician } from './permissions.js';

const tabsBar = document.querySelector('.tabs');
const tabOrder = Array.from(dom.tabs).map((tab) => tab.dataset.tab);
let tabIndicator = null;
let tabIndicatorReady = false;

if (tabsBar) {
  // Cree un indicateur unique plutot que plusieurs elements clones.
  tabIndicator = tabsBar.querySelector('.tab-indicator');
  if (!tabIndicator) {
    tabIndicator = document.createElement('div');
    tabIndicator.className = 'tab-indicator';
    tabsBar.appendChild(tabIndicator);
  }
}

// Cache des observers pour ne pas en recreer a chaque rendu.
const revealObservers = new Map();
let resizeBound = false;
/**
 * Cree un IntersectionObserver par conteneur.
 * Ajoute la classe is-visible quand un item entre.
 * Memoise l'observer pour reutilisation.
 */

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
/**
 * Ajoute l'animation reveal sur une liste de noeuds.
 * Gere le stagger via une CSS variable.
 * Passe en mode instant si reduce-motion.
 */

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
/**
 * Determine le sens de transition entre onglets.
 * Compare les positions dans l'ordre des tabs.
 * Retourne from-left ou from-right.
 */

function tabSlideDirection(prevTab, nextTab) {
  const prevIndex = tabOrder.indexOf(prevTab);
  const nextIndex = tabOrder.indexOf(nextTab);
  if (prevIndex === -1 || nextIndex === -1) return 'from-right';
  return nextIndex < prevIndex ? 'from-left' : 'from-right';
}
/**
 * Declenche l'animation d'entree d'une section.
 * Applique la classe de direction puis nettoie.
 * Utilise animationend pour le cleanup.
 */

function animateSectionEntrance(section, directionClass) {
  if (!section) return;
  section.classList.remove('tab-enter', 'from-left', 'from-right');
  void section.offsetWidth;
  section.classList.add('tab-enter', directionClass);
  section.addEventListener('animationend', () => {
    section.classList.remove('tab-enter', 'from-left', 'from-right');
  }, { once: true });
}
/**
 * Positionne l'indicateur sous l'onglet actif.
 * Calcule taille et translation depuis le conteneur.
 * Peut desactiver l'animation sur resize.
 */

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
/**
 * Attache un listener resize unique.
 * Recalcule l'indicateur sans animation.
 * Evite les doubles bindings.
 */

export function setupTabIndicatorResize() {
  if (resizeBound || !tabsBar) return;
  resizeBound = true;
  window.addEventListener('resize', () => updateTabIndicator(false));
}
/**
 * Met a jour le chip utilisateur en entete.
 * Formate le login avec une majuscule.
 * Affiche un fallback si non connecte.
 */

export function setAuthUI() {
  if (dom.userChip) {
    const login = state.user?.login || 'profil';
    const prettyLogin = login.charAt(0).toUpperCase() + login.slice(1);
    dom.userChip.textContent = state.user ? `Utilisateur : ${prettyLogin}` : 'Non connecte';
  }
}
/**
 * Montre ou cache les sections selon le role.
 * Force un onglet valide si le role change.
 * Gere les cas technicien seulement.
 */

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
    if (!isAdminSection) return;
    const isMaintenanceSec = sec.dataset.section === 'admin-maintenance';
    const isAdminStatsSec = sec.dataset.section === 'admin-stats';
    if (isMaintenanceSec) {
      sec.style.display = maintenanceAccess ? '' : 'none';
      return;
    }
    if (isAdminStatsSec && !canViewAdminStats()) {
      sec.style.display = 'none';
      return;
    }
    sec.style.display = adminEnabled ? '' : 'none';
  });
}
/**
 * Bascule l'onglet actif et declenche l'animation.
 * Utilise le sens de transition pour la classe CSS.
 * Force l'indicateur a se recalculer.
 */

export function updateTabs() {
  const activeTab = state.activeTab || 'borrow';
  dom.tabs.forEach((tab) => {
    const isActive = tab.dataset.tab === activeTab;
    tab.classList.toggle('active', isActive);
  });
  dom.sections.forEach((section) => {
    const isActive = section.dataset.section === activeTab;
    if (isActive) {
      const prevTab = section.dataset.prevTab || activeTab;
      const direction = tabSlideDirection(prevTab, activeTab);
      section.dataset.prevTab = activeTab;
      section.hidden = false;
      section.style.display = '';
      animateSectionEntrance(section, direction);
    } else {
      section.hidden = true;
      section.style.display = 'none';
    }
  });
  updateTabIndicator();
}
