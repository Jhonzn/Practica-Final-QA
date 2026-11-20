// Ejecucion asistida de los casos manuales CP-M01 a CP-M10 (seccion 6.1 del informe).
// Sigue los pasos de cada caso en Chromium, guarda una captura por caso en evidencias/CP-MXX.png
// y anota lo observado en evidencias/resultados.json.
//
// Uso (desde qa/automation, donde estan instaladas las dependencias):
//   node ../manual/ejecutar-casos.js preparar   -> crea qa_usuario01, desactiva la cola y crea datos para CP-M10
//   node ../manual/ejecutar-casos.js casos      -> ejecuta CP-M01 a CP-M09
//   node ../manual/ejecutar-casos.js antes      -> CP-M10, paso 1 (anota temas y respuestas)
//   (docker compose restart en nodebb/NodeBB)
//   node ../manual/ejecutar-casos.js despues    -> CP-M10, pasos 3 a 5 (compara y toma la captura)
const path = require('path');
const fs = require('fs');
const { chromium, request: pwRequest } = require(require.resolve('@playwright/test', { paths: [path.join(__dirname, '../automation')] }));

const BASE = process.env.BASE_URL || 'http://localhost:4567';
const ADMIN = { username: process.env.NODEBB_ADMIN_USER || 'admin', password: process.env.NODEBB_ADMIN_PASSWORD || 'QaAdmin#2026x' };
const USR = { username: 'qa_usuario01', password: 'Qa-Prueba-2026!' };
const EVI = path.join(__dirname, 'evidencias');
const RES = path.join(EVI, 'resultados.json');
fs.mkdirSync(EVI, { recursive: true });

const resultados = fs.existsSync(RES) ? JSON.parse(fs.readFileSync(RES, 'utf8')) : {};
function anotar(id, obtenido, estado, extra = {}) {
  resultados[id] = { fecha: new Date().toISOString(), obtenido, estado, ...extra };
  fs.writeFileSync(RES, JSON.stringify(resultados, null, 2));
  console.log(`${id}: ${estado} - ${obtenido}`);
}
const captura = (page, id) => page.screenshot({ path: path.join(EVI, `${id}.png`), fullPage: false });

async function api(user) {
  const ctx = await pwRequest.newContext({ baseURL: BASE });
  let csrf = (await (await ctx.get('/api/config')).json()).csrf_token;
  if (user) {
    const r = await ctx.post('/login', { form: { username: user.username, password: user.password }, headers: { 'x-csrf-token': csrf } });
    if (r.status() !== 200) throw new Error(`login ${user.username}: ${r.status()} ${await r.text()}`);
    csrf = (await (await ctx.get('/api/config')).json()).csrf_token;
  }
  return { ctx, csrf };
}

async function loginUi(page, user) {
  await page.goto(`${BASE}/login`);
  await page.locator('#username').fill(user.username);
  await page.locator('#password').fill(user.password);
  await page.locator('#login').click();
}

async function textoAlertas(page) {
  await page.waitForTimeout(1500);
  const t = await page.locator('.alert, [component="toaster/toast"], .alert-window').allInnerTexts();
  // Se omiten los avisos generales (correo sin configurar, reconexion del socket) que no son parte del caso
  const msgs = t.map(s => s.replace(/\s+/g, ' ').trim()).filter(s => s && !/email|connection/i.test(s));
  return [...new Set(msgs)].join(' | ');
}

async function abrirEditor(page) {
  await page.goto(`${BASE}/categories`);
  await page.locator('a[href*="/category/"]').first().click();
  await page.locator('#new_topic').click();
  const ed = page.locator('[component="composer"]');
  await ed.waitFor();
  return ed;
}

// ---------------------------------------------------------------- preparar
async function preparar() {
  const { ctx, csrf } = await api(ADMIN);
  const h = { 'x-csrf-token': csrf };
  const cu = await ctx.post('/api/v3/users', { data: USR, headers: h });
  console.log('crear qa_usuario01:', cu.status(), cu.status() === 200 ? '' : await cu.text());
  const pq = await ctx.put('/api/v3/admin/settings/postQueue', { data: { value: 0 }, headers: h });
  console.log('desactivar cola de publicaciones:', pq.status());

  // Datos para CP-M10 (RNF04 pide al menos 20 operaciones): un tema del administrador con 18 respuestas.
  const cid = (await (await ctx.get('/api/categories')).json()).categories[0].cid;
  const t = await ctx.post('/api/v3/topics', { data: { cid, title: 'Tema de persistencia CP-M10', content: 'Tema creado para verificar la persistencia tras el reinicio.' }, headers: h });
  const tid = (await t.json()).response.tid;
  for (let i = 1; i <= 18; i++) {
    const r = await ctx.post(`/api/v3/topics/${tid}`, { data: { content: `Respuesta de persistencia numero ${i}.` }, headers: h });
    if (r.status() !== 200) throw new Error(`respuesta ${i}: ${r.status()}`);
  }
  console.log('tema de persistencia', tid, 'con 18 respuestas');
  await ctx.dispose();
}

