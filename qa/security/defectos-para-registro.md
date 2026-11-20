# Defectos de seguridad para registrar en GitHub Issues

De: Persona 3 (seguridad). Para: Persona 4 (gestión de defectos).
Hallazgos confirmados el 19/11/2026 sobre NodeBB 4.16.7 en `http://localhost:4567`. Cada uno se puede reproducir con `npx playwright test -g "<ID de prueba>"` en `qa/security/owasp` y tiene su análisis completo en `qa/security/hallazgos.md`.

Sugerencia de etiquetas: `defecto`, `seguridad` y la severidad. La severidad sigue el riesgo calculado (impacto × probabilidad); la prioridad, lo fácil que es corregirlo.

| Defecto | Título sugerido | Severidad | Prioridad | Evidencia |
|---|---|---|---|---|
| VUL-01 | Enumeración de usuarios y correos a través del bloqueo compartido `lockout:dummy` | Media | Media | `qa/security/evidencias/SEC-A07-02.png` |
| VUL-02 | La IP se bloquea tras 20 inicios de sesión, aunque sean exitosos | Media | Alta | `SEC-A07-03.png`, `SEC-A07-03-ui.png` |
| VUL-03 | Cualquier persona puede bloquear una cuenta durante 60 minutos con 5 intentos fallidos | Media | Baja | `SEC-A07-01.png`, `SEC-A07-01-ui.png` |
| VUL-04 | La política de contraseñas por defecto acepta contraseñas débiles (`Clave123`, `medellin1`) | Media | Alta | `SEC-A07-04.png` |
| VUL-05 | Content-Security-Policy incompleta (solo `frame-ancestors`) | Media | Baja | `SEC-A05-01.png`, `reportes/zap/zap-baseline.html` |
| VUL-06 | La lista de usuarios y el rol de administrador son visibles sin iniciar sesión | Media | Media | `SEC-A05-02.png` |
| VUL-07 | `X-Powered-By: NodeBB` y faltan Permissions-Policy y COEP | Baja | Baja | `SEC-A05-01.png`, `reportes/zap/zap-baseline.html` |

> VUL-02 es el mismo comportamiento que la Persona 2 anotó en la sección 8.4 (punto 3). Conviene registrarlo **una sola vez** y citar las dos evidencias.

## Texto listo para cada Issue

### VUL-01 · Enumeración de usuarios y correos a través del bloqueo compartido `lockout:dummy`

**Categoría:** OWASP A07:2021 (CWE-204) · **Severidad:** Media · **Prioridad:** Media

**Pasos para reproducir**
1. Enviar `POST /login` 6 veces con nombres de usuario inexistentes distintos y cualquier contraseña.
2. Enviar `POST /login` con un nombre inexistente: responde `[[error:account-locked]]`.
3. Enviar `POST /login` con un nombre (o correo) registrado y una contraseña incorrecta: responde `[[error:invalid-login-credentials]]`.

**Resultado esperado:** el mismo mensaje en los pasos 2 y 3.
**Resultado obtenido:** mensajes distintos, que revelan si la cuenta existe.
**Causa:** `src/user/auth.js` usa una única clave `lockout:dummy` para todos los usuarios inexistentes.
**Evidencia:** `qa/security/evidencias/SEC-A07-02.png` · prueba `SEC-A07-02`.

### VUL-02 · La IP se bloquea tras 20 inicios de sesión, aunque sean exitosos

**Categoría:** OWASP A07:2021 (CWE-645) · **Severidad:** Media · **Prioridad:** Alta

**Pasos para reproducir:** iniciar sesión 21 veces seguidas con credenciales correctas desde la misma IP.
**Resultado esperado:** los inicios de sesión válidos no bloquean la IP.
**Resultado obtenido:** el 21.º responde `[[error:ip-locked]]` y durante 1 hora nadie puede entrar desde esa IP, incluido el administrador.
**Causa:** `User.auth.logIPAttempt` se ejecuta antes de comparar la contraseña y el contador de la IP no se reinicia con un login exitoso.
**Evidencia:** `SEC-A07-03.png`, `SEC-A07-03-ui.png` · prueba `SEC-A07-03`.

