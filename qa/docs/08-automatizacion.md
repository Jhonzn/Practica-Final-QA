# 8. Automatización de pruebas (y 7. Pruebas de rendimiento)

Borrador para la Persona 2. Las tablas de resultados de **referencia** vienen de una ejecución de prueba hecha el 15 de noviembre de 2026 sobre NodeBB 4.16.7 (Windows 11, Node.js 24, MongoDB 7, sin Docker). **Hay que repetir la ejecución en el ambiente Docker del equipo**, reemplazar los números y pegar las capturas propias.

## 8.1 Herramientas y lenguaje

| Elemento | Elección | Motivo |
|---|---|---|
| Lenguaje | JavaScript (Node.js) | Es el mismo lenguaje de NodeBB, así que se pueden leer las reglas de validación directamente en el código. |
| Pruebas de API y E2E | Playwright 1.64.1 (`@playwright/test`) | Un solo framework para API (`request`) e interfaz (Chromium), con reportes HTML, capturas, video y trazas. |
| Pruebas unitarias | Mocha + nyc (suite incluida en NodeBB) | Reutiliza las pruebas del proyecto y mide la cobertura de código. |
| Carga | k6 | Los scripts se escriben en JavaScript y los umbrales se definen como criterios de aceptación (RNF01 a RNF03). |
| CI | GitHub Actions | El repositorio está en GitHub; los reportes quedan como artefactos de cada ejecución. |

## 8.2 Scripts y escenarios cubiertos

| Caso | Archivo | Escenario | Técnica | Requisito |
|---|---|---|---|---|
| CA-01 | `tests/api/api-config.spec.js` | `GET /api/config` responde 200 en JSON, en menos de 3 s, con token CSRF y los límites de configuración | Partición de equivalencia | RF12, RNF01 |
| CA-02 | `tests/api/api-config.spec.js` | `POST /api/v3/topics` sin sesión responde 401/403 y el tema no aparece en `/api/recent` | Partición de equivalencia | RF12, RNF05 |
| CA-03 | `tests/api/topics-limites.spec.js` | Contenido de 7 caracteres se rechaza (400) y de 8 se acepta (200/202) | Valores límite | RF05 |
| CA-04 | `tests/api/topics-limites.spec.js` | Título de 256 caracteres se rechaza (400) y de 255 se acepta | Valores límite | RF05 |
| CA-05 | `tests/api/topics-limites.spec.js` | 5 etiquetas se aceptan y 6 se rechazan | Valores límite | RF06 |
| CA-06 | `tests/e2e/login.spec.js` | Login válido: sale de `/login` y `app.user.uid > 0` | Partición de equivalencia | RF02 |
| CA-07 | `tests/e2e/login.spec.js` | Login inválido: se muestra `#login-error-notify` y no hay sesión | Partición de equivalencia | RF02 |
| CA-08 | `tests/e2e/registro.spec.js` | Usuario de 1 y de 17 caracteres muestran error; usuario de 16 completa el registro | Valores límite | RF01 |
| CA-09 | `tests/e2e/admin-y-temas.spec.js` | Visitante sin sesión que abre `/admin` termina en `/login` | Tabla de decisión (R1) | RF11 |
| CA-10 | `tests/e2e/admin-y-temas.spec.js` | Login, crear un tema en el editor, verlo publicado y en `/recent` | Flujo E2E | RF05, RF07 |
| Unitarias | `nodebb/NodeBB/test/utils.js`, `test/password.js` | 92 pruebas de utilidades y de hash de contraseñas | Caja blanca | RNF04 |

## 8.3 Resultados (ejecución de referencia)

| Suite | Pruebas | Aprobadas | Fallidas | Duración |
|---|---|---|---|---|
| Playwright – API | 5 | 5 | 0 | 24 s |
| Playwright – E2E | 7 | 7 | 0 | 29 s |
| Mocha (unitarias de NodeBB) | 92 | 92 | 0 | 13 s |

`[PENDIENTE]`: captura de la consola con `npm test`, captura del reporte HTML (`npm run report`) y captura de la ejecución en la pestaña Actions de GitHub.

## 8.4 Hallazgos durante la automatización

1. **Los administradores omiten los límites de título y contenido.** Al ejecutar CA-03 y CA-04 con la cuenta de administrador, NodeBB aceptó un contenido de 7 caracteres y un título de 256. La causa está en `src/topics/create.js`: `checkTitle` y `checkContent` solo se ejecutan `if (!isAdmin)`. Es un comportamiento de diseño, no un defecto, pero hay que documentarlo porque cambia el resultado de las pruebas según el rol. Las pruebas se rediseñaron para usar un usuario normal.
2. **Las publicaciones de usuarios nuevos van a la cola de moderación** (`postQueue = 1`), y la API responde 202 en vez de 200.
3. **Bloqueo de IP con inicios de sesión exitosos.** Tras varias ejecuciones seguidas, CA-06 falló con el mensaje "Your IP has been temporarily locked" aunque las credenciales eran correctas. En `src/user/password.js`, `User.auth.logAttempt(uid, ip)` se llama **antes** de comparar la contraseña, y el contador por IP no se reinicia con un login exitoso (`clearLoginAttempts` solo limpia el contador del usuario). Con más de 20 inicios de sesión por hora (`ipLoginAttempts`) la IP queda bloqueada 1 hora. Protege contra fuerza bruta (OWASP A07), pero puede bloquear a usuarios legítimos que comparten IP (NAT de una universidad u oficina). Severidad media, para revisar con la Persona 3.
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

# 7. Pruebas de rendimiento (resultados de k6)

**Escenario:** `performance/carga-k6.js`. Subida de 0 a 5 usuarios virtuales en 20 s, luego a 20 en 30 s, 60 s sostenidos con 20 y bajada en 10 s. Cada usuario visita `/`, `/api/categories`, `/recent` y `/api/topic/:slug`, con 1 s de pausa.

| Métrica | Umbral | Resultado de referencia | ¿Cumple? |
|---|---|---|---|
| `http_req_duration` p(95) | < 3000 ms (RNF01) | 254,81 ms | Sí |
| `http_req_duration` promedio / máximo | – | 128,1 ms / 1,23 s | – |
| `http_req_failed` | < 1 % (RNF02) | 0,19 % (9 de 4565) | Sí |
| Errores 5xx | 0 (RNF03) | 9 respuestas 503 en `/` y `/recent` | **No** |
| Peticiones por segundo | – | 37,8 | – |

**Interpretación.** El tiempo de respuesta cumple con amplio margen. Las 9 respuestas 503 no son caídas del servidor: vienen del mecanismo de protección `toobusy` de NodeBB (`src/middleware/index.js`). Este mecanismo rechaza peticiones cuando el retraso del event loop supera 100 ms (`eventLoopLagThreshold`). Las páginas que se renderizan en el servidor (`/` y `/recent`) son las que más lo activan; las rutas de API no tuvieron errores. Con 20 usuarios concurrentes en un solo proceso, NodeBB empieza a descartar carga. Como recomendación, ejecutar varias instancias detrás de un balanceador o aumentar el umbral.

`[PENDIENTE]`: repetir con `npm run perf` contra el NodeBB en Docker, pegar la captura del resumen y actualizar esta tabla.
