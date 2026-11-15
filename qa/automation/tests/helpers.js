// Utilidades compartidas por las pruebas de NodeBB.
const ADMIN = {
  username: process.env.NODEBB_ADMIN_USER || 'admin',
  password: process.env.NODEBB_ADMIN_PASSWORD || 'QaAdmin#2026x',
};

/** Sufijo corto y unico para no repetir usuarios ni titulos entre ejecuciones. */
function unique() {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
}

/** Obtiene el token CSRF de la sesion actual (NodeBB lo expone en /api/config). */
async function csrfToken(request) {
  const res = await request.get('/api/config');
  const body = await res.json();
  return body.csrf_token;
}

/** Inicia sesion por HTTP con el contexto de peticiones de Playwright (guarda la cookie). */
async function loginApi(request, user = ADMIN) {
  const token = await csrfToken(request);
  const res = await request.post('/login', {
    form: { username: user.username, password: user.password, remember: 'on' },
    headers: { 'x-csrf-token': token },
  });
  if (res.status() !== 200) {
    throw new Error(`Login fallido para ${user.username}: HTTP ${res.status()} ${await res.text()}`);
  }
  // NodeBB regenera la sesion al autenticar: se pide un token CSRF nuevo
  return csrfToken(request);
}

/** Devuelve el cid de la primera categoria visible. */
async function firstCategoryId(request) {
  const res = await request.get('/api/categories');
  const body = await res.json();
  return body.categories[0].cid;
}

/**
 * Crea un usuario normal (sin privilegios) usando la API de administracion.
 * Se necesita porque NodeBB no aplica los limites de titulo y contenido a los
 * administradores (src/topics/create.js), asi que esos limites se prueban con
 * un usuario comun.
 */
async function createRegularUser(adminRequest, adminCsrf) {
  const user = { username: `qa${unique()}`.slice(0, 16), password: 'Qa-Prueba-2026!' };
  const res = await adminRequest.post('/api/v3/users', {
    data: user,
    headers: { 'x-csrf-token': adminCsrf },
  });
  if (res.status() !== 200) {
    throw new Error(`No se pudo crear el usuario de prueba: HTTP ${res.status()} ${await res.text()}`);
  }
  return user;
}

/** Inicia sesion desde la interfaz grafica. */
async function loginUi(page, user = ADMIN) {
  await page.goto('/login');
  await page.locator('#username').fill(user.username);
  await page.locator('#password').fill(user.password);
  await page.locator('#login').click();
}

module.exports = { ADMIN, unique, csrfToken, loginApi, firstCategoryId, createRegularUser, loginUi };