### VUL-03 · Cualquier persona puede bloquear una cuenta durante 60 minutos

**Categoría:** OWASP A07:2021 (CWE-645) · **Severidad:** Media · **Prioridad:** Baja

**Pasos para reproducir:** enviar 6 contraseñas incorrectas para una cuenta conocida (por ejemplo `admin`) y luego intentar entrar con la contraseña correcta.
**Resultado esperado:** el dueño legítimo puede seguir entrando (con CAPTCHA o retraso).
**Resultado obtenido:** `[[error:account-locked]]` durante 60 minutos.
**Evidencia:** `SEC-A07-01.png`, `SEC-A07-01-ui.png` · prueba `SEC-A07-01`.

### VUL-04 · La política de contraseñas por defecto acepta contraseñas débiles

**Categoría:** OWASP A07:2021 (CWE-521) · **Severidad:** Media · **Prioridad:** Alta (es un cambio de configuración)

**Pasos para reproducir:** crear cuentas con las contraseñas `Clave123`, `abc123456`, `medellin1` y `nodebb2026`.
**Resultado esperado:** rechazo (menos de 8 caracteres o contraseña común/predecible).
**Resultado obtenido:** las 4 se aceptan (`minimumPasswordLength = 6`, `minimumPasswordStrength = 1`).
**Evidencia:** `SEC-A07-04.png` · prueba `SEC-A07-04`.

### VUL-05 · Content-Security-Policy incompleta

**Categoría:** OWASP A05:2021 (CWE-693) · **Severidad:** Media · **Prioridad:** Baja

**Pasos para reproducir:** `curl -I http://localhost:4567/` y revisar la cabecera `Content-Security-Policy`.
**Resultado esperado:** una política con `default-src` y `script-src`.
**Resultado obtenido:** solo `frame-ancestors 'self'`; ZAP lo marca como riesgo Medio (regla 10055).
**Evidencia:** `SEC-A05-01.png`, `reportes/zap/zap-baseline.html`.

### VUL-06 · Lista de usuarios y rol de administrador visibles sin sesión

**Categoría:** OWASP A01:2021 (CWE-200) · **Severidad:** Media · **Prioridad:** Media

**Pasos para reproducir:** sin iniciar sesión, abrir `http://localhost:4567/api/users` y `http://localhost:4567/api/user/admin`.
**Resultado esperado:** acceso restringido a usuarios registrados, sin revelar quién es administrador.
**Resultado obtenido:** se listan todos los usuarios y `groupTitle` muestra `["administrators"]`.
**Evidencia:** `SEC-A05-02.png` · prueba `SEC-A05-02`.

### VUL-07 · `X-Powered-By: NodeBB` y cabeceras de endurecimiento ausentes

**Categoría:** OWASP A05:2021 (CWE-497, CWE-693) · **Severidad:** Baja · **Prioridad:** Baja

**Pasos para reproducir:** `curl -I http://localhost:4567/` y `curl -I http://localhost:4567/favicon.ico`.
**Resultado obtenido:** `X-Powered-By: NodeBB`; sin `Permissions-Policy` ni `Cross-Origin-Embedder-Policy`; `/favicon.ico` sin `X-Content-Type-Options`.
**Evidencia:** `SEC-A05-01.png`, `reportes/zap/zap-baseline.html`.

## Catálogo de evidencias de seguridad (para la sección 7.6)

