/*
  Fichier: assets/login.js.
  Toute la logique login/inscription est regroupee ici pour garder un point unique de maintenance cote front.
  On gere les bascules de formulaires et la visibilite du mot de passe pour limiter les erreurs de saisie.
  On declenche une animation ripple avant redirection pour donner un feedback de succes.
  Centraliser les appels auth simplifie les evolutions d'API.
*/
// Ce fichier orchestre l'auth front et la transition visuelle vers le menu.
// Centraliser l'URL d'auth evite les doublons dans les appels.
function getBasePath() {
  let path = window.location.pathname || '/';
  if (path.length > 1 && path.endsWith('/')) {
    path = path.replace(/\/+$/, '');
  }
  if (path.endsWith('.html')) {
    return path.slice(0, path.lastIndexOf('/') + 1);
  }
  if (path.endsWith('/')) return path;
  return `${path}/`;
}

const BASE_PATH = getBasePath();
const API = { auth: `${BASE_PATH}api/auth.php` };
const appUrl = (target) => `${BASE_PATH}${target}`;

function buildQueryWithFlag() {
  const params = new URLSearchParams(window.location.search || '');
  const flag = params.get('i');
  if (!flag) params.set('i', '1');
  const query = params.toString();
  return query ? `?${query}` : '';
}

// On met en cache les noeuds DOM pour eviter des querySelector repetes.
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
// On garde un flag pour ne brancher qu'un seul listener resize.
let authLoaderResizeBound = false;
/**
 * Ajuster le texte GEII pour remplir la barre donne un loader lisible.
 * On mesure les lettres pour s'adapter aux polices chargees.
 * On respecte le gap CSS pour garder la mise en page coherente.
 * On sort si les elements manquent pour eviter des erreurs JS.
 */

function fitLoaderLabel(loader) {
  const label = loader.querySelector('.loader-label');
  const track = loader.querySelector('.loader-track');
  // Si l'overlay est incomplet, on ne force pas le recalcul.
  if (!label || !track) return;
  const gapValue = getComputedStyle(label).getPropertyValue('--letter-gap');
  const gap = Number.parseFloat(gapValue) || 5;
  const letters = Array.from(label.querySelectorAll('.label-base span'));
  // Sans lettres, on n'a rien a mesurer.
  if (!letters.length) return;
  const baseSize = 120;
  // On part d'une taille "safe" avant de mesurer.
  label.style.fontSize = `${baseSize}px`;
  const lettersWidth = letters.reduce((sum, span) => sum + span.getBoundingClientRect().width, 0);
  const targetWidth = track.getBoundingClientRect().width - gap * (letters.length - 1);
  // Si les mesures sont invalides, on ne force pas une taille aberrante.
  if (lettersWidth <= 0 || targetWidth <= 0) return;
  label.style.fontSize = `${baseSize * (targetWidth / lettersWidth)}px`;
}
/**
 * On cree le loader seulement si besoin pour garder le DOM leger.
 * Injection a la volee pour eviter un loader visible hors transition.
 * On attend les polices pour eviter des mesures fausses.
 * Un seul listener resize pour ne pas empiler les callbacks.
 */

function ensureAuthLoader() {
  // Si l'overlay n'existe pas sur la page, on sort proprement.
  if (!rippleOverlay) return;
  // Ne pas recreer le loader s'il est deja present.
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
    // Recalculer apres chargement des polices pour la bonne largeur.
    document.fonts.ready.then(() => fitLoaderLabel(loader));
  }
  if (!authLoaderResizeBound) {
    authLoaderResizeBound = true;
    window.addEventListener('resize', () => {
      const activeLoader = rippleOverlay.querySelector('.auth-loader');
      // Recalculer seulement si le loader est visible.
      if (activeLoader) fitLoaderLabel(activeLoader);
    });
  }
}

