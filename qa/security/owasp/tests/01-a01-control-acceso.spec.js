// OWASP A01:2021 – Broken Access Control.
// Un usuario autenticado SIN rol de administrador intenta usar funciones de administración,
// modificar recursos de otro usuario (IDOR) y enviar peticiones sin token CSRF.
const { test, expect, request: pwRequest } = require('@playwright/test');
const h = require('./helpers');

let adminCtx; let adminCsrf; let userA; let userB; let ctxA; let csrfA; let ctxB; let csrfB; let cid;

test.beforeAll(async () => {
  adminCtx = await pwRequest.newContext({ baseURL: h.BASE_URL });
  adminCsrf = await h.login(adminCtx, h.ADMIN);
  userA = await h.createUser(adminCtx, adminCsrf, 'secA');
  userB = await h.createUser(adminCtx, adminCsrf, 'secB');
  ctxA = await pwRequest.newContext({ baseURL: h.BASE_URL });
  csrfA = await h.login(ctxA, userA);
  ctxB = await pwRequest.newContext({ baseURL: h.BASE_URL });
  csrfB = await h.login(ctxB, userB);
  cid = (await (await ctxA.get('/api/categories')).json()).categories[0].cid;
});

test.afterAll(async () => {
  for (const c of [adminCtx, ctxA, ctxB]) await c?.dispose();
});

test('SEC-A01-01: usuario normal abre /admin en el navegador', async ({ page, context }) => {
  // Se reutiliza la cookie de sesión del usuario B en el navegador
  await context.addCookies((await ctxB.storageState()).cookies);
  const res = await page.goto('/admin');
  await page.waitForLoadState('networkidle');
  const status = res.status();
  const url = page.url();
  const enAcp = await page.locator('#acp-search, .acp-sidebar, [component="acp/navbar"]').count();
  await h.screenshotWithUrl(page, 'SEC-A01-01');
  h.record('SEC-A01-01', { usuario: userB.username, status, urlFinal: url, elementosAcp: enAcp });
  expect(enAcp, 'El panel de administración no debe mostrarse a un usuario normal').toBe(0);
  expect(status === 403 || !new URL(url).pathname.startsWith('/admin')).toBeTruthy();
});

test('SEC-A01-02: usuario normal usa la API de administración', async ({ page }) => {
  const intentos = [
    ['GET', '/api/admin/settings/general', null],
    ['GET', '/api/admin/manage/users', null],
    ['PUT', '/api/v3/admin/settings/postQueue', { value: 1 }],
    ['POST', '/api/v3/users', { username: `intruso${h.unique()}`.slice(0, 16), password: 'Intruso-2026!' }],
    ['PUT', `/api/v3/groups/administrators/membership/${userB.uid}`, null],
    ['GET', '/api/v3/admin/analytics', null],
  ];
  const filas = [];
  for (const [m, url, data] of intentos) {
    const res = await ctxB.fetch(url, { method: m, data: data || undefined, headers: { 'x-csrf-token': csrfB }, failOnStatusCode: false });
    const st = res.status();
    filas.push({ peticion: `${m} ${url}`, esperado: '401/403, sin efecto', obtenido: `HTTP ${st} ${(await res.text()).slice(0, 120)}`, ok: st === 401 || st === 403 });
  }
  // Verificación cruzada: B no quedó en el grupo de administradores
  const grupo = await (await adminCtx.get('/api/groups/administrators')).json();
  const miembros = (grupo.group?.members || []).map(m => m.uid);
  const esAdmin = miembros.includes(userB.uid);
  filas.push({ peticion: `Verificación: miembros del grupo administrators`, esperado: `No incluye uid ${userB.uid}`, obtenido: `uids: ${miembros.join(', ')}`, ok: !esAdmin });
  await h.evidence(page, 'SEC-A01-02', 'Usuario sin rol de administrador contra la API de administración', filas,
    `Usuario de prueba: ${userB.username} (uid ${userB.uid}, sin privilegios). Las respuestas 401 de membership provienen del middleware de re-autenticación, que también bloquea la acción.`);
  h.record('SEC-A01-02', { filas });
  for (const f of filas) expect(f.ok, f.peticion).toBeTruthy();
});

