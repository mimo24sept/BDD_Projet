/*
  Fichier: assets/login.js
  Role: logique de connexion/inscription cote front.
  Gere les bascules de formulaires et la visibilite du mot de passe.
  Declenche lanimation ripple puis la redirection.
  Centralise les appels auth vers lAPI.
*/
// Rôle : gérer la connexion/inscription côté front, puis lancer l'animation ripple avant de rediriger.

const API = { auth: './api/auth.php' };

const loginForm = document.querySelector('#login-form');
const loginMsg = document.querySelector('#login-msg');
const registerForm = document.querySelector('#register-form');
const registerMsg = document.querySelector('#register-msg');
const roleSelect = document.querySelector('#reg-role');
const secretRow = document.querySelector('#reg-secret-row');
const toggleRegisterBtn = document.querySelector('#toggle-register');
const backToLoginBtn = document.querySelector('#back-to-login');
const loginBlock = document.querySelector('#login-block');
const registerBlock = document.querySelector('#register-block');
const authWall = document.querySelector('.auth-wall');
const rippleOverlay = document.querySelector('#ripple-overlay');
let authLoaderResizeBound = false;
/**
 * Ajuste le texte GEII pour quil remplisse la largeur de la barre.
 * Mesure la largeur des lettres et calcule un nouveau font-size.
 * Respecte le gap defini en CSS pour les espacements.
 * Ignore le recalcul si les elements sont absents.
 */

function fitLoaderLabel(loader) {
  const label = loader.querySelector('.loader-label');
  const track = loader.querySelector('.loader-track');
  if (!label || !track) return;
  const gapValue = getComputedStyle(label).getPropertyValue('--letter-gap');
  const gap = Number.parseFloat(gapValue) || 5;
  const letters = Array.from(label.querySelectorAll('.label-base span'));
  if (!letters.length) return;
  const baseSize = 120;
  label.style.fontSize = `${baseSize}px`;
  const lettersWidth = letters.reduce((sum, span) => sum + span.getBoundingClientRect().width, 0);
  const targetWidth = track.getBoundingClientRect().width - gap * (letters.length - 1);
  if (lettersWidth <= 0 || targetWidth <= 0) return;
  label.style.fontSize = `${baseSize * (targetWidth / lettersWidth)}px`;
}
/**
 * Cree le loader de connexion si absent dans loverlay.
 * Injecte la structure HTML (lettres + barre) a la volee.
 * Declenche un ajustement de taille apres chargement des polices.
 * Installe un listener resize unique pour recalculer.
 */

function ensureAuthLoader() {
  if (!rippleOverlay) return;
  if (rippleOverlay.querySelector('.auth-loader')) return;
  const loader = document.createElement('div');
  loader.className = 'auth-loader';
  loader.setAttribute('role', 'status');
  loader.setAttribute('aria-live', 'polite');
  loader.innerHTML = `
    <div class="loader-label" aria-hidden="true">
      <span class="label-layer label-base">
        <span>G</span><span>E</span><span>I</span><span>I</span>
      </span>
      <span class="label-layer label-fill">
        <span>G</span><span>E</span><span>I</span><span>I</span>
      </span>
    </div>
    <div class="loader-track" aria-hidden="true">
      <div class="loader-bar"></div>
    </div>
  `;
  rippleOverlay.appendChild(loader);
  fitLoaderLabel(loader);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => fitLoaderLabel(loader));
  }
  if (!authLoaderResizeBound) {
    authLoaderResizeBound = true;
    window.addEventListener('resize', () => {
      const activeLoader = rippleOverlay.querySelector('.auth-loader');
      if (activeLoader) fitLoaderLabel(activeLoader);
    });
  }
}

// Active le bouton œil sur chaque champ mot de passe pour basculer texte/masqué.
function initPasswordToggles() {
  document.querySelectorAll('.password-field').forEach((wrapper) => {
    const input = wrapper.querySelector('input');
    const toggle = wrapper.querySelector('.password-toggle');
    if (!input || !toggle) return;
    toggle.setAttribute('aria-pressed', 'false');
    toggle.addEventListener('click', () => {
      const reveal = input.type === 'password';
      input.type = reveal ? 'text' : 'password';
      toggle.classList.toggle('revealed', reveal);
      toggle.setAttribute('aria-pressed', reveal ? 'true' : 'false');
      toggle.setAttribute('aria-label', reveal ? 'Masquer le mot de passe' : 'Afficher le mot de passe');
    });
  });
}

