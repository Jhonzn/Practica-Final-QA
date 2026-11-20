// OWASP A07:2021 – Identification and Authentication Failures.
// Fuerza bruta contra el login, bloqueo de cuentas e IP, enumeración de usuarios y política
// de contraseñas. Cada prueba empieza limpiando los contadores de bloqueo en MongoDB.
// Límites por defecto de NodeBB (install/data/defaults.json): loginAttempts=5,
// lockoutDuration=60 min, ipLoginAttempts=20 por hora.
const { test, expect, request: pwRequest } = require('@playwright/test');
const h = require('./helpers');

const msg = (body) => (body.match(/\[\[[^\]]+\]\]/) || [body.slice(0, 80)])[0];
let victima;

test.beforeAll(async () => {
  h.resetLockouts();
  const adminCtx = await pwRequest.newContext({ baseURL: h.BASE_URL });
  const csrf = await h.login(adminCtx, h.ADMIN);
  const tag = h.unique();
  victima = await h.createUser(adminCtx, csrf, 'secV', { email: `victima.${tag}@example.org` });
  await adminCtx.dispose();
});

test.afterAll(() => h.resetLockouts());

test('SEC-A07-01: fuerza bruta contra una cuenta (bloqueo tras 5 intentos)', async ({ page }) => {
  h.resetLockouts();
  const ctx = await pwRequest.newContext({ baseURL: h.BASE_URL });
  const filas = [];
  const diccionario = ['123456', 'password', 'qwerty123', 'admin123', 'letmein', 'Sec-Prueba-2025!'];
  for (const [i, pwd] of diccionario.entries()) {
    const r = await h.tryLogin(ctx, victima.username, pwd);
    filas.push({ peticion: `Intento ${i + 1}: POST /login (${victima.username} / ${pwd})`, esperado: i < 5 ? 'Rechazado' : 'Cuenta bloqueada', obtenido: `HTTP ${r.status} ${msg(r.body)}`, ok: i < 5 ? r.status !== 200 : /account-locked/.test(r.body) });
  }
  // Con la contraseña CORRECTA la cuenta sigue bloqueada
  const ok = await h.tryLogin(ctx, victima.username, victima.password);
  filas.push({ peticion: `Intento 7: contraseña correcta`, esperado: 'Cuenta bloqueada (60 min)', obtenido: `HTTP ${ok.status} ${msg(ok.body)}`, ok: /account-locked/.test(ok.body) });

  await h.evidence(page, 'SEC-A07-01', `Fuerza bruta contra ${victima.username}`, filas,
    'Tras 5 intentos fallidos la cuenta se bloquea 60 minutos, incluso para el dueño legítimo. Protege contra fuerza bruta, pero permite a un tercero bloquear cualquier cuenta conocida (por ejemplo "admin", que es pública según SEC-A05-02).');
  // Captura de la interfaz con el mensaje de bloqueo
  await page.goto('/login');
  await page.locator('#username').fill(victima.username);
  await page.locator('#password').fill(victima.password);
  await page.locator('#login').click();
  await page.locator('#login-error-notify').waitFor({ state: 'visible' });
  const mensajeUi = await page.locator('#login-error-notify').innerText();
  await h.screenshotWithUrl(page, 'SEC-A07-01-ui');
  h.record('SEC-A07-01', { filas, mensajeUi });
  await ctx.dispose();
  for (const f of filas) expect(f.ok, f.peticion).toBeTruthy();
});

