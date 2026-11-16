// CP-A03, CP-A04 y CP-A05: valores limite al crear temas por la API de escritura (/api/v3).
//
// Importante: NodeBB NO aplica los limites de titulo y contenido a los administradores
// (src/topics/create.js, condicion `if (!isAdmin)`). Por eso CP-A03 y CP-A04 usan un
// usuario normal creado para cada prueba. El limite de etiquetas si aplica a todos.
//
// Un usuario nuevo tiene reputacion 0, asi que su publicacion valida puede quedar en la
// cola de moderacion (postQueue = 1): la API responde 202 en lugar de 200. Ambas
// respuestas significan que la validacion de longitud fue superada.
const { test, expect } = require('@playwright/test');
const { loginApi, firstCategoryId, createRegularUser, unique } = require('../helpers');

const ACEPTADO = [200, 202];

test.describe('Creacion de temas: valores limite', () => {
  let cid;

  /** Crea un usuario normal, inicia sesion con el y devuelve su contexto y token CSRF. */
  async function sesionUsuarioNormal(playwright, request, baseURL) {
    const adminCsrf = await loginApi(request);
    cid = await firstCategoryId(request);
    const usuario = await createRegularUser(request, adminCsrf);
    const contexto = await playwright.request.newContext({ baseURL });
    const csrf = await loginApi(contexto, usuario);
    return { contexto, csrf };
  }

  function crearTema(ctx, csrf, { title, content, tags }) {
    return ctx.post('/api/v3/topics', {
      data: { cid, title, content, tags },
      headers: { 'x-csrf-token': csrf },
    });
  }

  /** NodeBB exige esperar unos segundos tras crear la cuenta (initialPostDelay = 10 s). */
  async function publicarCuandoSePermita(ctx, csrf, datos) {
    for (let intento = 0; intento < 8; intento++) {
      const res = await crearTema(ctx, csrf, datos);
      const cuerpo = await res.json();
      if (res.status() === 400 && /(wait \d+ second|too-new|too new)/i.test(cuerpo.status.message)) {
        await new Promise(r => setTimeout(r, 3000));
        continue;
      }
      return { res, cuerpo };
    }
    throw new Error('El usuario de prueba nunca pudo publicar (espera inicial).');
  }

  test('CP-A03 | Contenido: 7 caracteres se rechaza y 8 caracteres se acepta (RF05)', async ({ playwright, request, baseURL }) => {
    const { contexto, csrf } = await sesionUsuarioNormal(playwright, request, baseURL);

    const debajoDelLimite = await crearTema(contexto, csrf, { title: `Limite contenido 7 ${unique()}`, content: '1234567' });
    expect(debajoDelLimite.status()).toBe(400);
    const error = (await debajoDelLimite.json()).status.message;
    console.log(`Contenido de 7 caracteres -> HTTP 400: "${error}"`);
    expect(error).toMatch(/8/);

    const { res, cuerpo } = await publicarCuandoSePermita(contexto, csrf, { title: `Limite contenido 8 ${unique()}`, content: '12345678' });
    console.log(`Contenido de 8 caracteres -> HTTP ${res.status()}`);
    expect(ACEPTADO, JSON.stringify(cuerpo.status)).toContain(res.status());
    await contexto.dispose();
  });

  test('CP-A04 | Titulo: 255 caracteres se acepta y 256 se rechaza (RF05)', async ({ playwright, request, baseURL }) => {
    const { contexto, csrf } = await sesionUsuarioNormal(playwright, request, baseURL);
    const base = `T${unique()}`;
    const titulo255 = base.padEnd(255, 'a');
    const titulo256 = base.padEnd(256, 'b');
    expect(titulo255).toHaveLength(255);
    expect(titulo256).toHaveLength(256);

    const sobreElLimite = await crearTema(contexto, csrf, { title: titulo256, content: 'Contenido valido para el limite de titulo.' });
    expect(sobreElLimite.status()).toBe(400);
    const error = (await sobreElLimite.json()).status.message;
    console.log(`Titulo de 256 caracteres -> HTTP 400: "${error}"`);
    expect(error).toMatch(/255/);

    const { res, cuerpo } = await publicarCuandoSePermita(contexto, csrf, { title: titulo255, content: 'Contenido valido para el limite de titulo.' });
    console.log(`Titulo de 255 caracteres -> HTTP ${res.status()}`);
    expect(ACEPTADO, JSON.stringify(cuerpo.status)).toContain(res.status());
    await contexto.dispose();
  });

  test('CP-A05 | Etiquetas: 5 se aceptan y 6 se rechazan (RF06)', async ({ request }) => {
    const csrf = await loginApi(request); // el limite de etiquetas aplica tambien al administrador
    cid = await firstCategoryId(request);
    const u = unique().slice(-6);
    const cinco = [1, 2, 3, 4, 5].map(n => `qa${n}${u}`);
    const seis = [...cinco, `qa6${u}`];

    const enElLimite = await crearTema(request, csrf, { title: `Cinco etiquetas ${u}`, content: 'Tema con cinco etiquetas.', tags: cinco });
    expect(enElLimite.status()).toBe(200);
    const tema = (await enElLimite.json()).response;
    expect(tema.tags.map(t => t.value).sort()).toEqual([...cinco].sort());

    const sobreElLimite = await crearTema(request, csrf, { title: `Seis etiquetas ${u}`, content: 'Tema con seis etiquetas.', tags: seis });
    expect(sobreElLimite.status()).toBe(400);
    const error = (await sobreElLimite.json()).status.message;
    console.log(`6 etiquetas -> HTTP 400: "${error}"`);
    expect(error).toMatch(/5/);
  });
});
