import { connectProjectLibrary } from './project-library.js';

if (location.hostname === 'folio-app.de' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistration('/').then(registration => {
    if (registration?.active?.scriptURL === location.origin + '/sw.js') return registration.update();
  }).catch(() => {});
}

const endpoint = 'https://irroinhpcoafwxwlnnbd.supabase.co/functions/v1/folio-office';
const tokenStorage = 'folio-office-session-v1';
const form = document.getElementById('access');
const notice = document.getElementById('notice');
const accessTitle = document.getElementById('access-title');
const passwordHint = document.getElementById('password-hint');
const emailLabel = document.getElementById('email-label');
const codeLabel = document.getElementById('code-label');
const codeTitle = document.getElementById('code-title');
const codeHint = document.getElementById('code-hint');
const toggleCode = document.getElementById('toggle-code');
const switchLink = document.getElementById('switch');
const submit = form.querySelector('button');
const modeForHash = () => ({ '#einrichten': 'setup', '#wiederherstellen': 'recover' })[location.hash] || 'login';
let token = '';
try { token = sessionStorage.getItem(tokenStorage) || ''; } catch {}

function showNotice(message) {
  notice.textContent = message;
  notice.hidden = !message;
}
function visibilityToggle(button, field, name) {
  function setVisible(visible) {
    field.type = visible ? 'text' : 'password';
    button.setAttribute('aria-pressed', String(visible));
    const label = name + (visible ? ' ausblenden' : ' anzeigen');
    button.setAttribute('aria-label', label);
    button.title = label;
  }
  button.addEventListener('click', () => setVisible(field.type === 'password'));
  return setVisible;
}
const setCodeVisible = visibilityToggle(toggleCode, form.elements.code, 'Code');
const setPasswordVisible = visibilityToggle(
  document.getElementById('toggle-password'), form.elements.password, 'Kennwort',
);
function showForm() {
  const mode = modeForHash();
  accessTitle.hidden = mode === 'login';
  accessTitle.textContent = mode === 'setup' ? 'Konto einrichten' : 'Kennwort zurücksetzen';
  passwordHint.hidden = mode === 'login';
  setPasswordVisible(false);
  emailLabel.hidden = mode === 'recover';
  form.elements.email.disabled = emailLabel.hidden;
  codeLabel.hidden = mode === 'login';
  form.elements.code.disabled = codeLabel.hidden;
  form.elements.code.required = !codeLabel.hidden;
  codeTitle.textContent = mode === 'setup' ? 'Einrichtungscode' : 'Wiederherstellungscode';
  codeHint.textContent = mode === 'setup' ? 'Die acht Ziffern aus Einrichtungscode.txt.' : 'Der Code aus deinem Passwortmanager.';
  form.elements.code.value = '';
  setCodeVisible(false);
  form.elements.password.autocomplete = mode === 'login' ? 'current-password' : 'new-password';
  form.elements.password.minLength = mode === 'login' ? 1 : 8;
  submit.textContent = mode === 'login' ? 'Login' : 'Kennwort speichern';
  switchLink.href = mode === 'login' ? '#wiederherstellen' : '#login';
  switchLink.textContent = mode === 'login' ? 'Kennwort vergessen?' : 'Zum Login';
  showNotice('');
}
async function request(action, fields, session = '') {
  const headers = new Headers();
  if (session) headers.set('Authorization', 'Bearer ' + session);
  let options = { cache: 'no-store', headers, signal: AbortSignal.timeout(20000) };
  if (fields) {
    headers.set('Content-Type', 'application/json');
    options = { ...options, method: 'POST', body: JSON.stringify(fields) };
  }
  const response = await fetch(endpoint + '/' + action, options);
  if (response.status === 204) return null;
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.message || 'Folio Office ist gerade nicht erreichbar.'), { status: response.status });
  return result;
}
function forgetSession() {
  try { sessionStorage.removeItem(tokenStorage); } catch {}
}
async function openOffice(session) {
  const [bundle, library] = await Promise.all([
    request('office', null, session), request('project-library', null, session),
  ]);
  window.FOLIO_PROJECT_LIBRARY = connectProjectLibrary(library, request, session);
  const page = new DOMParser().parseFromString(bundle.html, 'text/html');
  const urls = [];
  for (const element of page.querySelectorAll('script[src], link[rel="stylesheet"]')) {
    const attribute = element.tagName === 'SCRIPT' ? 'src' : 'href';
    const path = element.getAttribute(attribute).split('?')[0];
    if (path.startsWith('https://')) continue;
    const file = bundle.files[path];
    if (typeof file !== 'string') throw new Error('Folio Office ist unvollständig.');
    const type = attribute === 'src' ? 'text/javascript' : 'text/css';
    const url = URL.createObjectURL(new Blob([file], { type }));
    urls.push(url);
    element.setAttribute(attribute, url);
  }
  try { sessionStorage.setItem(tokenStorage, session); } catch {}
  history.replaceState(null, '', location.pathname + location.search);
  document.open();
  document.write('<!doctype html>' + page.documentElement.outerHTML);
  document.close();
  document.addEventListener('submit', async event => {
    if (!event.target.hasAttribute('data-folio-logout')) return;
    event.preventDefault();
    const button = event.target.querySelector('button');
    button.disabled = true;
    try {
      await request('logout', {}, session);
      forgetSession();
      location.reload();
    } catch {
      button.textContent = 'Abmelden erneut versuchen';
      button.disabled = false;
    }
  });
  window.addEventListener('pagehide', () => urls.forEach(url => URL.revokeObjectURL(url)), { once: true });
}
window.addEventListener('hashchange', showForm);
showForm();
form.addEventListener('submit', async event => {
  event.preventDefault();
  const fields = Object.fromEntries(new FormData(form));
  const action = modeForHash();
  submit.disabled = true;
  showNotice('');
  try {
    const result = await request(action, fields);
    form.reset();
    if (result.recovery) {
      form.hidden = switchLink.hidden = true;
      document.getElementById('recovery').hidden = false;
      document.getElementById('recovery-code').value = result.recovery;
      document.getElementById('continue').onclick = async event => {
        const button = event.currentTarget;
        button.disabled = true;
        try { await openOffice(result.token); }
        catch (error) { showNotice(error.message); button.disabled = false; }
      };
    } else {
      await openOffice(result.token);
    }
  } catch (error) {
    showNotice(error.message);
  } finally {
    submit.disabled = false;
  }
});
if (token && modeForHash() === 'login') {
  submit.disabled = true;
  openOffice(token).catch(error => {
    if (error.status === 401) forgetSession();
    else showNotice(error.message);
    submit.disabled = false;
  });
}
