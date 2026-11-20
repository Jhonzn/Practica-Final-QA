// Prueba de carga basica para NodeBB con k6 (RNF01: p95, tasa de errores y respuestas 5xx).
//
// Escenario: hasta 20 usuarios virtuales navegan el foro como visitantes
// (pagina de inicio, categorias, recientes y un tema) durante ~2 minutos.
//
// Ejecutar:  k6 run performance/carga-k6.js
//            k6 run -e BASE_URL=http://localhost:4567 performance/carga-k6.js
import http from 'k6/http';
import { check, group, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4567';

export const options = {
  stages: [
    { duration: '20s', target: 5 }, // calentamiento
    { duration: '30s', target: 20 }, // subida a 20 usuarios concurrentes
    { duration: '60s', target: 20 }, // carga sostenida
    { duration: '10s', target: 0 }, // bajada
  ],
  thresholds: {
    // RNF01: p95 del tiempo de respuesta menor a 3 s
    http_req_duration: ['p(95)<3000'],
    // RNF01 (complementario): menos del 1 % de peticiones fallidas
    http_req_failed: ['rate<0.01'],
    // RNF01 (complementario): ningun error 5xx (los checks deben pasar en mas del 99 %)
    checks: ['rate>0.99'],
  },
};

export function setup() {
  // Obtiene un tema existente para incluirlo en la navegacion
  const res = http.get(`${BASE_URL}/api/recent`);
  const temas = res.status === 200 ? res.json('topics') : [];
  return { slug: temas && temas.length ? temas[0].slug : null };
}

function verificar(res, nombre) {
  check(res, {
    [`${nombre}: estado 200`]: r => r.status === 200,
    [`${nombre}: sin error 5xx`]: r => r.status < 500,
  });
}

export default function (data) {
  group('Pagina de inicio', () => {
    verificar(http.get(`${BASE_URL}/`, { tags: { pagina: 'inicio' } }), 'inicio');
  });

  group('API de categorias', () => {
    verificar(http.get(`${BASE_URL}/api/categories`, { tags: { pagina: 'api-categorias' } }), 'api-categorias');
  });

  group('Temas recientes', () => {
    verificar(http.get(`${BASE_URL}/recent`, { tags: { pagina: 'recientes' } }), 'recientes');
  });

  if (data.slug) {
    group('Ver un tema', () => {
      verificar(http.get(`${BASE_URL}/api/topic/${data.slug}`, { tags: { pagina: 'api-tema' } }), 'api-tema');
    });
  }

  sleep(1); // tiempo de lectura de un usuario
}
