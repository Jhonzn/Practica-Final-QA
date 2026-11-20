// Prepara el ambiente de pruebas de seguridad antes de la suite:
// 1. Borra bloqueos de login previos (para no heredar estado de otra ejecución).
// 2. Desactiva la cola de moderación y las esperas para usuarios nuevos, para que los
//    temas con cargas XSS se publiquen y se puedan ver en el navegador. Estos ajustes no
//    cambian la sanitización del contenido, que es lo que se evalúa.
const { request } = require('@playwright/test');
const { BASE_URL, ADMIN, resetLockouts, login, setSetting } = require('./tests/helpers');

module.exports = async () => {
  resetLockouts();
  const ctx = await request.newContext({ baseURL: BASE_URL });
  const csrf = await login(ctx, ADMIN);
  for (const [k, v] of [['postQueue', 0], ['initialPostDelay', 0], ['newbiePostDelay', 0], ['postDelay', 0]]) {
    await setSetting(ctx, csrf, k, v);
  }
  await ctx.dispose();
};
