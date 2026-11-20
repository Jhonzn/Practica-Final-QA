# 10. Pruebas de seguridad

## 10.1 Metodología y alcance

**Autorización y ambiente.** Todas las pruebas se ejecutaron el 19/11/2026 sobre una instancia propia de NodeBB, desplegada por el equipo en Docker en un equipo local (`http://localhost:4567`). No se atacó ningún sistema de terceros ni la instalación pública de NodeBB. Se usó la imagen oficial `ghcr.io/nodebb/nodebb:4.16.7`, la misma versión del código analizado, con MongoDB 7 y los plugins por defecto, y un proyecto de Docker Compose aparte (`qa/security/docker-compose.yml`) para no alterar los datos del resto del equipo. Las cuentas son de prueba y se crearon para el ejercicio.

**Referencia.** OWASP Top 10:2021. El plan de pruebas prioriza A01 (control de acceso), A03 (inyección y XSS), A05 (configuración insegura) y A07 (fallas de identificación y autenticación); el escaneo de ZAP cubre además otras categorías de forma automática.

**Técnicas aplicadas.**

- **Análisis estático (SAST):** SonarQube Community Build 26.11 sobre el código de `nodebb/NodeBB`, con la cobertura de las pruebas unitarias importada (sección 10.2).
- **Análisis dinámico (DAST):** OWASP ZAP 2.17.0, primero en modo baseline (solo reglas pasivas) y luego con el escaneo completo (activo) contra la aplicación en ejecución (sección 10.3).
- **Pruebas manuales guiadas por el OWASP Top 10:** 15 escenarios diseñados a mano y ejecutados con Playwright (`qa/security/owasp`) para que sean repetibles; cada uno guarda una captura con la URL y la fecha (sección 10.4).

**Valoración del riesgo.** Cada hallazgo se califica como impacto × probabilidad, ambos en escala de 1 (bajo) a 3 (alto). Un producto de 1 a 2 es riesgo **Bajo**, de 3 a 4 **Medio** y de 6 a 9 **Alto**.

**Limitaciones.** El ambiente usa HTTP sin TLS, así que no se evaluó la configuración de cifrado. ZAP se ejecutó sin autenticación; las zonas que requieren sesión se cubrieron con las pruebas manuales. La edición Community de SonarQube no hace análisis de flujo de datos (*taint analysis*) para inyección ni XSS. NodeBB corre en un solo proceso, con una base de datos pequeña y sin plugins de terceros.

## 10.2 Análisis estático – SonarQube

Proyecto / rama analizada: NodeBB 4.16.7, carpeta `nodebb/NodeBB` del repositorio, rama `main` (clave `nodebb`). Se analizaron 837 archivos y 96.492 líneas de código.

Versión de SonarQube y configuración: SonarQube Community Build 26.11.0 (Docker `sonarqube:community`), perfil de calidad y Quality Gate por defecto ("Sonar way"), `sonar-scanner-cli` en Docker. Fuentes: `src`, `public/src`, `install` y los archivos de arranque; se excluyen `node_modules`, `build`, `public/vendor`, traducciones y OpenAPI. Cobertura: `lcov.info` de Mocha + nyc (92 pruebas de `test/utils.js` y `test/password.js`). Script: `qa/security/scripts/sonar-scan.sh`.

| Indicador | Resultado | Unidad / interpretación | Evidencia |
|---|---|---|---|
| Bugs | 608 | 3 Blocker, 20 Critical, 585 Major. El 94 % (572) son promesas sin `await` ni `.catch()` (regla S9383). Los 3 Blocker ("bucle infinito", S2189) son falsos positivos tras revisar el código. | EVI-SEC-03 |
| Vulnerabilities | 27 | 14 Critical, 1 Major, 12 Minor. Son antiguos *security hotspots* (etiqueta `former-hotspot`) que exigen revisión manual; tras revisarlos, ninguno es explotable en la configuración evaluada (tabla siguiente). | EVI-SEC-02 |
| Code Smells | 1.026 | 3 Blocker, 41 Major, 982 Minor. 981 son de estilo (S7773, `Number.parseInt` en vez de `parseInt`); 28 son expresiones regulares con retroceso no lineal (S8786). Deuda: 2.604 min (≈ 43 h). | EVI-SEC-01 |
| Duplicación | 1,4 % | 1.601 líneas en 81 bloques de 44 archivos. Muy baja, por debajo del 3 % del Quality Gate. | EVI-SEC-05 |
| Coverage | 12,7 % | Cobertura de líneas 15,1 % y de condiciones 5,8 % (47.509 de 55.926 líneas sin cubrir). Solo se ejecutan 2 archivos de prueba; el código del cliente no se cubre con Mocha. | EVI-SEC-04 |
| Maintainability Rating | A | Ratio de deuda de 0,1 % (A ≤ 5 %). El código es fácil de mantener. | EVI-SEC-01 |
| Reliability Rating | E | Lo causan los 3 Blocker, que son falsos positivos. El riesgo real son las 572 promesas no manejadas. | EVI-SEC-01, EVI-SEC-03 |
| Security Rating | D | Lo causan 14 vulnerabilidades Critical; tras la revisión manual, 10 son falsos positivos y 4 tienen riesgo bajo. | EVI-SEC-01, EVI-SEC-02 |

