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
const rippleOverlay = document.querySelector('#ripple-overlay');
const rippleCircles = rippleOverlay ? rippleOverlay.querySelectorAll('.ripple-circle') : [];

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
  if (!rippleOverlay || !rippleCircles.length) {
    window.location.href = 'menu.html';
    return;
  }
  rippleOverlay.classList.add('show');
  rippleCircles.forEach((circle, idx) => {
    circle.style.animation = `ripplePulse 1s ease-out ${idx * 0.12}s forwards`;
  });
  setTimeout(() => { window.location.href = 'menu.html'; }, 850);
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
