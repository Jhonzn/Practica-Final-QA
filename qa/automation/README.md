# Pruebas automatizadas de NodeBB

Pruebas de integración (API), de sistema (E2E en Chromium) y de carga (k6) para el caso práctico de QA.

| Carpeta / archivo | Contenido |
|---|---|
| `tests/api/` | CA-01 a CA-05: API REST (`/api/config`, `/api/v3/topics`) con valores límite |
| `tests/e2e/` | CA-06 a CA-10: login, registro, acceso a `/admin`, crear tema |
| `tests/helpers.js` | Login por API e interfaz, token CSRF, creación de usuarios de prueba |
| `performance/carga-k6.js` | Prueba de carga: hasta 20 usuarios virtuales durante unos 2 minutos |
| `playwright.config.js` | Proyectos `api` y `e2e`, reportes HTML y JUnit, capturas automáticas |
| `../../.github/workflows/qa-tests.yml` | Pipeline de CI en GitHub Actions |

## Requisitos

- NodeBB corriendo en `http://localhost:4567` (ver el README principal del repositorio).
- Node.js 20 o superior.
- k6 para la prueba de carga: `winget install k6 --source winget`, o usar `npm run perf:docker` con Docker.

## Preparación (una sola vez)

1. Instalar NodeBB y crear la cuenta de administrador. Las credenciales de prueba sugeridas están en `.env.example`.
2. Instalar las dependencias:

```bash
cd qa/automation
npm install
npx playwright install chromium
```

3. Copiar `.env.example` como `.env` y poner el usuario y la contraseña del administrador de **tu** NodeBB local.

## Ejecución

| Comando | Qué hace |
|---|---|
| `npm test` | Ejecuta las 12 pruebas (5 de API y 7 E2E) |
| `npm run test:api` | Solo las pruebas de API |
| `npm run test:e2e` | Solo las pruebas de interfaz |
| `npm run report` | Abre el reporte HTML (`reports/html`) |
| `npm run perf` | Prueba de carga con k6 y guarda `performance/resultados/resumen-k6.json` |
| `npm run perf:docker` | La misma prueba de carga usando la imagen de Docker de k6 |

Las capturas de evidencia quedan en `reports/evidencias/` y las de cada prueba dentro del reporte HTML.

## Notas de diseño

- **Los administradores omiten los límites de título y contenido** (`src/topics/create.js`, condición `if (!isAdmin)`). Por eso CA-03 y CA-04 crean un usuario normal en cada ejecución.
- Un usuario nuevo debe esperar 10 s antes de su primera publicación (`initialPostDelay`) y sus publicaciones pasan por la cola de moderación (`postQueue`). Por eso la API responde **202** en lugar de 200; ambas respuestas indican que la validación fue superada.
- El registro tiene un paso intermedio (`/register/complete`) con el correo opcional y los consentimientos de GDPR.
- CA-07 usa un usuario inexistente para no bloquear al administrador (5 intentos fallidos = 60 minutos de bloqueo).
- Las pruebas corren en serie (`workers: 1`) por los límites de frecuencia de NodeBB.
- **Bloqueo por IP:** NodeBB cuenta todos los inicios de sesión desde una misma IP, también los exitosos. Con más de 20 por hora (`ipLoginAttempts`), la IP queda bloqueada 1 hora ("Your IP has been temporarily locked"). Cada ejecución completa hace unos 9 inicios de sesión, así que se puede correr la suite unas 2 veces por hora. Si aparece el bloqueo, hay dos opciones:
  - En el ambiente de pruebas, subir el valor en *Admin → Settings → User → IP login attempts*.
  - Borrar el bloqueo en MongoDB:

```bash
docker compose exec mongo mongosh -u nodebb -p nodebb --authenticationDatabase admin nodebb --eval 'db.objects.deleteMany({_key: /^(lockout:|loginAttempts:)/})'
```