![EVI-SEC-02. Vulnerabilidades reportadas por SonarQube, ordenadas por prioridad.](qa/security/evidencias/SEC-SQ-02-vulnerabilidades.png)

**Análisis técnico.** Las 27 vulnerabilidades se revisaron una a una en el código fuente:

| Regla (casos) | Ubicación | Revisión manual | Veredicto |
|---|---|---|---|
| S4790 Hash débil (10) | `src/controllers/write/users.js:212`, `src/image.js:168`, `src/posts/uploads.js:23`, `src/user/uploads.js:12`, `src/activitypub/mocks.js:10` y 5 migraciones en `src/upgrades` | MD5 se usa para ETags y nombres de archivos subidos o temporales, no para contraseñas ni firmas. Las contraseñas usan bcrypt con 12 rondas (`src/user/password.js`). La excepción es la migración 1.10.0, que guarda SHA-1(IP + secreto) para seudonimizar direcciones IP. | Falso positivo (9); riesgo bajo (1): usar HMAC-SHA-256 |
| S1523 Ejecución dinámica de código (2) | `public/src/ajaxify.js:503` y `:505` | `new Function()` ejecuta las plantillas compiladas que el navegador descarga del mismo origen (`/assets/templates`); no usa datos del usuario. Sin embargo, obliga a permitir `unsafe-eval` y explica por qué NodeBB no define una CSP con `script-src` (VUL-05). | Riesgo bajo, ligado a VUL-05 |
| S5852 Expresión regular con retroceso exponencial (1) | `src/admin/search.js:50` | Procesa los archivos de traducción del servidor para el buscador del panel de administración; no recibe datos del usuario. | Falso positivo |
| S2598 Destino de archivos subidos (1) | `src/middleware/multer.js:11` | Los archivos van al directorio temporal del sistema; luego `src/controllers/uploads.js` valida la extensión (`allowedFileExtensions`) y el tamaño (`maximumFileSize`). | Riesgo bajo aceptado |
| S2612 Permisos de archivo (1) | `src/webserver.js:340` | `umask('0000')` solo se aplica si NodeBB escucha en un socket Unix. | No aplica (se usa el puerto 4567) |
| S5332 Protocolo en texto plano (7) | `public/src/utils.common.js:623`, `src/controllers/home.js:33`, `osd.js:23`, `well-known.js:77`, `src/routes/well-known.js:22`, `src/emailer.js:32` y `:168` | Cinco son URLs base ficticias o identificadores de espacios de nombres (`http://dummybase`, `http://webfinger.net/rel/...`), no conexiones. Los dos de `emailer.js` crean el transporte SMTP, que viaja sin cifrar si el administrador no activa TLS. | Falso positivo (5); configuración (2) |
| S4036 Comando con PATH (4) | `src/cli/running.js`, `src/cli/manage.js`, `install/web.js` | La CLI de administración ejecuta `node`, `npm` o `tail` en el servidor; requiere acceso al sistema operativo. | Riesgo bajo aceptado |
| S5689 Divulgación de versión (1) | `install/web.js:22` | Express del instalador web envía `X-Powered-By`; solo funciona durante la instalación. | Bajo, ligado a VUL-07 |

En resumen, el análisis estático **no encontró vulnerabilidades explotables**: de los 27 casos, 15 son falsos positivos, 1 no aplica al despliegue evaluado y 11 son de riesgo bajo o dependen de la configuración. El dato más útil para la seguridad es indirecto: el uso de `new Function()` en el cliente impide aplicar una CSP estricta (VUL-05). Para la fiabilidad, las 572 promesas no manejadas son el punto a corregir (sección 11.3).

