// OWASP A03:2021 – Injection (incluye Cross-Site Scripting).
// Se publican cargas XSS en temas y en el perfil con un usuario normal y se abren las páginas
// en Chromium: si algún script se ejecuta, se dispara un diálogo alert() y la prueba lo registra.
const { test, expect, request: pwRequest } = require('@playwright/test');
const h = require('./helpers');

const TITULO_XSS = `<script>alert('XSS-T1')</script><img src=x onerror=alert('XSS-T2')> titulo`;
const CONTENIDO_XSS = [
  'Prueba de XSS almacenado (A03). Control: **negrita** y [enlace legítimo](https://example.org) deben renderizarse.',
  '',
  "<script>alert('XSS-C1')</script>",
  `<img src=x onerror="alert('XSS-C2')">`,
  "<svg onload=alert('XSS-C3')></svg>",
  `<a href="javascript:alert('XSS-C4')">enlace html</a>`,
  "[enlace markdown](javascript:alert('XSS-C5'))",
  `<iframe src="javascript:alert('XSS-C6')"></iframe>`,
  `<div style="background:url(javascript:alert('XSS-C7'))">estilo</div>`,
  "<details open ontoggle=alert('XSS-C8')>detalles</details>",
  '![img](x" onerror="alert(\'XSS-C9\'))',
].join('\n');

/** Revisa el DOM de la zona indicada en busca de elementos ejecutables. */
async function domPeligroso(page, selector) {
  return page.evaluate((sel) => {
    const zonas = [...document.querySelectorAll(sel)];
    const r = { scripts: 0, manejadores: [], hrefJs: 0, iframes: 0, zonas: zonas.length };
    for (const z of zonas) {
      r.scripts += z.querySelectorAll('script').length;
      r.iframes += z.querySelectorAll('iframe').length;
      r.hrefJs += [...z.querySelectorAll('a[href], [src]')].filter(e => /^\s*javascript:/i.test(e.getAttribute('href') || e.getAttribute('src') || '')).length;
      for (const e of z.querySelectorAll('*')) {
        for (const a of e.attributes) if (/^on/i.test(a.name)) r.manejadores.push(`${e.tagName.toLowerCase()}[${a.name}]`);
      }
    }
    return r;
  }, selector);
}

let adminCtx; let adminCsrf; let user; let ctx; let csrf; let cid; let tema;

test.beforeAll(async () => {
  adminCtx = await pwRequest.newContext({ baseURL: h.BASE_URL });
  adminCsrf = await h.login(adminCtx, h.ADMIN);
  user = await h.createUser(adminCtx, adminCsrf, 'secX');
  ctx = await pwRequest.newContext({ baseURL: h.BASE_URL });
  csrf = await h.login(ctx, user);
  cid = (await (await ctx.get('/api/categories')).json()).categories[0].cid;
});

test.afterAll(async () => { for (const c of [adminCtx, ctx]) await c?.dispose(); });

test('SEC-A03-01: XSS almacenado en título y contenido de un tema', async ({ page, context }) => {
  const res = await ctx.post('/api/v3/topics', {
    data: { cid, title: TITULO_XSS, content: CONTENIDO_XSS, tags: ['xss'] },
    headers: { 'x-csrf-token': csrf },
  });
  expect(res.status(), await res.text()).toBe(200);
  tema = (await res.json()).response;

  const dialogos = [];
  page.on('dialog', async (d) => { dialogos.push(d.message()); await d.dismiss(); });
  await context.addCookies((await ctx.storageState()).cookies);
  await page.goto(`/topic/${tema.slug}`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);

  const dom = await domPeligroso(page, '[component="post/content"]');
  const tituloVisible = await page.locator('[component="topic/title"]').first().innerText();
  const htmlGuardado = (await (await ctx.get(`/api/v3/posts/${tema.mainPost.pid}`)).json()).response.content;
  const htmlRenderizado = await page.locator('[component="post/content"]').first().innerHTML();
  const markdownActivo = await page.locator('[component="post/content"] strong').count() > 0
    && await page.locator('[component="post/content"] a[href="https://example.org"]').count() > 0;
  await h.screenshotWithUrl(page, 'SEC-A03-01');
  h.record('SEC-A03-01', { url: page.url(), dialogos, dom, tituloVisible, markdownActivo, htmlGuardado, htmlRenderizado });

  expect(markdownActivo, 'Control: el Markdown legítimo se renderiza').toBeTruthy();
  expect(dialogos, 'Ningún script debe ejecutarse').toEqual([]);
  expect(dom.scripts + dom.iframes + dom.hrefJs + dom.manejadores.length).toBe(0);
  expect(tituloVisible).toContain('<script>'); // el título se muestra como texto, escapado
});