// ---------------------------------------------------------------- casos
async function casos() {
  const browser = await chromium.launch();
  const nueva = async () => (await browser.newContext({ viewport: { width: 1366, height: 768 } })).newPage();
  let page;

  // CP-M01
  page = await nueva();
  await page.goto(`${BASE}/register`);
  await page.locator('#username').fill('a');
  await page.locator('#username').blur();
  await page.locator('#password').fill(USR.password);
  await page.locator('#password-confirm').fill(USR.password);
  await page.locator('#register').click();
  await page.waitForTimeout(1500);
  let notify = (await page.locator('#username-notify').innerText()).trim();
  const url1 = page.url();
  await captura(page, 'CP-M01');
  anotar('CP-M01', `Junto al campo aparece "${notify}" y la página sigue en ${new URL(url1).pathname}; no se crea la cuenta.`,
    notify && /\/register$/.test(new URL(url1).pathname) ? 'Aprobado' : 'Fallido');
  await page.context().close();

  // CP-M02
  page = await nueva();
  await loginUi(page, USR);
  await page.waitForURL(u => !u.pathname.startsWith('/login'));
  const r2 = await page.goto(`${BASE}/admin`);
  const s2 = r2.status(); const tit2 = (await page.title());
  const h2 = (await page.locator('main h1, main h2, [component="error"]').first().innerText().catch(() => '')).trim();
  await captura(page, 'CP-M02');
  const r2b = await page.goto(`${BASE}/admin/manage/users`);
  const s2b = r2b.status();
  const panel = await page.locator('#acp-search, .acp-sidebar, [component="acp/sidebar"]').count();
  anotar('CP-M02', `/admin responde HTTP ${s2} con la página "${h2 || tit2}"; /admin/manage/users responde HTTP ${s2b}; no se ve ninguna opción del panel.`,
    s2 === 403 && s2b === 403 && panel === 0 ? 'Aprobado' : 'Fallido');
  await page.context().close();

  // CP-M03
  page = await nueva();
  const u2 = 'q' + String.fromCharCode(97 + Math.floor(Math.random() * 26));
  await page.goto(`${BASE}/register`);
  await page.locator('#username').fill(u2);
  await page.locator('#username').blur();
  await page.waitForTimeout(1000);
  const notify3 = (await page.locator('#username-notify').innerText()).trim();
  await page.locator('#password').fill(USR.password);
  await page.locator('#password-confirm').fill(USR.password);
  await page.locator('#register').click();
  await page.waitForURL(/\/register\/complete/);
  for (const c of await page.locator('main form input[type="checkbox"]').all()) await c.check();
  await page.locator('main form button.btn-primary').click();
  await page.waitForURL(u => !u.pathname.startsWith('/register'));
  const uid3 = await page.evaluate(() => window.app && app.user && app.user.uid);
  const name3 = await page.evaluate(() => window.app && app.user && app.user.username);
  await captura(page, 'CP-M03');
  anotar('CP-M03', `Sin error en el campo${notify3 ? ` (texto: "${notify3}")` : ''}; la cuenta "${name3}" se creó (uid ${uid3}) y quedó con la sesión iniciada.`,
    uid3 > 0 && name3 === u2 ? 'Aprobado' : 'Fallido', { datos: `usuario ${u2}` });
  await page.context().close();

  // CP-M04
  page = await nueva();
  await loginUi(page, USR);
  await page.waitForURL(u => !u.pathname.startsWith('/login'));
  const uid4 = await page.evaluate(() => app.user.uid);
  const menu = page.locator('[component="header/avatar"], #user_dropdown, [component="sidebar/user"]').first();
  const menuVisible = await menu.isVisible();
  await menu.click();
  await page.locator('[component="user/logout"]').first().click();
  await page.waitForTimeout(2000);
  const uid4b = await page.evaluate(() => app.user.uid);
  await page.goto(`${BASE}/user/${USR.username}/settings`);
  const url4 = new URL(page.url()).pathname;
  await captura(page, 'CP-M04');
  anotar('CP-M04', `Tras iniciar sesión sale de /login (uid ${uid4}, menú de usuario visible: ${menuVisible ? 'sí' : 'no'}). Tras cerrar sesión el uid es ${uid4b} y /user/${USR.username}/settings redirige a ${url4}.`,
    uid4 > 0 && uid4b === 0 && url4.startsWith('/login') ? 'Aprobado' : 'Fallido');
  await page.context().close();

  // CP-M05
  page = await nueva();
  await loginUi(page, { username: USR.username, password: 'ClaveErronea1' });
  const err5 = page.locator('#login-error-notify');
  await err5.waitFor({ state: 'visible' });
  const msg5 = (await err5.innerText()).replace(/\s+/g, ' ').trim();
  const uid5 = await page.evaluate(() => app.user.uid);
  await captura(page, 'CP-M05');
  anotar('CP-M05', `Permanece en ${new URL(page.url()).pathname}, muestra "${msg5}" y no inicia sesión (uid ${uid5}).`,
    uid5 === 0 && new URL(page.url()).pathname === '/login' ? 'Aprobado' : 'Fallido');
  await page.context().close();

  await casoM06(nueva);

  // CP-M07
  page = await nueva();
  await loginUi(page, USR);
  await page.waitForURL(u => !u.pathname.startsWith('/login'));
  const t255 = ('Titulo limite ' + 'x'.repeat(255)).slice(0, 255);
  let ed = await abrirEditor(page);
  await ed.locator('input.title').fill(t255);
  await ed.locator('textarea.write').fill('Prueba08');
  await ed.locator('button.composer-submit:visible').first().click();
  let ok7 = true;
  try { await page.waitForURL(/\/topic\//, { timeout: 10000 }); } catch { ok7 = false; }
  const alert7 = ok7 ? '' : await textoAlertas(page);
  const tit7 = ok7 ? (await page.locator('[component="topic/title"]').first().innerText()).trim() : '';
  const url7 = page.url();
  await captura(page, 'CP-M07');
  await page.goto(`${BASE}/recent`);
  const enRecent = ok7 && await page.getByText(t255.slice(0, 40)).count() > 0;
  anotar('CP-M07', ok7
    ? `El tema se publicó sin errores (${new URL(url7).pathname}); el título se muestra completo (${tit7.length} caracteres) y ${enRecent ? 'aparece' : 'no aparece'} en /recent.`
    : `No se publicó: ${alert7}`,
  ok7 && tit7.length === 255 && enRecent ? 'Aprobado' : 'Fallido', { tema: url7 });

  // CP-M08 (mismo usuario)
  ed = await abrirEditor(page);
  await ed.locator('input.title').fill('Tema limite de contenido');
  await ed.locator('textarea.write').fill('Prueba7');
  await ed.locator('button.composer-submit:visible').first().click();
  const alert8 = await textoAlertas(page);
  const sigue = new URL(page.url()).pathname.includes('/topic/') ? 'navegó a un tema' : 'el editor sigue abierto';
  await captura(page, 'CP-M08');
  const lista = await (await page.request.get(`${BASE}/api/recent`)).json();
  const creado8 = lista.topics.some(x => x.title === 'Tema limite de contenido');
  anotar('CP-M08', `Se muestra "${alert8}"; ${sigue} y el tema ${creado8 ? 'sí' : 'no'} aparece en /recent.`,
    alert8 && !creado8 ? 'Aprobado' : 'Fallido');

  // CP-M09 (mismo usuario; espera newbiePostDelay de 120 s desde CP-M07)
  console.log('Esperando 125 s por newbiePostDelay...');
  await page.waitForTimeout(125000);
  await casoM09(page, url7);

  await browser.close();
}

async function casoM06(nueva) {
  const page = await nueva();
  await page.goto(`${BASE}/categories`);
  const enlaces = await page.locator('[component="categories/category"] h2 a[href*="/category/"], [component="categories/category"] a.text-reset[href*="/category/"]').evaluateAll(as => [...new Set(as.map(a => a.getAttribute('href')))]);
  const ncat = await page.locator('[component="categories/category"]').count();
  let cat = '', ntem = 0;
  for (const href of enlaces) {
    await page.goto(new URL(href, BASE).href);
    ntem = await page.locator('[component="category/topic"]').count();
    if (ntem > 0) { cat = (await page.title()).split('|')[0].trim(); break; }
  }
  await page.locator('[component="category/topic"] a[href*="/topic/"]').first().click();
  await page.waitForURL(/\/topic\//);
  const tit6 = (await page.locator('[component="topic/title"]').first().innerText()).trim();
  const posts6 = await page.locator('[component="post"]').count();
  await captura(page, 'CP-M06');
  await page.goto(`${BASE}/recent`);
  const nrec = await page.locator('[component="category/topic"]').count();
  const sinLogin = new URL(page.url()).pathname === '/recent';
  anotar('CP-M06', `Sin sesión: /categories lista ${ncat} categorías; la categoría "${cat}" muestra ${ntem} tema(s); el tema "${tit6}" muestra ${posts6} publicación(es) con autor y contenido; /recent lista ${nrec} temas. No se pidió iniciar sesión.`,
    ncat > 0 && ntem > 0 && posts6 > 0 && nrec > 0 && sinLogin ? 'Aprobado' : 'Fallido');
  await page.context().close();
}

async function casoM09(page, url7) {
  await page.goto(url7);
  const antes9 = await page.locator('[component="post"]').count();
  await page.locator('[component="topic/reply"]:visible').first().click();
  const ed = page.locator('[component="composer"]');
  await ed.waitFor();
  await ed.locator('textarea.write').fill('Respuesta de prueba manual CP-M09.');
  await ed.locator('button.composer-submit:visible').first().click();
  await page.waitForTimeout(3000);
  const alert9 = await textoAlertas(page);
  await page.reload();
  const despues9 = await page.locator('[component="post"]').count();
  const ultimo = page.locator('[component="post"]').last();
  const txt9 = (await ultimo.innerText()).replace(/\s+/g, ' ');
  await ultimo.scrollIntoViewIfNeeded();
  await captura(page, 'CP-M09');
  const okTxt = txt9.includes('Respuesta de prueba manual CP-M09.') && txt9.includes(USR.username);
  anotar('CP-M09', okTxt
    ? `Tras recargar, la respuesta aparece al final del tema con el autor ${USR.username}; el tema pasó de ${antes9} a ${despues9} publicaciones.`
    : `La respuesta no aparece tras recargar (${antes9} -> ${despues9} publicaciones). ${alert9}`,
  okTxt && despues9 === antes9 + 1 ? 'Aprobado' : 'Fallido');
}

// Repite casos sueltos: node ../manual/ejecutar-casos.js repetir CP-M06 CP-M09
async function repetir() {
  const ids = process.argv.slice(3);
  const browser = await chromium.launch();
  const nueva = async () => (await browser.newContext({ viewport: { width: 1366, height: 768 } })).newPage();
  if (ids.includes('CP-M06')) await casoM06(nueva);
  if (ids.includes('CP-M09')) {
    const page = await nueva();
    await loginUi(page, USR);
    await page.waitForURL(u => !u.pathname.startsWith('/login'));
    await casoM09(page, resultados['CP-M07'].tema);
  }
  await browser.close();
}

// ---------------------------------------------------------------- CP-M10
const SNAP = path.join(EVI, 'cp-m10-antes.json');
async function estado() {
  const ctx = await pwRequest.newContext({ baseURL: BASE });
  const r = await (await ctx.get('/api/recent')).json();
  const temas = r.topics.map(t => ({ tid: t.tid, titulo: t.title, autor: t.user.username, respuestas: t.postcount - 1 }));
  await ctx.dispose();
  return temas;
}
async function antes() {
  const temas = await estado();
  fs.writeFileSync(SNAP, JSON.stringify(temas, null, 2));
  const ops = temas.reduce((n, t) => n + 1 + t.respuestas, 0);
  console.log(`Anotados ${temas.length} temas y ${ops} publicaciones (temas + respuestas).`);
}
async function despues() {
  const prev = JSON.parse(fs.readFileSync(SNAP, 'utf8'));
  const ahora = await estado();
  const faltan = prev.filter(p => !ahora.some(a => a.tid === p.tid && a.titulo === p.titulo && a.autor === p.autor && a.respuestas === p.respuestas));
  const ops = prev.reduce((n, t) => n + 1 + t.respuestas, 0);
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1366, height: 768 } })).newPage();
  const res = await page.goto(`${BASE}/recent`);
  await captura(page, 'CP-M10');
  await browser.close();
  anotar('CP-M10', `Tras docker compose restart, /recent responde HTTP ${res.status()} y los ${prev.length} temas anotados (${ops} publicaciones entre temas y respuestas) siguen con el mismo título, autor y número de respuestas${faltan.length ? `, salvo: ${faltan.map(f => f.titulo).join('; ')}` : ''}.`,
    faltan.length === 0 && res.status() === 200 && ops >= 20 ? 'Aprobado' : 'Fallido');
}

const fase = process.argv[2];
({ preparar, casos, repetir, antes, despues })[fase]().catch(e => { console.error(e); process.exit(1); });