## 10.3 Análisis dinámico – OWASP ZAP

URL objetivo autorizada: `http://localhost:4567` (instancia propia en Docker).

Tipo de análisis: Baseline (spider de 3 min y reglas pasivas) y Full scan (spider de 5 min, spider AJAX y escaneo activo con la política por defecto), ambos sin autenticación.

Configuración y fecha: OWASP ZAP 2.17.0 (`zaproxy/zap-stable`), 19/11/2026. ZAP se ejecutó dentro de la red del contenedor de NodeBB (`--network container:nodebb-qa-sec-nodebb-1`) para que `localhost:4567` y los enlaces absolutos de NodeBB apunten a la aplicación. Escaneo activo limitado a 30 minutos en total y 4 minutos por regla. Script: `qa/security/scripts/zap-scan.sh`; reportes en `qa/security/reportes/zap/`.

**Resultados.** El baseline recorrió 729 endpoints y el full scan 2.893 URLs. Ninguno de los dos produjo alertas de riesgo **Alto**, y el escaneo activo no encontró vulnerabilidades: pasaron las 136 reglas evaluadas, entre ellas inyección SQL y NoSQL (MongoDB, también por tiempo), XSS reflejado, persistente y basado en DOM, path traversal, inclusión remota de archivos, inyección de comandos y de plantillas, redirección externa, XXE y ausencia de tokens anti-CSRF. Todas las alertas son pasivas y se refieren a cabeceras HTTP:

| ID | Hallazgo | Nivel de riesgo | URL / componente | Evidencia |
|---|---|---|---|---|
| ZAP-01 | CSP: falta definir directivas sin *fallback* (`script-src`, `style-src`, `default-src`); ZAP la trata como comodín y con `unsafe-inline` (regla 10055, 4 variantes) | Medio | `/`, `/login` y demás páginas HTML: `Content-Security-Policy: frame-ancestors 'self'` | EVI-SEC-07, EVI-SEC-08 → VUL-05 |
| ZAP-02 | El servidor revela la tecnología en `X-Powered-By: NodeBB` (10037) | Bajo | Todas las respuestas | EVI-SEC-07, EVI-SEC-08 → VUL-07 |
| ZAP-03 | Falta la cabecera `Permissions-Policy` (10063) | Bajo | Páginas HTML | EVI-SEC-07, EVI-SEC-08 → VUL-07 |
| ZAP-04 | Falta `Cross-Origin-Embedder-Policy` (90004) | Bajo | Páginas HTML y sitemaps | EVI-SEC-07, EVI-SEC-08 → VUL-07 |
| ZAP-05 | Falta `X-Content-Type-Options` (10021) | Bajo | `/favicon.ico` (lo sirve `serve-favicon` antes de Helmet) | EVI-SEC-07, EVI-SEC-08 → VUL-07 |
| ZAP-06 | Funciones JavaScript peligrosas: `eval(` (10110) | Bajo | `/assets/nodebb.min.js` | EVI-SEC-08; coincide con S1523 de SonarQube (`new Function`) |
| ZAP-07 | Divulgación de IP privada (2) | Bajo – **falso positivo** | `/assets/language/en-GB/client.min.js`: es el texto de ejemplo `192.168.100.0` de una traducción | EVI-SEC-08 |
| ZAP-08 | Comentarios sospechosos, contenido cacheable, aplicación web moderna, petición de autenticación y gestión de sesión (10027, 10049, 10109, 10111, 10112) | Informativo | Varias | EVI-SEC-08; descriptivos, sin riesgo |
| ZAP-09 | Atributo HTML controlable por el usuario (posible XSS) (10031) | Informativo – **falso positivo** | `/search?term=...` | EVI-SEC-08; el valor se escapa, como confirmó SEC-A03-03 |

![EVI-SEC-08. Resumen del reporte del full scan de OWASP ZAP: 0 alertas altas, 4 medias (todas de CSP), 6 bajas y 7 informativas.](qa/security/evidencias/SEC-ZAP-02-full.png)

