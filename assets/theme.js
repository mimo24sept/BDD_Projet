/*
  Fichier: assets/theme.js.
  Role: applique le theme clair/sombre avec fallback systeme.
*/
(function initThemeToggle() {
  const storageKey = 'theme-preference';
  const root = document.documentElement;
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  let memoryPreference = null;
  let toggleCount = 0;
  let lastPaletteIndex = -1;
  const labels = {
    light: 'Clair',
    dark: 'Sombre',
    system: 'Auto',
  };
  const palettes = [
    {
      name: 'red',
      vars: {
        '--bg': '#7f1d1d',
        '--card': '#991b1b',
        '--surface': '#991b1b',
        '--surface-alt': '#b91c1c',
        '--surface-muted': '#dc2626',
        '--surface-muted-2': '#ef4444',
        '--surface-muted-3': '#f87171',
        '--surface-disabled': '#fca5a5',
        '--ink': '#ffe4e6',
        '--muted': '#fecaca',
        '--line': '#fca5a5',
        '--accent': '#ff3b30',
        '--accent-soft': '#fecaca',
        '--accent-strong': '#be123c',
        '--accent-tint': '#fda4af',
        '--accent-tint-2': '#f87171',
        '--accent-tint-3': '#ef4444',
        '--accent-tint-4': '#dc2626',
        '--modal-backdrop': 'rgba(127, 29, 29, 0.75)',
      },
    },
    {
      name: 'blue',
      vars: {
        '--bg': '#0f1b4c',
        '--card': '#1e3a8a',
        '--surface': '#1e3a8a',
        '--surface-alt': '#1d4ed8',
        '--surface-muted': '#2563eb',
        '--surface-muted-2': '#3b82f6',
        '--surface-muted-3': '#60a5fa',
        '--surface-disabled': '#93c5fd',
        '--ink': '#dbeafe',
        '--muted': '#bfdbfe',
        '--line': '#60a5fa',
        '--accent': '#3b82f6',
        '--accent-soft': '#93c5fd',
        '--accent-strong': '#1e40af',
        '--accent-tint': '#60a5fa',
        '--accent-tint-2': '#3b82f6',
        '--accent-tint-3': '#2563eb',
        '--accent-tint-4': '#1d4ed8',
        '--modal-backdrop': 'rgba(30, 58, 138, 0.75)',
      },
    },
    {
      name: 'green',
      vars: {
        '--bg': '#064e3b',
        '--card': '#065f46',
        '--surface': '#065f46',
        '--surface-alt': '#047857',
        '--surface-muted': '#059669',
        '--surface-muted-2': '#10b981',
        '--surface-muted-3': '#34d399',
        '--surface-disabled': '#6ee7b7',
        '--ink': '#d1fae5',
        '--muted': '#a7f3d0',
        '--line': '#34d399',
        '--accent': '#22c55e',
        '--accent-soft': '#6ee7b7',
        '--accent-strong': '#047857',
        '--accent-tint': '#34d399',
        '--accent-tint-2': '#10b981',
        '--accent-tint-3': '#059669',
        '--accent-tint-4': '#047857',
        '--modal-backdrop': 'rgba(6, 95, 70, 0.75)',
      },
    },
    {
      name: 'yellow',
      vars: {
        '--bg': '#713f12',
        '--card': '#854d0e',
        '--surface': '#854d0e',
        '--surface-alt': '#a16207',
        '--surface-muted': '#ca8a04',
        '--surface-muted-2': '#eab308',
        '--surface-muted-3': '#facc15',
        '--surface-disabled': '#fde047',
        '--ink': '#fef9c3',
        '--muted': '#fde68a',
        '--line': '#facc15',
        '--accent': '#facc15',
        '--accent-soft': '#fde68a',
        '--accent-strong': '#ca8a04',
        '--accent-tint': '#fcd34d',
        '--accent-tint-2': '#facc15',
        '--accent-tint-3': '#eab308',
        '--accent-tint-4': '#ca8a04',
        '--modal-backdrop': 'rgba(113, 63, 18, 0.75)',
      },
    },
    {
      name: 'pink',
      vars: {
        '--bg': '#831843',
        '--card': '#9d174d',
        '--surface': '#9d174d',
        '--surface-alt': '#be185d',
        '--surface-muted': '#db2777',
        '--surface-muted-2': '#ec4899',
        '--surface-muted-3': '#f472b6',
        '--surface-disabled': '#f9a8d4',
        '--ink': '#fce7f3',
        '--muted': '#fbcfe8',
        '--line': '#f472b6',
        '--accent': '#ec4899',
        '--accent-soft': '#f9a8d4',
        '--accent-strong': '#be185d',
        '--accent-tint': '#f472b6',
        '--accent-tint-2': '#ec4899',
        '--accent-tint-3': '#db2777',
        '--accent-tint-4': '#be185d',
        '--modal-backdrop': 'rgba(131, 24, 67, 0.75)',
      },
    },
    {
      name: 'teal',
      vars: {
        '--bg': '#134e4a',
        '--card': '#115e59',
        '--surface': '#115e59',
        '--surface-alt': '#0f766e',
        '--surface-muted': '#0f766e',
        '--surface-muted-2': '#14b8a6',
        '--surface-muted-3': '#2dd4bf',
        '--surface-disabled': '#5eead4',
        '--ink': '#ccfbf1',
        '--muted': '#99f6e4',
        '--line': '#2dd4bf',
        '--accent': '#14b8a6',
        '--accent-soft': '#5eead4',
        '--accent-strong': '#0f766e',
        '--accent-tint': '#2dd4bf',
        '--accent-tint-2': '#14b8a6',
        '--accent-tint-3': '#0f766e',
        '--accent-tint-4': '#115e59',
        '--modal-backdrop': 'rgba(19, 78, 74, 0.75)',
      },
    },
  ];

  function safeGetPreference() {
    try {
      return localStorage.getItem(storageKey);
    } catch (err) {
      return memoryPreference;
    }
  }

  function safeSetPreference(value) {
    try {
      localStorage.setItem(storageKey, value);
    } catch (err) {
      memoryPreference = value;
    }
  }

  function safeClearPreference() {
    try {
      localStorage.removeItem(storageKey);
    } catch (err) {
      memoryPreference = null;
    }
  }

  function getPreference() {
    const stored = safeGetPreference();
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
      safeClearPreference();
    } else {
      safeSetPreference(preference);
    }
    applyTheme(preference);
  }

  // Easter egg: palettes aleatoires apres 10 bascules de theme.
  function applyRandomPalette() {
    if (!palettes.length) return;
    let nextIndex = Math.floor(Math.random() * palettes.length);
    if (palettes.length > 1 && nextIndex === lastPaletteIndex) {
      nextIndex = (nextIndex + 1) % palettes.length;
    }
    lastPaletteIndex = nextIndex;
    const palette = palettes[nextIndex];
    const vars = palette.vars || {};
    Object.entries(vars).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });
    const accent = vars['--accent'] || '#ff8c32';
    const accentStrong = vars['--accent-strong'] || accent;
    const accentSoft = vars['--accent-soft'] || '#ffe4c8';
    const accentTint = vars['--accent-tint'] || '#fff6ed';
    const accentTint2 = vars['--accent-tint-2'] || '#fff7ed';
    const accentTint3 = vars['--accent-tint-3'] || '#fff8f1';
    root.style.setProperty('--success', accentStrong);
    root.style.setProperty('--success-soft', accentTint3);
    root.style.setProperty('--success-ink', accentStrong);
    root.style.setProperty('--warning', accent);
    root.style.setProperty('--warning-soft', accentTint2);
    root.style.setProperty('--warning-soft-2', accentTint3);
    root.style.setProperty('--warning-border', accentSoft);
    root.style.setProperty('--warning-ink', accentStrong);
    root.style.setProperty('--warning-ink-strong', accentStrong);
    root.style.setProperty('--danger', accentStrong);
    root.style.setProperty('--danger-soft', accentTint);
    root.style.setProperty('--danger-soft-2', accentTint2);
    root.style.setProperty('--danger-soft-3', accentTint3);
    root.style.setProperty('--danger-border', accentSoft);
    root.style.setProperty('--danger-ink', accentStrong);
    root.style.setProperty('--info-soft', accentTint2);
    root.style.setProperty('--info-border', accentSoft);
    root.style.setProperty('--info-ink', accentStrong);
    root.style.setProperty(
      '--page-bg',
      'linear-gradient(180deg, var(--bg) 0%, var(--accent-tint-2) 60%, var(--accent-tint) 100%)'
    );
    root.style.setProperty(
      '--ripple-overlay',
      'radial-gradient(120% 120% at 50% 45%, var(--accent-tint) 0%, var(--accent-soft) 28%, var(--accent) 55%, rgba(15,23,42,0.55) 85%)'
    );
  }

  function onToggle() {
    const preference = getPreference();
    const resolved = resolveTheme(preference);
    const next = resolved === 'dark' ? 'light' : 'dark';
    toggleCount += 1;
    setPreference(next);
    if (toggleCount >= 10) {
      applyRandomPalette();
    }
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
