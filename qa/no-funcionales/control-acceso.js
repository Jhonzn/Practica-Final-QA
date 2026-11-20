// Verificaciones de control de acceso (RNF02) por API sobre el NodeBB local.
// Comprueba que un visitante y un usuario sin privilegios no puedan ejecutar operaciones
// restringidas, y que la operacion no tenga efecto. Guarda el resultado en
// evidencias/control-acceso.json.
//
// Uso (desde qa/automation): node ../no-funcionales/control-acceso.js
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const { request: pwRequest } = require(require.resolve('@playwright/test', { paths: [path.join(__dirname, '../automation')] }));

const BASE = process.env.BASE_URL || 'http://localhost:4567';
const ADMIN = { username: process.env.NODEBB_ADMIN_USER || 'admin', password: process.env.NODEBB_ADMIN_PASSWORD || 'QaAdmin#2026x' };
const USR = { username: 'qa_usuario01', password: 'Qa-Prueba-2026!' };
const OUT = path.join(__dirname, 'evidencias');
fs.mkdirSync(OUT, { recursive: true });

async function sesion(user) {
  const ctx = await pwRequest.newContext({ baseURL: BASE, maxRedirects: 0 });
  let csrf = (await (await ctx.get('/api/config')).json()).csrf_token;
  if (user) {
    const r = await ctx.post('/login', { form: user, headers: { 'x-csrf-token': csrf } });
    if (r.status() !== 200) throw new Error(`login ${user.username}: ${r.status()}`);
    csrf = (await (await ctx.get('/api/config')).json()).csrf_token;
  }
  return { ctx, h: { 'x-csrf-token': csrf } };
}

const denegado = s => [401, 403].includes(s);

(async () => {
  const admin = await sesion(ADMIN);
  const vis = await sesion(null);
  const usr = await sesion(USR);

  const recent = await (await admin.ctx.get('/api/recent')).json();
  const temaAdmin = recent.topics.find(t => t.user.username === ADMIN.username);
  const adminUid = temaAdmin.uid;
  const cid = temaAdmin.cid;
  // El valor guardado de postQueue se lee directamente en MongoDB (contenedor nodebb-mongo-1)
  const config = async () => ({
    postQueue: execSync('docker exec nodebb-mongo-1 mongosh -u nodebb -p nodebb --authenticationDatabase admin nodebb --quiet '
      + '--eval "db.objects.findOne({_key:\'config\'}).postQueue"').toString().trim(),
  });
  const postsDe = async tid => (await (await admin.ctx.get(`/api/v3/topics/${tid}`)).json()).response;

  const filas = [];
  async function caso(id, actor, accion, fn, sinEfecto) {
    const res = await fn();
    const st = res.status();
    let efecto = 'no verificado';
    if (sinEfecto) efecto = (await sinEfecto()) ? 'sin efecto' : 'CON EFECTO';
    const ok = denegado(st) && efecto !== 'CON EFECTO';
    filas.push({ id, actor, accion, http: st, efecto, estado: ok ? 'Aprobado' : 'Fallido' });
    console.log(`${id} | ${actor} | ${accion} | HTTP ${st} | ${efecto} | ${ok ? 'Aprobado' : 'Fallido'}`);
  }

  const n0 = (await postsDe(temaAdmin.tid)).postcount;
  await caso('CA-01', 'Visitante', 'Responder un tema (POST /api/v3/topics/:tid)',
    () => vis.ctx.post(`/api/v3/topics/${temaAdmin.tid}`, { data: { content: 'Respuesta de visitante no permitida.' }, headers: vis.h }),
    async () => (await postsDe(temaAdmin.tid)).postcount === n0);
  await caso('CA-02', 'Visitante', 'Abrir la API del panel (GET /api/admin/manage/users)',
    () => vis.ctx.get('/api/admin/manage/users'));
  await caso('CA-03', 'Usuario sin privilegios', 'Abrir la API del panel (GET /api/admin/manage/users)',
    () => usr.ctx.get('/api/admin/manage/users'));
  const pq0 = (await config()).postQueue;
  console.log(`postQueue antes de CA-04: ${pq0}`);
  await caso('CA-04', 'Usuario sin privilegios', 'Cambiar un ajuste del foro (PUT /api/v3/admin/settings/postQueue)',
    () => usr.ctx.put('/api/v3/admin/settings/postQueue', { data: { value: 1 }, headers: usr.h }),
    async () => (await config()).postQueue === pq0);
  const fn0 = (await (await admin.ctx.get(`/api/v3/users/${adminUid}`, { headers: admin.h })).json()).response.fullname;
  await caso('CA-05', 'Usuario sin privilegios', 'Editar el perfil de otro usuario (PUT /api/v3/users/:uid)',
    () => usr.ctx.put(`/api/v3/users/${adminUid}`, { data: { fullname: 'Modificado por otro usuario' }, headers: usr.h }),
    async () => (await (await admin.ctx.get(`/api/v3/users/${adminUid}`, { headers: admin.h })).json()).response.fullname === fn0);
  await caso('CA-06', 'Usuario sin privilegios', 'Eliminar un tema ajeno (DELETE /api/v3/topics/:tid)',
    () => usr.ctx.delete(`/api/v3/topics/${temaAdmin.tid}`, { headers: usr.h }),
    async () => (await admin.ctx.get(`/api/v3/topics/${temaAdmin.tid}`)).status() === 200);
  const nombre = `qanoadm${Date.now() % 100000}`;
  await caso('CA-07', 'Usuario sin privilegios', 'Crear un usuario (POST /api/v3/users)',
    () => usr.ctx.post('/api/v3/users', { data: { username: nombre, password: 'Qa-Prueba-2026!' }, headers: usr.h }),
    async () => (await admin.ctx.get(`/api/user/${nombre}`)).status() === 404);
  await caso('CA-08', 'Usuario sin privilegios', 'Crear una categoría (POST /api/v3/categories)',
    () => usr.ctx.post('/api/v3/categories', { data: { name: 'Categoria no permitida', parentCid: 0 }, headers: usr.h }),
    async () => !(await (await admin.ctx.get('/api/categories')).json()).categories.some(c => c.name === 'Categoria no permitida'));

  const salida = { fecha: new Date().toISOString(), base: BASE, cid, temaAdmin: temaAdmin.tid, filas };
  fs.writeFileSync(path.join(OUT, 'control-acceso.json'), JSON.stringify(salida, null, 2));
  await Promise.all([admin.ctx.dispose(), vis.ctx.dispose(), usr.ctx.dispose()]);
})().catch(e => { console.error(e); process.exit(1); });