test('SEC-A03-02: XSS almacenado en los campos del perfil', async ({ page, context }) => {
  const campos = {
    fullname: `<img src=x onerror=alert('XSS-P1')>Nombre`,
    location: `<script>alert('XSS-P2')</script>Medellin`,
    website: `javascript:alert('XSS-P3')`,
    aboutme: `<svg onload=alert('XSS-P4')></svg> Sobre mí [clic](javascript:alert('XSS-P5'))`,
    signature: `<img src=x onerror=alert('XSS-P6')> firma`,
  };
  const res = await ctx.put(`/api/v3/users/${user.uid}`, { data: campos, headers: { 'x-csrf-token': csrf }, failOnStatusCode: false });
  const respuestaUpdate = `HTTP ${res.status()} ${(await res.text()).slice(0, 200)}`;

  const dialogos = [];
  page.on('dialog', async (d) => { dialogos.push(d.message()); await d.dismiss(); });
  await context.addCookies((await ctx.storageState()).cookies);
  await page.goto(`/user/${user.userslug}`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
  const domPerfil = await domPeligroso(page, '[component="account/header"], .account, #content');
  const hrefWebsite = await page.locator('a[href*="javascript"]').count();
  await h.screenshotWithUrl(page, 'SEC-A03-02');

  // La firma se muestra debajo de los posts del usuario
  if (tema) {
    await page.goto(`/topic/${tema.slug}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
  }
  const domFirma = await domPeligroso(page, '[component="post/signature"]');
  h.record('SEC-A03-02', { respuestaUpdate, dialogos, domPerfil, domFirma, hrefWebsite });

  expect(dialogos).toEqual([]);
  expect(domPerfil.scripts + domPerfil.manejadores.length + domFirma.manejadores.length + domFirma.scripts).toBe(0);
  expect(hrefWebsite).toBe(0);
});

test('SEC-A03-03: XSS reflejado en la búsqueda y en parámetros de URL', async ({ page }) => {
  const dialogos = [];
  page.on('dialog', async (d) => { dialogos.push(d.message()); await d.dismiss(); });
  const urls = [
    `/search?term=${encodeURIComponent("<script>alert('XSS-R1')</script>")}&in=titlesposts`,
    `/search?term=${encodeURIComponent('"><img src=x onerror=alert(\'XSS-R2\')>')}`,
    `/login?next=${encodeURIComponent("javascript:alert('XSS-R3')")}`,
    `/tags/${encodeURIComponent("<svg onload=alert('XSS-R4')>")}`,
  ];
  const filas = [];
  for (const u of urls) {
    const r = await page.goto(u);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(800);
    const dom = await domPeligroso(page, '#content');
    filas.push({ peticion: `GET ${decodeURIComponent(u)}`, esperado: 'La carga se muestra como texto; no se ejecuta', obtenido: `HTTP ${r.status()} · diálogos: ${dialogos.length} · manejadores on*: ${dom.manejadores.length}`, ok: dialogos.length === 0 && dom.manejadores.length === 0 });
  }
  await page.goto(urls[0]);
  await page.waitForLoadState('networkidle');
  await h.screenshotWithUrl(page, 'SEC-A03-03-busqueda');
  await h.evidence(page, 'SEC-A03-03', 'XSS reflejado en búsqueda, redirección y etiquetas', filas);
  h.record('SEC-A03-03', { filas, dialogos });
  expect(dialogos).toEqual([]);
});

test('SEC-A03-04: inyección NoSQL en el inicio de sesión', async ({ page }) => {
  const anon = await pwRequest.newContext({ baseURL: h.BASE_URL });
  const token = await h.csrfToken(anon);
  const cargas = [
    { username: { $ne: null }, password: { $ne: null } },
    { username: h.ADMIN.username, password: { $gt: '' } },
    { username: { $regex: '^adm' }, password: 'x' },
  ];
  const filas = [];
  for (const c of cargas) {
    const r = await anon.post('/login', { data: c, headers: { 'x-csrf-token': token }, failOnStatusCode: false });
    const cuerpo = (await r.text()).slice(0, 120);
    const sesion = (await (await anon.get('/api/config')).json()).uid;
    filas.push({ peticion: `POST /login ${JSON.stringify(c)}`, esperado: 'Rechazado, sin sesión', obtenido: `HTTP ${r.status()} ${cuerpo} · uid de sesión: ${sesion ?? 0}`, ok: r.status() !== 200 && !(sesion > 0) });
  }
  await h.evidence(page, 'SEC-A03-04', 'Inyección NoSQL (operadores de MongoDB) en /login', filas,
    'Se envían objetos con operadores $ne, $gt y $regex en lugar de cadenas, como en una inyección NoSQL clásica contra MongoDB.');
  h.record('SEC-A03-04', { filas });
  await anon.dispose();
  for (const f of filas) expect(f.ok, f.peticion).toBeTruthy();
});