// Animation ripple puis redirection vers le tableau de bord après succès.
function playRippleAndRedirect() {
  if (!rippleOverlay) {
    window.location.href = 'menu.html';
    return;
  }
  if (document.body.classList.contains('auth-transition')) return;
  const prefersReduced = window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduced) {
    window.location.href = 'menu.html';
    return;
  }
  document.body.classList.add('auth-transition');
  if (authWall) authWall.classList.add('is-exiting');
  ensureAuthLoader();
  rippleOverlay.classList.add('show');
  setTimeout(() => { window.location.href = 'menu.html'; }, 1200);
}

// Affiche le champ "mot secret" uniquement si le rôle professeur est choisi.
function updateSecretVisibility() {
  if (!roleSelect || !secretRow) return;
  const needsSecret = ['professeur', 'technicien', 'administrateur'].includes(roleSelect.value);
  secretRow.hidden = !needsSecret;
  secretRow.style.display = needsSecret ? 'block' : 'none';
  const secretInput = secretRow.querySelector('input');
  if (secretInput) {
    const label = roleSelect.value === 'professeur'
      ? 'Mot de passe professeur (prof)'
      : roleSelect.value === 'technicien'
        ? 'Mot de passe technicien (tech)'
        : 'Mot de passe administrateur (admin)';
    secretInput.placeholder = label;
  }
  if (!needsSecret && secretInput) {
    secretInput.value = '';
  }
}

// Bascule entre bloc login et bloc inscription.
function switchMode(mode) {
  const isLogin = mode === 'login';
  if (loginForm) {
    loginForm.hidden = !isLogin;
    loginForm.style.display = isLogin ? 'grid' : 'none';
  }
  if (registerForm) {
    registerForm.hidden = isLogin;
    registerForm.style.display = isLogin ? 'none' : 'grid';
  }
  if (loginBlock) {
    loginBlock.hidden = !isLogin;
    loginBlock.style.display = isLogin ? 'block' : 'none';
  }
  if (registerBlock) {
    registerBlock.hidden = isLogin;
    registerBlock.style.display = isLogin ? 'none' : 'block';
  }
  updateSecretVisibility();
  if (loginMsg) loginMsg.textContent = '';
  if (registerMsg) registerMsg.textContent = '';
}

if (toggleRegisterBtn) toggleRegisterBtn.addEventListener('click', () => switchMode('register'));
if (backToLoginBtn) backToLoginBtn.addEventListener('click', () => switchMode('login'));
switchMode('login');
initPasswordToggles();

// Soumission du formulaire de connexion.
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const login = loginForm.elements['login'].value.trim();
  const password = loginForm.elements['password'].value;
  if (!login || !password) return;
  loginMsg.textContent = 'Connexion en cours...';
  loginMsg.className = 'message';
  try {
    await apiLogin({ login, password });
    playRippleAndRedirect();
  } catch (err) {
    loginMsg.textContent = err?.message || 'Connexion impossible';
    loginMsg.className = 'message err';
  }
});

if (roleSelect && secretRow) {
  roleSelect.addEventListener('change', updateSecretVisibility);
}

// Soumission du formulaire de création de compte.
if (registerForm) {
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = registerForm.elements['email'].value.trim();
    const login = registerForm.elements['login'].value.trim();
    const password = registerForm.elements['password'].value;
    const confirm = registerForm.elements['confirm'].value;
    const role = registerForm.elements['role'].value;
    const secret = registerForm.elements['secret'].value;
    if (!email || !login || !password || !confirm) return;
    registerMsg.textContent = 'Création du compte...';
    registerMsg.className = 'message';
    try {
      await apiRegister({ email, login, password, confirm, role, secret });
      playRippleAndRedirect();
    } catch (err) {
      registerMsg.textContent = err?.message || 'Création impossible';
      registerMsg.className = 'message err';
    }
  });
}

// Appels API bas niveau.
// Envoie les identifiants au backend et renvoie la réponse JSON.
async function apiLogin(payload) {
  const res = await fetch(`${API.auth}?action=login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  let data = null;
  try {
    data = await res.json();
  } catch (parseErr) {
    throw new Error('Reponse non valide (PHP non lance ?)');
  }
  if (!res.ok) {
    const err = new Error(data?.error || 'Erreur de connexion');
    err.status = res.status;
    throw err;
  }
  return data;
}

// Crée un compte via l’API d’authentification et renvoie la réponse JSON.
async function apiRegister(payload) {
  const res = await fetch(`${API.auth}?action=register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  let data = null;
  try {
    data = await res.json();
  } catch (parseErr) {
    throw new Error('Reponse non valide (PHP non lance ?)');
  }
  if (!res.ok) {
    const err = new Error(data?.error || 'Erreur de creation');
    err.status = res.status;
    throw err;
  }
  return data;
}