test('SEC-A07-02: enumeración de usuarios mediante el bloqueo compartido "dummy"', async ({ page }) => {
  h.resetLockouts();
  const ctx = await pwRequest.newContext({ baseURL: h.BASE_URL });
  const filas = [];
  const inexistente = () => `noexiste${h.unique()}`.slice(0, 16);

  // Fase 1: antes del bloqueo, ¿los mensajes son iguales?
  const a = await h.tryLogin(ctx, victima.username, 'Incorrecta-1!');
  const b = await h.tryLogin(ctx, inexistente(), 'Incorrecta-1!');
  filas.push({ peticion: 'Fase 1 · usuario existente + clave errónea', esperado: 'Mensaje genérico', obtenido: `HTTP ${a.status} ${msg(a.body)}`, ok: true });
  filas.push({ peticion: 'Fase 1 · usuario inexistente', esperado: 'El mismo mensaje', obtenido: `HTTP ${b.status} ${msg(b.body)}`, ok: msg(a.body) === msg(b.body) });

  // Fase 2: 5 intentos más con usuarios inexistentes distintos -> se bloquea la clave compartida
  for (let i = 0; i < 5; i += 1) await h.tryLogin(ctx, inexistente(), 'Incorrecta-1!');
  filas.push({ peticion: 'Fase 2 · 5 intentos con usuarios inexistentes distintos', esperado: '—', obtenido: 'Total de 6 intentos sobre la clave "lockout:dummy"', ok: true });

  // Fase 3: después del bloqueo, comparar de nuevo
  const c = await h.tryLogin(ctx, inexistente(), 'Incorrecta-1!');
  const d = await h.tryLogin(ctx, victima.username, 'Incorrecta-1!');
  filas.push({ peticion: 'Fase 3 · usuario inexistente nuevo', esperado: 'Mismo mensaje que un usuario real', obtenido: `HTTP ${c.status} ${msg(c.body)}`, ok: true });
  filas.push({ peticion: 'Fase 3 · usuario existente + clave errónea', esperado: 'Mismo mensaje que un usuario inexistente', obtenido: `HTTP ${d.status} ${msg(d.body)}`, ok: msg(c.body) === msg(d.body) });
  // El login acepta correo (allowLoginWith = username-email): los correos no son públicos
  const e1 = await h.tryLogin(ctx, `nadie.${h.unique()}@example.org`, 'Incorrecta-1!');
  const e2 = await h.tryLogin(ctx, victima.email, 'Incorrecta-1!');
  filas.push({ peticion: 'Fase 3 · correo NO registrado', esperado: 'Mismo mensaje que un correo registrado', obtenido: `HTTP ${e1.status} ${msg(e1.body)}`, ok: true });
  filas.push({ peticion: `Fase 3 · correo registrado (${victima.email})`, esperado: 'Mismo mensaje que un correo no registrado', obtenido: `HTTP ${e2.status} ${msg(e2.body)}`, ok: msg(e1.body) === msg(e2.body) });

  const enumerable = msg(c.body) !== msg(d.body);
  const correoEnumerable = msg(e1.body) !== msg(e2.body);
  await h.evidence(page, 'SEC-A07-02', 'Enumeración de usuarios a través del bloqueo compartido', filas,
    enumerable
      ? `HALLAZGO: después de 6 intentos con usuarios inexistentes, todos los nombres que NO existen responden "account-locked" (comparten la clave lockout:dummy de src/user/auth.js), mientras que los que SÍ existen responden "invalid-login-credentials". La diferencia permite saber si un nombre de usuario${correoEnumerable ? ' o un correo electrónico' : ''} está registrado.`
      : 'Los mensajes son iguales en las dos fases: no se observó enumeración.');
  h.record('SEC-A07-02', { filas, enumerable, correoEnumerable });
  await ctx.dispose();
  // La prueba documenta el comportamiento; el control esperado es que no haya enumeración.
  expect.soft(enumerable, 'Los mensajes deben ser iguales para usuarios existentes e inexistentes').toBeFalsy();
});

test('SEC-A07-03: bloqueo por IP también con credenciales correctas (denegación de servicio)', async ({ page }) => {
  h.resetLockouts();
  const filas = [];
  let primeraIpBloqueada = null;
  for (let i = 1; i <= 21; i += 1) {
    const ctx = await pwRequest.newContext({ baseURL: h.BASE_URL });
    const r = await h.tryLogin(ctx, victima.username, victima.password); // credenciales CORRECTAS
    await ctx.dispose();
    if (/ip-locked/.test(r.body) && !primeraIpBloqueada) primeraIpBloqueada = i;
    if (i <= 2 || i >= 20) filas.push({ peticion: `Login exitoso nº ${i} desde la misma IP`, esperado: 'HTTP 200', obtenido: `HTTP ${r.status} ${r.status === 200 ? 'OK' : msg(r.body)}`, ok: r.status === 200 });
  }
  const ctxAdmin = await pwRequest.newContext({ baseURL: h.BASE_URL });
  const adm = await h.tryLogin(ctxAdmin, h.ADMIN.username, h.ADMIN.password);
  await ctxAdmin.dispose();
  filas.push({ peticion: 'Login del ADMINISTRADOR (otra cuenta, misma IP)', esperado: 'HTTP 200', obtenido: `HTTP ${adm.status} ${adm.status === 200 ? 'OK' : msg(adm.body)}`, ok: adm.status === 200 });

  await h.evidence(page, 'SEC-A07-03', 'Bloqueo de IP tras 20 inicios de sesión (incluso exitosos)', filas,
    `La IP quedó bloqueada en el intento nº ${primeraIpBloqueada}. User.auth.logAttempt (src/user/password.js) cuenta el intento antes de comparar la contraseña y el contador por IP no se reinicia con un login exitoso. Todos los usuarios detrás de la misma IP (NAT de una universidad u oficina) quedan sin acceso durante 1 hora.`);
  await page.goto('/login');
  await page.locator('#username').fill(h.ADMIN.username);
  await page.locator('#password').fill(h.ADMIN.password);
  await page.locator('#login').click();
  await page.locator('#login-error-notify').waitFor({ state: 'visible' });
  await h.screenshotWithUrl(page, 'SEC-A07-03-ui');
  h.record('SEC-A07-03', { filas, primeraIpBloqueada });
  expect.soft(primeraIpBloqueada, 'Logins exitosos no deberían bloquear la IP').toBeNull();
});

