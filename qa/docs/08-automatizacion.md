# 8. Automatización de pruebas (y 7. Pruebas de rendimiento)

Resultados de la ejecución del 16 de noviembre de 2026 sobre NodeBB 4.16.7 (Windows 11, Node.js 24.21, MongoDB 7.0.14, NodeBB ejecutado directamente con Node porque Docker Desktop no inició en ese equipo). La misma suite se ejecuta en limpio en GitHub Actions en cada push. Las capturas están en `qa/automation/evidencias/` (EVI-AUT-01 a EVI-AUT-04 y las capturas por caso).

## 8.1 Herramientas y lenguaje

| Elemento | Elección | Motivo |
|---|---|---|
| Lenguaje | JavaScript (Node.js) | Es el mismo lenguaje de NodeBB, así que se pueden leer las reglas de validación directamente en el código. |
| Pruebas de API y E2E | Playwright 1.64.1 (`@playwright/test`) | Un solo framework para API (`request`) e interfaz (Chromium), con reportes HTML, capturas, video y trazas. |
| Pruebas unitarias | Mocha + nyc (suite incluida en NodeBB) | Reutiliza las pruebas del proyecto y mide la cobertura de código. |
| Carga | k6 | Los scripts se escriben en JavaScript y los umbrales se definen como criterios de aceptación de RNF01 (p95, tasa de errores y respuestas 5xx). |
| CI | GitHub Actions | El repositorio está en GitHub; los reportes quedan como artefactos de cada ejecución. |

## 8.2 Scripts y escenarios cubiertos

| Caso | Archivo | Escenario | Técnica | Requisito |
|---|---|---|---|---|
| CP-A01 | `tests/api/api-config.spec.js` | `GET /api/config` responde 200 en JSON, en menos de 3 s, con token CSRF y los límites de configuración | Partición de equivalencia | RF03, RNF01 |
| CP-A02 | `tests/api/api-config.spec.js` | `POST /api/v3/topics` sin sesión responde 401/403 y el tema no aparece en `/api/recent` | Partición de equivalencia | RF03, RNF02 |
| CP-A03 | `tests/api/topics-limites.spec.js` | Contenido de 7 caracteres se rechaza (400) y de 8 se acepta (200/202) | Valores límite | RF03 |
| CP-A04 | `tests/api/topics-limites.spec.js` | Título de 256 caracteres se rechaza (400) y de 255 se acepta | Valores límite | RF03 |
| CP-A05 | `tests/api/topics-limites.spec.js` | 5 etiquetas se aceptan y 6 se rechazan | Valores límite | RF03 |
| CP-A06 | `tests/e2e/login.spec.js` | Login válido: sale de `/login` y `app.user.uid > 0` | Partición de equivalencia | RF01 |
| CP-A07 | `tests/e2e/login.spec.js` | Login inválido: se muestra `#login-error-notify` y no hay sesión | Partición de equivalencia | RF01 |
| CP-A08 | `tests/e2e/registro.spec.js` | Usuario de 1 y de 17 caracteres muestran error; usuario de 16 completa el registro | Valores límite | RF05 |
| CP-A09 | `tests/e2e/admin-y-temas.spec.js` | Visitante sin sesión que abre `/admin` termina en `/login` | Tabla de decisión (R1) | RNF02 |
| CP-A10 | `tests/e2e/admin-y-temas.spec.js` | Login, crear un tema en el editor, verlo publicado y en `/recent` | Flujo E2E | RF03, RF02 |
| Unitarias | `nodebb/NodeBB/test/utils.js`, `test/password.js` | 92 pruebas de utilidades y de hash de contraseñas | Caja blanca | RNF05 |

## 8.3 Resultados

| Suite | Pruebas | Aprobadas | Fallidas | Duración | Evidencia |
|---|---|---|---|---|---|
| Playwright – API | 5 | 5 | 0 | 26,2 s | EVI-AUT-01, EVI-AUT-02 |
| Playwright – E2E | 7 | 7 | 0 | 21,7 s | EVI-AUT-01, EVI-AUT-02 y capturas por caso |
| Total Playwright | 12 | 12 | 0 | 53,5 s | |
| Mocha (unitarias de NodeBB) | 92 | 92 | 0 | 27 s | EVI-AUT-04 |

Cobertura de las pruebas unitarias (nyc): 23,91 % de sentencias, 5,87 % de ramas, 10,12 % de funciones y 24,73 % de líneas. Es baja porque solo se ejecutan 2 de los archivos de prueba de NodeBB (`utils.js` y `password.js`), elegidos para que el pipeline sea corto; la cifra mide qué parte de todo el código toca esa selección, no la calidad de la suite completa.

## 8.4 Hallazgos durante la automatización

