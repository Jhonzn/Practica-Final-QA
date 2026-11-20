// CP-A01 y CP-A02: pruebas de integracion de la API REST de NodeBB.
const { test, expect } = require('@playwright/test');
const { firstCategoryId } = require('../helpers');

test.describe('API publica y control de acceso', () => {
  test('CP-A01 | GET /api/config devuelve la configuracion publica con los limites esperados (RF03, RNF01)', async ({ request }) => {
    const inicio = Date.now();
    const res = await request.get('/api/config');
    const duracion = Date.now() - inicio;

    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('application/json');

    const config = await res.json();
    expect(typeof config.csrf_token).toBe('string');
    expect(config.csrf_token.length).toBeGreaterThan(0);
    // Limites documentados en qa/docs/04-requerimientos.md
    expect(config.minimumPostLength).toBe(8);
    expect(config.maximumPostLength).toBe(32767);
    expect(config.maximumTitleLength).toBe(255);
    expect(config.maximumTagsPerTopic).toBe(5);
    // RNF01: respuesta en menos de 3 segundos
    expect(duracion).toBeLessThan(3000);
  });

  test('CP-A02 | POST /api/v3/topics sin autenticacion es rechazado y no crea el tema (RF03, RNF02)', async ({ request }) => {
    const cid = await firstCategoryId(request);
    const titulo = `Tema sin sesion ${Date.now()}`;

    const res = await request.post('/api/v3/topics', {
      data: { cid, title: titulo, content: 'Contenido que no deberia publicarse.' },
    });

    // Sin sesion ni token: NodeBB debe responder 401 o 403
    expect([401, 403]).toContain(res.status());

    // Verificacion: el titulo no aparece en los temas recientes
    const recientes = await (await request.get('/api/recent')).json();
    const titulos = recientes.topics.map(t => t.title);
    expect(titulos).not.toContain(titulo);
  });
});