| ID | Tipo | Descripción | Fecha | Ubicación |
|---|---|---|---|---|
| EVI-SEC-01 | Captura | Dashboard de SonarQube (Overall Code): ratings, cobertura y duplicación | 19/11/2026 | qa/security/evidencias/SEC-SQ-01-dashboard.png |
| EVI-SEC-02 | Captura | Vulnerabilidades reportadas por SonarQube | 19/11/2026 | qa/security/evidencias/SEC-SQ-02-vulnerabilidades.png |
| EVI-SEC-03 | Captura | Bugs de SonarQube (incluye los 3 Blocker revisados) | 19/11/2026 | qa/security/evidencias/SEC-SQ-03-bugs.png |
| EVI-SEC-04 | Captura | Cobertura por archivo en SonarQube | 19/11/2026 | qa/security/evidencias/SEC-SQ-04-cobertura.png |
| EVI-SEC-05 | Captura | Duplicación por archivo en SonarQube | 19/11/2026 | qa/security/evidencias/SEC-SQ-05-duplicacion.png |
| EVI-SEC-06 | Reporte | Métricas, vulnerabilidades y bugs exportados de SonarQube (JSON) | 19/11/2026 | qa/security/reportes/sonarqube/ |
| EVI-SEC-07 | Reporte | OWASP ZAP baseline (HTML, JSON, MD) y captura del resumen | 19/11/2026 | qa/security/reportes/zap/zap-baseline.html, evidencias/SEC-ZAP-01-baseline.png |
| EVI-SEC-08 | Reporte | OWASP ZAP full scan (HTML, JSON, MD) y captura del resumen | 19/11/2026 | qa/security/reportes/zap/zap-full.html, evidencias/SEC-ZAP-02-full.png |
| EVI-SEC-09 | Captura | SEC-A01-01: usuario normal recibe "Access Denied" en /admin | 19/11/2026 | qa/security/evidencias/SEC-A01-01.png |
| EVI-SEC-10 | Captura | SEC-A01-02: API de administración rechaza a un usuario normal | 19/11/2026 | qa/security/evidencias/SEC-A01-02.png |
| EVI-SEC-11 | Captura | SEC-A01-03: IDOR bloqueado | 19/11/2026 | qa/security/evidencias/SEC-A01-03.png |
| EVI-SEC-12 | Captura | SEC-A01-04: peticiones sin token CSRF rechazadas | 19/11/2026 | qa/security/evidencias/SEC-A01-04.png |
| EVI-SEC-13 | Captura | SEC-A03-01: cargas XSS del tema mostradas como texto | 19/11/2026 | qa/security/evidencias/SEC-A03-01.png |
| EVI-SEC-14 | Captura | SEC-A03-02: cargas XSS del perfil escapadas | 19/11/2026 | qa/security/evidencias/SEC-A03-02.png |
| EVI-SEC-15 | Captura | SEC-A03-03: XSS reflejado sin ejecución | 19/11/2026 | qa/security/evidencias/SEC-A03-03.png, SEC-A03-03-busqueda.png |
| EVI-SEC-16 | Captura | SEC-A03-04: inyección NoSQL rechazada | 19/11/2026 | qa/security/evidencias/SEC-A03-04.png |
| EVI-SEC-17 | Captura | SEC-A05-01: cabeceras de seguridad y cookie | 19/11/2026 | qa/security/evidencias/SEC-A05-01.png |
| EVI-SEC-18 | Captura | SEC-A05-02: usuarios y rol de admin visibles sin sesión | 19/11/2026 | qa/security/evidencias/SEC-A05-02.png |
| EVI-SEC-19 | Captura | SEC-A07-01: bloqueo de cuenta tras 5 intentos | 19/11/2026 | qa/security/evidencias/SEC-A07-01.png, SEC-A07-01-ui.png |
| EVI-SEC-20 | Captura | SEC-A07-02: enumeración de usuarios y correos | 19/11/2026 | qa/security/evidencias/SEC-A07-02.png |
| EVI-SEC-21 | Captura | SEC-A07-03: IP bloqueada tras 20 logins exitosos | 19/11/2026 | qa/security/evidencias/SEC-A07-03.png, SEC-A07-03-ui.png |
| EVI-SEC-22 | Captura | SEC-A07-04: contraseñas débiles aceptadas | 19/11/2026 | qa/security/evidencias/SEC-A07-04.png |
| EVI-SEC-23 | Captura | SEC-A07-05: sesión destruida al cerrar sesión | 19/11/2026 | qa/security/evidencias/SEC-A07-05.png |
| EVI-SEC-24 | Reporte | Reporte HTML de Playwright de las 15 pruebas OWASP | 19/11/2026 | qa/security/reportes/owasp/html/index.html |
