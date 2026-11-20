// Utilidades compartidas por las pruebas de seguridad (OWASP Top 10 2021).
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const BASE_URL = process.env.BASE_URL || 'http://localhost:4567';
const ADMIN = {
  username: process.env.NODEBB_ADMIN_USER || 'admin',
  password: process.env.NODEBB_ADMIN_PASSWORD || 'QaAdmin#2026x',
};
const EVIDENCIAS = path.resolve(__dirname, '..', '..', 'evidencias');
const COMPOSE_DIR = path.resolve(__dirname, '..', '..');

function unique() {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1e3)}`;
}

async function csrfToken(request) {
  const res = await request.get('/api/config');
  return (await res.json()).csrf_token;
}

/** Login por HTTP. Devuelve { status, body, csrf } sin lanzar error, para poder probar fallos. */
async function tryLogin(request, username, password) {
  const token = await csrfToken(request);
  const res = await request.post('/login', {
    form: { username, password },
    headers: { 'x-csrf-token': token },
    failOnStatusCode: false,
  });
  const body = await res.text();
  return { status: res.status(), body, csrf: res.status() === 200 ? await csrfToken(request) : null };
}

async function login(request, user) {
  const r = await tryLogin(request, user.username, user.password);
  if (r.status !== 200) throw new Error(`Login fallido para ${user.username}: HTTP ${r.status} ${r.body}`);
  return r.csrf;
}

/** Crea un usuario normal (sin privilegios) desde la API de administración. */
async function createUser(adminRequest, adminCsrf, prefix = 'sec', { email } = {}) {
  const user = { username: `${prefix}${unique()}`.slice(0, 16), password: 'Sec-Prueba-2026!' };
  const data = email ? { ...user, email } : user;
  const res = await adminRequest.post('/api/v3/users', { data, headers: { 'x-csrf-token': adminCsrf } });
  if (res.status() !== 200) throw new Error(`No se pudo crear ${user.username}: ${res.status()} ${await res.text()}`);
  user.uid = (await res.json()).response.uid;
  user.userslug = user.username.toLowerCase();
  if (email) {
    // El administrador asigna y confirma el correo (sin servidor SMTP en el ambiente de pruebas)
    const r2 = await adminRequest.post(`/api/v3/users/${user.uid}/emails/${encodeURIComponent(email)}/confirm`, { headers: { 'x-csrf-token': adminCsrf } });
    if (r2.status() !== 200) throw new Error(`No se pudo confirmar ${email}: ${r2.status()} ${await r2.text()}`);
    user.email = email;
  }
  return user;
}

/** Cambia un ajuste de NodeBB como administrador (solo ambiente de pruebas). */
async function setSetting(adminRequest, adminCsrf, setting, value) {
  const res = await adminRequest.put(`/api/v3/admin/settings/${setting}`, {
    data: { value },
    headers: { 'x-csrf-token': adminCsrf },
  });
  if (res.status() !== 200) throw new Error(`No se pudo cambiar ${setting}: ${res.status()} ${await res.text()}`);
}

/**
 * Borra los contadores de intentos de login y los bloqueos (de usuario y de IP) en MongoDB.
 * Se usa para que cada prueba de A07 empiece desde cero. Solo en el ambiente de pruebas.
 */
function resetLockouts() {
  execFileSync('docker', [
    'compose', 'exec', '-T', 'mongo', 'mongosh', '--quiet', '-u', 'nodebb', '-p', 'nodebb',
    '--authenticationDatabase', 'admin', 'nodebb', '--eval',
    'db.objects.deleteMany({_key: /^(lockout:|loginAttempts:)/}).deletedCount',
  ], { cwd: COMPOSE_DIR, stdio: 'pipe' });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * Genera una captura de evidencia para pruebas a nivel HTTP: una página con la fecha,
 * la URL objetivo y la tabla de peticiones/respuestas observadas.
 * filas: [{ peticion, esperado, obtenido, ok }]
 */
async function evidence(page, id, titulo, filas, notas = '') {
  const fecha = new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' });
  const html = `<!doctype html><meta charset="utf-8"><style>
    body{font-family:Segoe UI,Arial,sans-serif;margin:24px;color:#1b1b1b}
    h1{font-size:20px;margin:0 0 4px} .meta{color:#555;font-size:13px;margin-bottom:14px}
    table{border-collapse:collapse;width:100%;font-size:13px} th,td{border:1px solid #bbb;padding:6px 8px;text-align:left;vertical-align:top}
    th{background:#eef1f5} td.ok{color:#0a6b2e;font-weight:600} td.ko{color:#b00020;font-weight:600}
    code,pre{font-family:Consolas,monospace;font-size:12px;white-space:pre-wrap;word-break:break-all;margin:0}
    .notas{margin-top:12px;font-size:13px;background:#fff8e1;border:1px solid #f0d58a;padding:8px}
  </style>
  <h1>${escapeHtml(id)} — ${escapeHtml(titulo)}</h1>
  <div class="meta">Objetivo: <b>${escapeHtml(BASE_URL)}</b> (NodeBB 4.16.7 en Docker) · Fecha de ejecución: <b>${escapeHtml(fecha)}</b></div>
  <table><tr><th>Petición</th><th>Esperado (seguro)</th><th>Obtenido</th><th>Resultado</th></tr>
  ${filas.map(f => `<tr><td><code>${escapeHtml(f.peticion)}</code></td><td>${escapeHtml(f.esperado)}</td><td><pre>${escapeHtml(f.obtenido)}</pre></td><td class="${f.ok ? 'ok' : 'ko'}">${f.ok ? 'Seguro' : 'Hallazgo'}</td></tr>`).join('')}
  </table>${notas ? `<div class="notas">${escapeHtml(notas)}</div>` : ''}`;
  await page.setContent(html);
  fs.mkdirSync(EVIDENCIAS, { recursive: true });
  await page.screenshot({ path: path.join(EVIDENCIAS, `${id}.png`), fullPage: true });
}

/** Captura de una página real de NodeBB, con la URL y la fecha superpuestas. */
async function screenshotWithUrl(page, id) {
  const fecha = new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' });
  await page.evaluate(([url, f]) => {
    // Oculta avisos flotantes (p. ej. "Your account does not have an email set") que tapan la página
    document.querySelectorAll('#alert_window, .alert-window, [component="toaster/toast"]').forEach(e => { e.style.display = 'none'; });
    const d = document.createElement('div');
    d.id = 'qa-evidencia-banner';
    d.textContent = `URL: ${url}   ·   ${f}`;
    d.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#111;color:#ffeb3b;font:13px Consolas,monospace;padding:4px 8px';
    document.body.appendChild(d);
  }, [page.url(), fecha]);
  fs.mkdirSync(EVIDENCIAS, { recursive: true });
  await page.screenshot({ path: path.join(EVIDENCIAS, `${id}.png`), fullPage: false });
}

/** Guarda un resultado en reportes/owasp/resultados-detalle.json para el informe. */
function record(id, data) {
  const file = path.resolve(__dirname, '..', '..', 'reportes', 'owasp', 'resultados-detalle.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const all = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  all[id] = { ...data, fecha: new Date().toISOString() };
  fs.writeFileSync(file, JSON.stringify(all, null, 2));
}

module.exports = {
  BASE_URL, ADMIN, unique, csrfToken, tryLogin, login, createUser, setSetting,
  resetLockouts, evidence, screenshotWithUrl, record,
};
