/*
  Fichier: assets/theme.js.
  Role: applique le theme clair/sombre avec fallback systeme.
*/
(function initThemeToggle() {
  const storageKey = 'theme-preference';
  const root = document.documentElement;
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const labels = {
    light: 'Clair',
    dark: 'Sombre',
    system: 'Auto',
  };

  function getPreference() {
    const stored = localStorage.getItem(storageKey);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
    return 'system';
  }

  function resolveTheme(preference) {
    if (preference === 'system') return mediaQuery.matches ? 'dark' : 'light';
    return preference;
  }

  function updateButtons(preference) {
    const resolved = resolveTheme(preference);
    const label = labels[resolved] || labels.light;
    const isDark = resolved === 'dark';
    const suffix = preference === 'system' ? ` (${labels.system})` : '';
    document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
      button.setAttribute('data-theme-mode', resolved);
      button.setAttribute('data-theme-preference', preference);
      button.setAttribute('aria-checked', isDark ? 'true' : 'false');
      button.setAttribute('aria-label', `Mode couleur : ${label}`);
      button.title = `Theme : ${label}${suffix}`;
    });
  }

  function applyTheme(preference) {
    if (preference === 'system') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', preference);
    }
    updateButtons(preference);
  }

  function setPreference(preference) {
    if (preference === 'system') {
      localStorage.removeItem(storageKey);
    } else {
      localStorage.setItem(storageKey, preference);
    }
    applyTheme(preference);
  }

  function onToggle() {
    const preference = getPreference();
    const resolved = resolveTheme(preference);
    const next = resolved === 'dark' ? 'light' : 'dark';
    setPreference(next);
  }

  function onSystemChange() {
    if (getPreference() === 'system') applyTheme('system');
  }

  function init() {
    applyTheme(getPreference());
    document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
      button.addEventListener('click', onToggle);
    });
  }

  if (mediaQuery.addEventListener) {
    mediaQuery.addEventListener('change', onSystemChange);
  } else if (mediaQuery.addListener) {
    mediaQuery.addListener(onSystemChange);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
