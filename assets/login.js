// Login-only script used on index.html. Redirects to menu.html after auth.

const API = { auth: './api/auth.php' };

const loginForm = document.querySelector('#login-form');
const loginMsg = document.querySelector('#login-msg');

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
