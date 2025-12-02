// Login-only script used on index.html. Redirects to menu.html after auth.

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

function updateSecretVisibility() {
  if (!roleSelect || !secretRow) return;
  const wantsProf = roleSelect.value === 'professeur';
  secretRow.hidden = !wantsProf;
  secretRow.style.display = wantsProf ? 'block' : 'none';
  if (!wantsProf && secretRow.querySelector('input')) {
    secretRow.querySelector('input').value = '';
  }
}

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

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const login = loginForm.elements['login'].value.trim();
  const password = loginForm.elements['password'].value;
  if (!login || !password) return;
  loginMsg.textContent = 'Connexion en cours...';
  loginMsg.className = 'message';
  try {
    await apiLogin({ login, password });
    window.location.href = 'menu.html';
  } catch (err) {
    loginMsg.textContent = err?.message || 'Connexion impossible';
    loginMsg.className = 'message err';
  }
});

if (roleSelect && secretRow) {
  roleSelect.addEventListener('change', updateSecretVisibility);
}

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
      window.location.href = 'menu.html';
    } catch (err) {
      registerMsg.textContent = err?.message || 'Création impossible';
      registerMsg.className = 'message err';
    }
  });
}

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