**Análisis.** Las alertas de ZAP coinciden con lo observado manualmente en SEC-A05-01: NodeBB tiene una buena base de cabeceras (X-Frame-Options, HSTS, Referrer-Policy, COOP, cookie HttpOnly), pero no define una CSP completa y revela la tecnología. Las 4 alertas de riesgo Medio son variantes de un mismo problema (VUL-05). Que el escaneo activo no encontrara inyecciones ni XSS concuerda con las pruebas manuales; sin embargo, al no estar autenticado, ZAP no probó los formularios de publicación ni del perfil, y por eso esos casos se cubrieron en la sección 10.4.

## 10.4 Pruebas manuales guiadas por el OWASP Top 10

Los escenarios se diseñaron a partir del OWASP Top 10 y del código de NodeBB (por ejemplo, `src/user/auth.js` para los bloqueos de login) y se ejecutaron con Playwright contra la aplicación en ejecución, con un usuario administrador y usuarios normales creados para cada prueba. Comando: `npx playwright test` en `qa/security/owasp`; reporte HTML en `qa/security/reportes/owasp/html`.

| ID | OWASP | Prueba | Resultado obtenido | Estado | Evidencia |
|---|---|---|---|---|---|
| SEC-A01-01 | A01 | Usuario sin rol de administrador abre `/admin` | Página "Access Denied" (HTTP 403), sin elementos del panel | Seguro | EVI-SEC-09 |
| SEC-A01-02 | A01 | Usuario normal llama a 6 rutas de administración (ajustes, crear usuarios, unirse al grupo `administrators`, analíticas) | Todas responden 403 o 401; el usuario sigue fuera del grupo | Seguro | EVI-SEC-10 |
| SEC-A01-03 | A01 | IDOR: el usuario B edita o borra el post y el tema de A, y cambia el perfil y la contraseña de A | 403 o 401 en las 5 peticiones; los datos de A quedan intactos | Seguro | EVI-SEC-11 |
| SEC-A01-04 | A01 | Crear un tema con sesión válida sin token CSRF y con un token falso | 403 "invalid-csrf-token" en ambos casos | Seguro | EVI-SEC-12 |
| SEC-A03-01 | A03 | XSS almacenado: 11 cargas en el título y el contenido de un tema (`script`, `onerror`, `svg onload`, `javascript:`, `iframe`, `details ontoggle`) | El HTML se muestra escapado como texto, el Markdown legítimo sí se renderiza y no se ejecuta ningún script | Seguro | EVI-SEC-13 |
| SEC-A03-02 | A03 | XSS almacenado en el perfil: nombre, ubicación, sitio web `javascript:`, "Sobre mí" y firma | Todo se muestra escapado; no hay enlaces `javascript:` ni scripts ejecutados | Seguro | EVI-SEC-14 |
| SEC-A03-03 | A03 | XSS reflejado en la búsqueda, en `/login?next=javascript:` y en `/tags/` | Sin ejecución de scripts ni atributos `on*` en el DOM | Seguro | EVI-SEC-15 |
| SEC-A03-04 | A03 | Inyección NoSQL en `/login` con operadores de MongoDB (`$ne`, `$gt`, `$regex`) | 403 en los 3 casos, sin sesión iniciada | Seguro | EVI-SEC-16 |
| SEC-A05-01 | A05 | Cabeceras de seguridad y atributos de la cookie de sesión | Presentes: X-Frame-Options, nosniff, Referrer-Policy, HSTS, COOP, HttpOnly y SameSite=Lax. Ausentes o débiles: CSP (solo `frame-ancestors`), Permissions-Policy, `X-Powered-By: NodeBB` y Secure (por usar HTTP) | Hallazgo (VUL-05, VUL-07) | EVI-SEC-17 |
| SEC-A05-02 | A05 / A01 | Información visible para un visitante sin sesión | `/api/users` lista todos los usuarios y `/api/user/admin` muestra que la cuenta pertenece a `administrators`. Los errores no muestran trazas y no hay listado de directorios | Hallazgo (VUL-06) | EVI-SEC-18 |
| SEC-A07-01 | A07 | Fuerza bruta con un diccionario contra una cuenta | Intentos 1 a 5: credenciales inválidas; intento 6 y luego la clave correcta: "account-locked" durante 60 min | Control efectivo; hallazgo (VUL-03) | EVI-SEC-19 |
| SEC-A07-02 | A07 | Comparar los mensajes de login de usuarios y correos existentes e inexistentes, antes y después de 6 intentos fallidos con usuarios inexistentes | Antes: mensaje idéntico. Después: los inexistentes responden "account-locked" y los existentes "invalid-login-credentials", tanto por nombre como por correo | Hallazgo (VUL-01) | EVI-SEC-20 |
| SEC-A07-03 | A07 | 21 inicios de sesión **exitosos** seguidos desde la misma IP | El 21.º responde "ip-locked", y el administrador tampoco puede entrar durante 1 hora | Hallazgo (VUL-02) | EVI-SEC-21 |
| SEC-A07-04 | A07 | Política de contraseñas: crear cuentas con 9 contraseñas débiles o comunes | Rechaza `12345`, `123456`, `abcdef`, `password` y `qwerty12`; acepta `abc123456`, `medellin1`, `nodebb2026` y `Clave123` | Hallazgo (VUL-04) | EVI-SEC-22 |
| SEC-A07-05 | A07 | Reutilizar la cookie de sesión después de cerrar sesión | El servidor destruye la sesión: con la cookie anterior el usuario es invitado (uid 0) | Seguro | EVI-SEC-23 |

