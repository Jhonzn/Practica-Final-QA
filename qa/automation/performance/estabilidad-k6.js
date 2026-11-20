// Prueba de estabilidad (carga sostenida) para NodeBB con k6.
//
// Escenario: 10 usuarios virtuales constantes durante 10 minutos recorren el foro como
// visitantes (inicio, API de categorias, recientes y un tema). Es la carga de RNF01
// (10 usuarios concurrentes) mantenida en el tiempo, para ver si el servicio se degrada.
// Se comparan los tiempos de los 2 primeros minutos con los de los 2 ultimos.
//
// Ejecutar:  k6 run --summary-export=performance/resultados/estabilidad-k6.json performance/estabilidad-k6.js
//            npm run perf:estabilidad   (k6 en Docker)
import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4567';
const DURACION_MIN = 10;

const inicio = new Trend('duracion_primeros_2min', true);
const final = new Trend('duracion_ultimos_2min', true);

export const options = {
  scenarios: {
    sostenida: { executor: 'constant-vus', vus: 10, duration: `${DURACION_MIN}m` },
  },
  thresholds: {
    http_req_duration: ['p(95)<3000'], // RNF01
    http_req_failed: ['rate<0.01'], // RNF01 (complementario)
    checks: ['rate>0.99'], // RNF01 (complementario): sin respuestas 5xx
    duracion_ultimos_2min: ['p(95)<3000'],
  },
};

export function setup() {
  const res = http.get(`${BASE_URL}/api/recent`);
  const temas = res.status === 200 ? res.json('topics') : [];
  return { slug: temas && temas.length ? temas[0].slug : null, t0: Date.now() };
}

function pedir(url, nombre, t0) {
  const res = http.get(url, { tags: { pagina: nombre } });
  check(res, {
    [`${nombre}: estado 200`]: r => r.status === 200,
    [`${nombre}: sin error 5xx`]: r => r.status < 500,
  });
  const min = (Date.now() - t0) / 60000;
  if (min < 2) inicio.add(res.timings.duration);
  else if (min >= DURACION_MIN - 2) final.add(res.timings.duration);
}

export default function (data) {
  group('Recorrido de visitante', () => {
    pedir(`${BASE_URL}/`, 'inicio', data.t0);
    pedir(`${BASE_URL}/api/categories`, 'api-categorias', data.t0);
    pedir(`${BASE_URL}/recent`, 'recientes', data.t0);
    if (data.slug) pedir(`${BASE_URL}/api/topic/${data.slug}`, 'api-tema', data.t0);
  });
  sleep(1);
}