// L'oeil permet de verifier la saisie sans sacrifier la securite par defaut.
function initPasswordToggles() {
  document.querySelectorAll('.password-field').forEach((wrapper) => {
    const input = wrapper.querySelector('input');
    const toggle = wrapper.querySelector('.password-toggle');
    // Certains blocs peuvent etre absents selon la page.
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

// Une transition visuelle donne un feedback de succes avant la navigation.
function playRippleAndRedirect() {
  const suffix = `${buildQueryWithFlag()}${window.location.hash || ''}`;
  const targetUrl = `${appUrl('menu.html')}${suffix}`;
  // Fallback direct si l'overlay n'existe pas.
  if (!rippleOverlay) {
    window.location.href = targetUrl;
    return;
  }
  // Eviter de relancer la transition plusieurs fois.
  if (document.body.classList.contains('auth-transition')) return;
  document.body.classList.add('auth-transition');
  // Declencher l'animation de sortie du mur d'auth.
  if (authWall) authWall.classList.add('is-exiting');
  ensureAuthLoader();
  rippleOverlay.classList.add('show');
  // Delai court pour laisser le ripple finir avant la redirection.
  setTimeout(() => { window.location.href = targetUrl; }, 1200);
}

// Le mot secret n'est demande que pour les roles sensibles.
function updateSecretVisibility() {
  // Eviter une erreur si la page ne contient pas le select.
  if (!roleSelect || !secretRow) return;
  const needsSecret = ['professeur', 'technicien', 'administrateur'].includes(roleSelect.value);
  secretRow.hidden = !needsSecret;
  secretRow.style.display = needsSecret ? 'block' : 'none';
  const secretInput = secretRow.querySelector('input');
  if (secretInput) {
    // Placeholder explicite pour limiter les confusions de role.
    const label = roleSelect.value === 'professeur'
      ? 'Mot de passe professeur (prof)'
      : roleSelect.value === 'technicien'
        ? 'Mot de passe technicien (tech)'
        : 'Mot de passe administrateur (admin)';
    secretInput.placeholder = label;
  }
  if (!needsSecret && secretInput) {
    // On efface pour ne pas envoyer un secret inutile.
    secretInput.value = '';
  }
}

// On conserve les deux formulaires mais on en affiche un seul a la fois.
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
  // On nettoie les messages pour ne pas melanger les etats.
  if (loginMsg) loginMsg.textContent = '';
  if (registerMsg) registerMsg.textContent = '';
}

// Boutons explicites pour changer de mode sans navigation.
if (toggleRegisterBtn) toggleRegisterBtn.addEventListener('click', () => switchMode('register'));
if (backToLoginBtn) backToLoginBtn.addEventListener('click', () => switchMode('login'));
// Mode par defaut au chargement pour simplifier l'acces.
switchMode('login');
// Activer la logique des boutons oeil au demarrage.
initPasswordToggles();

// On intercepte la soumission pour rester en SPA et afficher un message.
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const login = loginForm.elements['login'].value.trim();
  const password = loginForm.elements['password'].value;
  // Validation minimale cote front pour eviter un appel vide.
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
  // Maj immediate du champ secret au changement de role.
  roleSelect.addEventListener('change', updateSecretVisibility);
}

// On gere la creation de compte sans recharger la page.
if (registerForm) {
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = registerForm.elements['email'].value.trim();
    const login = registerForm.elements['login'].value.trim();
    const password = registerForm.elements['password'].value;
    const confirm = registerForm.elements['confirm'].value;
    const role = registerForm.elements['role'].value;
    const secret = registerForm.elements['secret'].value;
    // Validation minimale pour eviter les erreurs triviales.
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

// Isoler les appels API facilite les tests et la maintenance.
// Credentials=include pour recuperer la session PHP.
async function apiLogin(payload) {
  const res = await fetch(`${API.auth}?action=login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  let data = null;
  try {
    // On tente un JSON pour afficher les erreurs du backend.
    data = await res.json();
  } catch (parseErr) {
    // Message clair si le serveur ne repond pas en JSON.
    throw new Error('Reponse non valide (PHP non lance ?)');
  }
  if (!res.ok) {
    // On remonte le message serveur pour guider l'utilisateur.
    const err = new Error(data?.error || 'Erreur de connexion');
    err.status = res.status;
    throw err;
  }
  return data;
}

// Meme pattern que login pour uniformiser les erreurs.
async function apiRegister(payload) {
  const res = await fetch(`${API.auth}?action=register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  let data = null;
  try {
    // On tente un JSON pour lire l'erreur renvoyee par PHP.
    data = await res.json();
  } catch (parseErr) {
    // Message explicite si le backend ne repond pas correctement.
    throw new Error('Reponse non valide (PHP non lance ?)');
  }
  if (!res.ok) {
    // Priorite au message serveur si dispo.
    const err = new Error(data?.error || 'Erreur de creation');
    err.status = res.status;
    throw err;
  }
  return data;
}