Resultado: de 15 escenarios, 9 confirman que el control funciona y 6 revelan hallazgos. NodeBB resiste bien los ataques clásicos: el control de acceso por roles, la protección contra IDOR y CSRF, el escape de HTML en todo el contenido del usuario y la validación de tipos en el login funcionaron en todos los casos. Los problemas están en el **diseño de los bloqueos de autenticación** (A07) y en la **configuración por defecto** (A05).

![EVI-SEC-13. SEC-A03-01: las cargas XSS del tema se muestran como texto escapado; el Markdown legítimo se renderiza.](qa/security/evidencias/SEC-A03-01.png)

![EVI-SEC-20. SEC-A07-02: después del bloqueo compartido, los usuarios inexistentes y los existentes reciben mensajes distintos.](qa/security/evidencias/SEC-A07-02.png)

![EVI-SEC-21. SEC-A07-03: tras 20 inicios de sesión exitosos desde la misma IP, el administrador tampoco puede entrar.](qa/security/evidencias/SEC-A07-03-ui.png)

## 10.5 Análisis de riesgos y mitigación

| ID | Hallazgo y categoría | Impacto potencial | Riesgo (I × P) | Recomendación de mitigación | Estado |
|---|---|---|---|---|---|
| VUL-01 | Enumeración de usuarios y correos por el bloqueo compartido `lockout:dummy` (`src/user/auth.js`). A07:2021, CWE-204. EVI-SEC-20 | Confirmar qué correos están registrados (no son públicos) para phishing o *credential stuffing* dirigido | 2 × 2 = 4 **Medio** | Usar un contador por nombre inexistente (p. ej. `lockout:dummy:<hash>`) o no revelar el estado de bloqueo a quien no ha demostrado la contraseña | Abierto, reportado a la Persona 4 |
| VUL-02 | La IP se bloquea tras 20 inicios de sesión, también exitosos (`logIPAttempt` antes de comparar la contraseña). A07:2021, CWE-645. EVI-SEC-21 | Todos los usuarios que comparten IP (universidad, oficina) quedan sin acceso 1 hora, incluido el administrador | 2 × 2 = 4 **Medio** | Contar solo los intentos fallidos o reiniciar el contador de la IP tras un login exitoso; retrasos progresivos o CAPTCHA en vez de bloqueo total | Abierto |
| VUL-03 | Bloqueo de cualquier cuenta provocado por terceros (5 fallos → 60 min). A07:2021, CWE-645. EVI-SEC-19 | Un atacante deja sin acceso a una cuenta conocida, por ejemplo `admin`, con 6 peticiones anónimas | 2 × 2 = 4 **Medio** | Retrasos exponenciales, desbloqueo por correo, CAPTCHA desde el tercer fallo y 2FA para administradores | Abierto (compromiso de diseño) |
| VUL-04 | Política de contraseñas débil por defecto (6 caracteres, zxcvbn ≥ 1). A07:2021, CWE-521. EVI-SEC-22 | Se aceptan contraseñas predecibles (`Clave123`, `medellin1`), lo que facilita el robo de cuentas | 2 × 2 = 4 **Medio** | *Admin → Settings → User*: longitud mínima 8 o más y fortaleza 3; comprobar contra contraseñas filtradas; 2FA | Abierto (configuración) |
| VUL-05 | CSP incompleta: solo `frame-ancestors 'self'`. A05:2021, CWE-693. ZAP-01, EVI-SEC-17 | Si un plugin introdujera un XSS, nada limitaría los scripts ejecutados (robo de cuentas, incluida la del administrador) | 3 × 1 = 3 **Medio** | Definir la CSP en el proxy inverso (`default-src 'self'`, `object-src 'none'`, `script-src` con nonces), primero en modo *Report-Only*; reemplazar `new Function()` en `ajaxify.js` | Abierto |
| VUL-06 | Lista de usuarios y rol de administrador visibles sin sesión (`/api/users`, `/api/user/admin`). A01:2021, CWE-200. EVI-SEC-18 | Un visitante anónimo sabe qué cuentas son administradoras y las elige como objetivo de VUL-03 y VUL-04 | 1 × 3 = 3 **Medio** | *Admin → Privileges*: quitar a `guests` el permiso de ver usuarios; no mostrar `administrators` como insignia pública | Abierto (configuración) |
| VUL-07 | `X-Powered-By: NodeBB`; sin Permissions-Policy ni COEP; `/favicon.ico` sin nosniff. A05:2021, CWE-497 y CWE-693. ZAP-02 a ZAP-05, EVI-SEC-17 | Facilita identificar la plataforma y buscar vulnerabilidades conocidas; menos defensa en profundidad | 1 × 2 = 2 **Bajo** | *Admin → Settings → Advanced*: "Powered By" con un valor genérico (vacío vuelve a `NodeBB`) y definir `Permissions-Policy` | Abierto |