1. **Los administradores omiten los límites de título y contenido.** Al ejecutar CP-A03 y CP-A04 con la cuenta de administrador, NodeBB aceptó un contenido de 7 caracteres y un título de 256. La causa está en `src/topics/create.js`: `checkTitle` y `checkContent` solo se ejecutan `if (!isAdmin)`. Es un comportamiento de diseño, no un defecto, pero hay que documentarlo porque cambia el resultado de las pruebas según el rol. Las pruebas se rediseñaron para usar un usuario normal.
2. **Las publicaciones de usuarios nuevos van a la cola de moderación** (`postQueue = 1`), y la API responde 202 en vez de 200.
3. **Bloqueo de IP con inicios de sesión exitosos.** Tras varias ejecuciones seguidas, CP-A06 falló con el mensaje "Your IP has been temporarily locked" aunque las credenciales eran correctas. En `src/user/password.js`, `User.auth.logAttempt(uid, ip)` se llama **antes** de comparar la contraseña, y el contador por IP no se reinicia con un login exitoso (`clearLoginAttempts` solo limpia el contador del usuario). Con más de 20 inicios de sesión por hora (`ipLoginAttempts`) la IP queda bloqueada 1 hora. Protege contra fuerza bruta (OWASP A07), pero puede bloquear a usuarios legítimos que comparten IP (NAT de una universidad u oficina). Severidad media, para revisar con la Persona 3.
4. **Posible defecto (para la Persona 4):** en `src/user/posts.js` se usa `meta.config.newbiewPostDelay` (con una "w" de más) en vez de `newbiePostDelay`. Por eso la condición `% 60 === 0` nunca se cumple, y el aviso de espera para usuarios nuevos siempre se muestra en segundos ("120 segundos") en lugar de minutos ("2 minutos"). Severidad baja.

## 8.5 Integración CI/CD

El workflow `.github/workflows/qa-tests.yml` se ejecuta en cada push o pull request a `main`, y también a mano (`workflow_dispatch`):

1. Levanta MongoDB 7 como servicio e instala NodeBB con una configuración no interactiva.
2. Ejecuta las pruebas unitarias de Mocha con cobertura (nyc).
3. Arranca NodeBB y espera a que `/api/config` responda.
4. Ejecuta las 12 pruebas de Playwright.
5. Ejecuta una prueba de carga corta con k6.
6. Publica como artefacto `reportes-qa` el reporte HTML, el JUnit, las capturas, el resumen de k6, la cobertura y los logs.

Si cualquier prueba falla, el job queda en rojo y el commit se marca como fallido en GitHub.

Primera ejecución: 16/11/2026, run #1 (commit 8a8e26b), estado Success en 3 min 26 s, con el artefacto `reportes-qa` publicado. Evidencia: `qa/automation/evidencias/EVI-AUT-09-github-actions.png`.

# 7. Pruebas de rendimiento (resultados de k6)

**Escenario:** `performance/carga-k6.js`. Subida de 0 a 5 usuarios virtuales en 20 s, luego a 20 en 30 s, 60 s sostenidos con 20 y bajada en 10 s. Cada usuario visita `/`, `/api/categories`, `/recent` y `/api/topic/:slug`, con 1 s de pausa.

Herramienta: k6 v2.3.0. Duración total: 2 minutos. Usuarios concurrentes: hasta 20. Solicitudes: 3709 (927 iteraciones). Evidencia: EVI-AUT-03 y `performance/resultados/resumen-k6.json`.

| Métrica | Umbral | Resultado (16 nov) | ¿Cumple? |
|---|---|---|---|
| Tiempo promedio | – | 214,77 ms | – |
| Tiempo mínimo | – | 15,48 ms | – |
| Tiempo máximo | – | 442,36 ms | – |
| Percentil 95 (p95) | < 3000 ms (RNF01) | 333,95 ms | Sí |
| Tasa de errores | < 1 % (complementario de RNF01) | 0,00 % (0 de 3709) | Sí |
| Errores 5xx | 0 (complementario de RNF01) | 0 | Sí |
| Throughput | – | 30,8 peticiones/s | – |

**Interpretación.** Con 20 usuarios concurrentes, el p95 queda en 334 ms, unas 9 veces por debajo del umbral de 3 s, y no hubo errores. Las páginas que se renderizan en el servidor (`/` y `/recent`) son las más lentas; las rutas de API responden más rápido.

En una ejecución de prueba anterior (15 de noviembre), con el mismo script, sí aparecieron 9 respuestas 503 de 4565 (0,19 %) en `/` y `/recent`. No fueron caídas: las produce el mecanismo de protección `toobusy` de NodeBB (`src/middleware/index.js`), que rechaza peticiones cuando el retraso del event loop supera 100 ms (`eventLoopLagThreshold`). Eso indica que 20 usuarios simultáneos en un solo proceso están cerca del límite en que NodeBB empieza a descartar carga, y que el resultado depende de la carga del equipo. Recomendación: ejecutar varias instancias detrás de un balanceador o ajustar el umbral.

**Limitaciones:** la prueba corre en el mismo equipo que el servidor, con una base de datos pequeña y solo con peticiones de lectura.