test('SEC-A01-03: IDOR – usuario B modifica recursos del usuario A', async ({ page }) => {
  const contenidoOriginal = 'Contenido original del usuario A para la prueba IDOR.';
  const t = await ctxA.post('/api/v3/topics', {
    data: { cid, title: `IDOR ${h.unique()}`, content: contenidoOriginal },
    headers: { 'x-csrf-token': csrfA },
  });
  expect(t.status(), await t.text()).toBe(200);
  const { pid, tid } = (await t.json()).response.mainPost;

  const intentos = [
    ['PUT', `/api/v3/posts/${pid}`, { content: 'Editado por el usuario B (IDOR)' }],
    ['DELETE', `/api/v3/posts/${pid}`, null],
    ['DELETE', `/api/v3/topics/${tid}`, null],
    ['PUT', `/api/v3/users/${userA.uid}`, { fullname: 'Cambiado por B' }],
    ['PUT', `/api/v3/users/${userA.uid}/password`, { currentPassword: 'x', newPassword: 'Tomado-por-B-2026!' }],
  ];
  const filas = [];
  for (const [m, url, data] of intentos) {
    const res = await ctxB.fetch(url, { method: m, data: data || undefined, headers: { 'x-csrf-token': csrfB }, failOnStatusCode: false });
    const st = res.status();
    filas.push({ peticion: `${m} ${url}`, esperado: '403 (no es el dueño)', obtenido: `HTTP ${st} ${(await res.text()).slice(0, 110)}`, ok: st === 401 || st === 403 });
  }
  const post = (await (await ctxA.get(`/api/v3/posts/${pid}`)).json()).response;
  const perfil = (await (await ctxA.get(`/api/v3/users/${userA.uid}`)).json()).response;
  filas.push({ peticion: `Verificación: contenido del post ${pid}`, esperado: 'Sin cambios', obtenido: post.content.slice(0, 80), ok: post.content.includes('Contenido original') });
  filas.push({ peticion: `Verificación: fullname de ${userA.username}`, esperado: 'Sin cambios (vacío)', obtenido: perfil.fullname || '(vacío)', ok: perfil.fullname !== 'Cambiado por B' });
  await h.evidence(page, 'SEC-A01-03', 'IDOR: el usuario B intenta editar/borrar recursos del usuario A', filas,
    `Dueño: ${userA.username} (uid ${userA.uid}); atacante: ${userB.username} (uid ${userB.uid}); tema ${tid}, post ${pid}.`);
  h.record('SEC-A01-03', { filas, pid, tid });
  for (const f of filas) expect(f.ok, f.peticion).toBeTruthy();
});

test('SEC-A01-04: petición de escritura sin token CSRF (sesión válida)', async ({ page }) => {
  const filas = [];
  for (const [desc, headers] of [['sin cabecera x-csrf-token', {}], ['con token inválido', { 'x-csrf-token': 'token-falso-123' }]]) {
    const res = await ctxB.post('/api/v3/topics', {
      data: { cid, title: `CSRF ${h.unique()}`, content: 'Tema creado sin token CSRF válido' },
      headers, failOnStatusCode: false,
    });
    const st = res.status();
    filas.push({ peticion: `POST /api/v3/topics (${desc})`, esperado: '403 invalid-csrf-token', obtenido: `HTTP ${st} ${(await res.text()).slice(0, 110)}`, ok: st === 403 });
  }
  await h.evidence(page, 'SEC-A01-04', 'Protección CSRF en la API de escritura', filas,
    'La cookie de sesión del usuario es válida; solo falta el token anti-CSRF. La cookie usa SameSite=Lax.');
  h.record('SEC-A01-04', { filas });
  for (const f of filas) expect(f.ok, f.peticion).toBeTruthy();
});
