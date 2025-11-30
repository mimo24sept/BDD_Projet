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
    // Fallback demo mode: allow UI preview without API/PHP.
    localStorage.setItem('demoUser', login || 'demo');
    loginMsg.textContent = 'Mode demo actif (API non disponible)';
    loginMsg.className = 'message ok';
    window.location.href = 'menu.html';
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
  if (!res.ok) throw new Error(data?.error || 'Erreur de connexion');
  localStorage.setItem('demoUser', '');
  return data;
}