Todos los hallazgos se entregaron a la Persona 4 para registrarlos como defectos en GitHub Issues (`qa/security/defectos-para-registro.md`). VUL-01, VUL-02 y VUL-03 tienen la misma raíz: el diseño de los bloqueos de inicio de sesión en `src/user/auth.js`. Corregir ese módulo (contadores por cuenta e IP solo para fallos, retrasos progresivos en vez de bloqueos totales) resolvería VUL-01, VUL-02 y VUL-03 a la vez.

## 10.6 Conclusiones de seguridad

**Exposición general: baja a media.** No se encontró ninguna vulnerabilidad de riesgo Alto ni ninguna que permita, por sí sola, leer o modificar datos ajenos o ejecutar código. Las tres fuentes de evidencia coinciden: SonarQube no halló vulnerabilidades explotables en el código, el escaneo activo de ZAP superó las 136 reglas sin alertas de inyección ni XSS, y las pruebas manuales confirmaron que funcionan el control de acceso por roles (A01), la protección contra IDOR y CSRF, el escape de HTML (A03), la defensa contra inyección NoSQL y la destrucción de la sesión al cerrarla. Se cumple el requisito RNF02: ni los visitantes ni los usuarios sin privilegios ejecutaron operaciones restringidas.

**Hallazgos confirmados:** 7 (6 de riesgo Medio y 1 Bajo), concentrados en dos áreas: el diseño de los bloqueos de autenticación (A07: enumeración de usuarios y correos, bloqueo de IP con logins exitosos, bloqueo de cuentas por terceros, contraseñas débiles) y la configuración por defecto (A05/A01: CSP incompleta, información pública de usuarios, cabeceras). El hallazgo más relevante es VUL-01, porque contradice el objetivo explícito del código (evitar la enumeración, CWE-203) y revela correos que no son públicos.

**Falsos positivos revisados:** en SonarQube, 15 de 27 vulnerabilidades (MD5 para ETags y nombres de archivo, URLs de espacios de nombres, una expresión regular sobre datos de confianza) y los 3 bugs Blocker de "bucle infinito"; en ZAP, la "IP privada" de un texto de traducción y el "posible XSS" en la búsqueda.

**Limitaciones:** ambiente HTTP sin TLS, ZAP sin autenticación, SonarQube Community sin análisis de flujo de datos, un solo proceso de NodeBB y solo los plugins por defecto. Los resultados no equivalen a una auditoría de producción.

**Acciones recomendadas, por prioridad:** 1) reforzar la política de contraseñas y restringir la información pública de usuarios (VUL-04 y VUL-06; son cambios de configuración inmediatos); 2) rediseñar los contadores de `src/user/auth.js` (VUL-01 a VUL-03); 3) desplegar con TLS detrás de un proxy inverso que añada una CSP completa y elimine `X-Powered-By` (VUL-05 y VUL-07); 4) habilitar 2FA para los administradores.
