// OWASP A05:2021 – Security Misconfiguration (cabeceras HTTP, cookies y exposición de información).
const { test, expect, request: pwRequest } = require('@playwright/test');
const h = require('./helpers');

test('SEC-A05-01: cabeceras de seguridad y atributos de la cookie de sesión', async ({ page }) => {
  const anon = await pwRequest.newContext({ baseURL: h.BASE_URL });
  const res = await anon.get('/');
  const hd = res.headers();
  const cookie = res.headersArray().filter(x => x.name.toLowerCase() === 'set-cookie').map(x => x.value).join(' | ');
  const csp = hd['content-security-policy'] || '';
  const v = (k) => hd[k] ?? '(ausente)';

  const filas = [
    { peticion: 'X-Frame-Options', esperado: 'DENY o SAMEORIGIN', obtenido: v('x-frame-options'), ok: /deny|sameorigin/i.test(hd['x-frame-options'] || '') },
    { peticion: 'X-Content-Type-Options', esperado: 'nosniff', obtenido: v('x-content-type-options'), ok: hd['x-content-type-options'] === 'nosniff' },
    { peticion: 'Referrer-Policy', esperado: 'strict-origin-when-cross-origin o más estricta', obtenido: v('referrer-policy'), ok: !!hd['referrer-policy'] },
    { peticion: 'Strict-Transport-Security', esperado: 'max-age >= 15552000 (efectiva solo en HTTPS)', obtenido: v('strict-transport-security'), ok: /max-age=\d{8,}/.test(hd['strict-transport-security'] || '') },
    { peticion: 'Content-Security-Policy', esperado: "Política con default-src/script-src (no solo frame-ancestors)", obtenido: v('content-security-policy'), ok: /script-src|default-src/.test(csp) },
    { peticion: 'Permissions-Policy', esperado: 'Definida (cámara, micrófono, geolocalización…)', obtenido: v('permissions-policy'), ok: !!hd['permissions-policy'] },
    { peticion: 'X-Powered-By', esperado: 'Ausente (no revelar la tecnología)', obtenido: v('x-powered-by'), ok: !hd['x-powered-by'] },
    { peticion: 'Cross-Origin-Opener-Policy', esperado: 'same-origin', obtenido: v('cross-origin-opener-policy'), ok: !!hd['cross-origin-opener-policy'] },
    { peticion: 'Cookie express.sid: HttpOnly', esperado: 'Presente', obtenido: cookie.slice(0, 160), ok: /httponly/i.test(cookie) },
    { peticion: 'Cookie express.sid: SameSite', esperado: 'Lax o Strict', obtenido: (cookie.match(/samesite=\w+/i) || ['(ausente)'])[0], ok: /samesite=(lax|strict)/i.test(cookie) },
    { peticion: 'Cookie express.sid: Secure', esperado: 'Presente (requiere HTTPS)', obtenido: /;\s*secure/i.test(cookie) ? 'Secure' : '(ausente: el ambiente usa HTTP)', ok: /;\s*secure/i.test(cookie) },
  ];
  await h.evidence(page, 'SEC-A05-01', 'Cabeceras de seguridad de GET /', filas,
    'Las filas marcadas como "Hallazgo" se analizan en la sección 10.4. La ausencia de Secure se debe a que el ambiente de pruebas usa HTTP; NodeBB la activa automáticamente cuando la URL configurada es https.');
  h.record('SEC-A05-01', { headers: hd, cookie, filas });
  await anon.dispose();
  // Controles básicos que deben estar presentes
  expect(hd['x-frame-options']).toBeTruthy();
  expect(hd['x-content-type-options']).toBe('nosniff');
  expect(cookie).toMatch(/httponly/i);
});

test('SEC-A05-02: exposición de información a visitantes sin sesión', async ({ page }) => {
  const anon = await pwRequest.newContext({ baseURL: h.BASE_URL });
  const filas = [];
  const usuarios = await anon.get('/api/users');
  const lista = usuarios.status() === 200 ? (await usuarios.json()).users.map(u => u.username) : [];
  filas.push({ peticion: 'GET /api/users (sin sesión)', esperado: 'Requiere sesión o lista limitada', obtenido: `HTTP ${usuarios.status()} · ${lista.length} usuarios: ${lista.slice(0, 6).join(', ')}`, ok: usuarios.status() !== 200 });

  const perfil = await anon.get(`/api/user/${h.ADMIN.username}`);
  const p = perfil.status() === 200 ? await perfil.json() : {};
  filas.push({ peticion: `GET /api/user/${h.ADMIN.username} (sin sesión)`, esperado: 'No revelar el rol de administrador', obtenido: `HTTP ${perfil.status()} · groupTitle: ${p.groupTitle} · email: "${p.email ?? ''}"`, ok: !/administrators/.test(p.groupTitle || '') });

  const err = await anon.get('/api/v3/no-existe');
  const cuerpoErr = await err.text();
  filas.push({ peticion: 'GET /api/v3/no-existe', esperado: 'Error genérico sin traza (stack)', obtenido: `HTTP ${err.status()} ${cuerpoErr.slice(0, 100)}`, ok: !/at .*\.js:\d+/.test(cuerpoErr) });

  const up = await anon.get('/assets/uploads/');
  filas.push({ peticion: 'GET /assets/uploads/ (listado de directorio)', esperado: '404/403, sin listado', obtenido: `HTTP ${up.status()}`, ok: up.status() !== 200 });

  const robots = await (await anon.get('/robots.txt')).text();
  filas.push({ peticion: 'GET /robots.txt', esperado: 'Sin rutas sensibles ocultas', obtenido: robots.replace(/\n/g, ' ¶ '), ok: true });

  await h.evidence(page, 'SEC-A05-02', 'Información disponible para un visitante anónimo', filas,
    'La lista de usuarios y los perfiles públicos son configurables en NodeBB (privilegio "view:users" del grupo guests). Revelar qué cuentas son administradoras facilita elegir objetivos para fuerza bruta (ver SEC-A07-01).');
  h.record('SEC-A05-02', { filas, usuariosVisibles: lista.length });
  await anon.dispose();
  expect(cuerpoErr).not.toMatch(/at .*\.js:\d+/);
});