test('SEC-A07-04: política de contraseñas (longitud y fortaleza mínimas)', async ({ page }) => {
  h.resetLockouts();
  const adminCtx = await pwRequest.newContext({ baseURL: h.BASE_URL });
  const csrf = await h.login(adminCtx, h.ADMIN);
  const cfg = await (await adminCtx.get('/api/config')).json();
  const candidatas = ['12345', '123456', 'abcdef', 'password', 'qwerty12', 'abc123456', 'medellin1', 'nodebb2026', 'Clave123'];
  const filas = [];
  const aceptadas = [];
  for (const pwd of candidatas) {
    const res = await adminCtx.post('/api/v3/users', {
      data: { username: `pw${h.unique()}`.slice(0, 16), password: pwd },
      headers: { 'x-csrf-token': csrf }, failOnStatusCode: false,
    });
    const body = await res.text();
    if (res.status() === 200) aceptadas.push(pwd);
    filas.push({ peticion: `Crear usuario con contraseña "${pwd}" (${pwd.length} caracteres)`, esperado: 'Rechazada (contraseña débil o común)', obtenido: res.status() === 200 ? 'ACEPTADA' : `Rechazada: ${msg(body)}`, ok: res.status() !== 200 });
  }
  await h.evidence(page, 'SEC-A07-04', 'Política de contraseñas por defecto', filas,
    `Configuración: minimumPasswordLength=${cfg.minimumPasswordLength ?? 6}, minimumPasswordStrength=${cfg.minimumPasswordStrength ?? 1} (zxcvbn, escala 0-4). OWASP ASVS 2.1.1 y NIST SP 800-63B piden al menos 8 caracteres y bloquear contraseñas comunes. Aceptadas: ${aceptadas.join(', ') || 'ninguna'}.`);
  h.record('SEC-A07-04', { filas, aceptadas, minimumPasswordLength: cfg.minimumPasswordLength, minimumPasswordStrength: cfg.minimumPasswordStrength });
  await adminCtx.dispose();
  expect(aceptadas).not.toContain('123456');
  expect.soft(aceptadas, 'Contraseñas débiles aceptadas').toEqual([]);
});

test('SEC-A07-05: la sesión se invalida en el servidor al cerrar sesión', async ({ page }) => {
  h.resetLockouts();
  const ctx = await pwRequest.newContext({ baseURL: h.BASE_URL });
  const csrf = await h.login(ctx, victima);
  const cookies = (await ctx.storageState()).cookies;
  const antes = (await (await ctx.get('/api/config')).json()).uid;
  const out = await ctx.post('/logout', { headers: { 'x-csrf-token': csrf }, failOnStatusCode: false });
  // Se reutiliza la cookie antigua en un contexto nuevo (como haría quien la robó)
  const reuse = await pwRequest.newContext({ baseURL: h.BASE_URL, storageState: { cookies, origins: [] } });
  const despues = (await (await reuse.get('/api/config')).json()).uid;
  const filas = [
    { peticion: 'GET /api/config con la sesión activa', esperado: `uid ${victima.uid}`, obtenido: `uid ${antes}`, ok: antes === victima.uid },
    { peticion: 'POST /logout', esperado: 'HTTP 200', obtenido: `HTTP ${out.status()}`, ok: out.status() === 200 },
    { peticion: 'GET /api/config reutilizando la cookie anterior', esperado: 'uid 0 (sesión destruida)', obtenido: `uid ${despues}`, ok: !(despues > 0) },
  ];
  await h.evidence(page, 'SEC-A07-05', 'Invalidación de la sesión al cerrar sesión', filas);
  h.record('SEC-A07-05', { filas });
  await ctx.dispose(); await reuse.dispose();
  for (const f of filas) expect(f.ok, f.peticion).toBeTruthy();
});
