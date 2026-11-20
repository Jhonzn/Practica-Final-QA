# Hallazgos de seguridad – NodeBB 4.16.7

Ejecución: 19/11/2026, ambiente local `http://localhost:4567` (Docker). Referencia: OWASP Top 10:2021.
Riesgo = impacto (1-3) × probabilidad (1-3): 1-2 **Bajo**, 3-4 **Medio**, 6-9 **Alto**.
Las evidencias están en `qa/security/evidencias/` y el detalle de cada prueba en `reportes/owasp/resultados-detalle.json`.

## Hallazgos confirmados

| ID | Vulnerabilidad | OWASP / CWE | Impacto | Probabilidad | Riesgo | Evidencia |
|---|---|---|---|---|---|---|
| VUL-01 | Enumeración de usuarios y correos por el bloqueo compartido `lockout:dummy` | A07:2021 / CWE-204 | 2 | 2 | 4 Medio | SEC-A07-02 |
| VUL-02 | Bloqueo de IP tras 20 inicios de sesión, también exitosos | A07:2021 / CWE-645 | 2 | 2 | 4 Medio | SEC-A07-03, SEC-A07-03-ui |
| VUL-03 | Bloqueo de cualquier cuenta provocado por terceros (5 intentos → 60 min) | A07:2021 / CWE-645 | 2 | 2 | 4 Medio | SEC-A07-01, SEC-A07-01-ui |
| VUL-04 | Política de contraseñas débil por defecto (6 caracteres, zxcvbn ≥ 1) | A07:2021 / CWE-521 | 2 | 2 | 4 Medio | SEC-A07-04 |
| VUL-05 | CSP incompleta: solo `frame-ancestors 'self'` | A05:2021 / CWE-693 | 3 | 1 | 3 Medio | SEC-A05-01, ZAP 10055 |
| VUL-06 | Lista de usuarios y rol de administrador visibles sin sesión | A01:2021 / CWE-200 | 1 | 3 | 3 Medio | SEC-A05-02 |
| VUL-07 | Cabeceras de endurecimiento ausentes y `X-Powered-By: NodeBB` | A05:2021 / CWE-497, CWE-693 | 1 | 2 | 2 Bajo | SEC-A05-01, ZAP 10037/10063/90004/10021 |

## Detalle por hallazgo

### VUL-01 – Enumeración de usuarios y correos (A07)

- **Descripción:** para no revelar si un usuario existe, NodeBB cuenta los intentos fallidos de todos los nombres inexistentes en una sola clave, `lockout:dummy` (`src/user/auth.js`, `User.auth.logAttempt`). Al sexto intento fallido con nombres inexistentes, esa clave se bloquea 60 minutos. Desde ese momento, **cualquier** nombre inexistente responde `account-locked`, mientras que un nombre real con la contraseña equivocada responde `invalid-login-credentials`. Como el login también acepta correo (`allowLoginWith = username-email`) y un correo no registrado se convierte en `__dummy__` (`src/controllers/authentication.js`), el mismo oráculo sirve para correos.
- **Pasos:** 1) `POST /login` 6 veces con nombres inexistentes distintos; 2) `POST /login` con el nombre o correo a comprobar y una clave cualquiera; 3) si responde `invalid-login-credentials`, la cuenta existe.
- **Impacto × probabilidad:** 2 × 2. Los nombres ya son públicos (VUL-06), pero los correos no; conocerlos facilita el phishing y el *credential stuffing*. No requiere sesión ni herramientas, pero sí conocer el mecanismo, y cada IP tiene un máximo de 20 intentos por hora.
- **Mitigación:** usar una clave por nombre inexistente (por ejemplo, `lockout:dummy:<hash del nombre>`) para que se comporte igual que una cuenta real, o no revelar el estado de bloqueo a quien no ha demostrado la contraseña.

### VUL-02 – Bloqueo de IP con inicios de sesión exitosos (A07)

- **Descripción:** `User.auth.logIPAttempt` (`src/user/auth.js`) se llama antes de comparar la contraseña (`src/user/password.js`) y el contador por IP no se reinicia cuando el login es correcto (`clearLoginAttempts` solo limpia el contador del usuario). Tras 20 inicios de sesión en una hora (`ipLoginAttempts`), aunque todos sean válidos, la IP queda bloqueada 1 hora.
- **Pasos:** iniciar sesión 21 veces seguidas con credenciales correctas desde la misma IP; el 21.º responde `ip-locked` y el administrador tampoco puede entrar.
- **Impacto × probabilidad:** 2 × 2. Deja sin acceso a todos los usuarios que comparten IP (NAT de una universidad u oficina). También lo detectó la Persona 2 durante la automatización (sección 8.4, punto 3).
- **Mitigación:** contar solo los intentos fallidos o reiniciar el contador de la IP tras un login exitoso; preferir retrasos progresivos o CAPTCHA a un bloqueo total.

### VUL-03 – Bloqueo de cuentas provocado por terceros (A07)

- **Descripción:** tras 5 contraseñas incorrectas, la cuenta se bloquea 60 minutos (`loginAttempts = 5`, `lockoutDuration = 60`), incluso para su dueño con la clave correcta. Protege contra la fuerza bruta (el diccionario de la prueba no pasó del quinto intento), pero cualquiera puede bloquear una cuenta conocida, por ejemplo `admin`, cuyo nombre y rol son públicos (VUL-06).
- **Impacto × probabilidad:** 2 × 2.
- **Mitigación:** retrasos exponenciales en lugar de bloqueo, desbloqueo por correo, CAPTCHA a partir del tercer fallo y segundo factor (2FA) para administradores.

### VUL-04 – Política de contraseñas débil por defecto (A07)

- **Descripción:** con la configuración por defecto (`minimumPasswordLength = 6`, `minimumPasswordStrength = 1` en la escala 0-4 de zxcvbn), NodeBB rechazó `12345`, `123456`, `abcdef`, `password` y `qwerty12`, pero aceptó `abc123456`, `medellin1`, `nodebb2026` y `Clave123`. OWASP ASVS 2.1.1 y NIST SP 800-63B piden al menos 8 caracteres y comprobar contra listas de contraseñas filtradas.
- **Impacto × probabilidad:** 2 × 2 (el bloqueo de VUL-03 frena la fuerza bruta en línea, pero no el *credential stuffing* distribuido).
- **Mitigación:** en *Admin → Settings → User*, subir la longitud mínima a 8 o más y la fortaleza mínima a 3; añadir una comprobación contra contraseñas filtradas y 2FA.

### VUL-05 – Content-Security-Policy incompleta (A05)

- **Descripción:** la única política enviada es `Content-Security-Policy: frame-ancestors 'self'`. Helmet se inicializa con `contentSecurityPolicy: false` (`src/webserver.js`) y el panel de administración solo permite configurar `frame-ancestors`. El cliente usa `new Function()` para ejecutar plantillas (`public/src/ajaxify.js:503`, SonarQube S1523), lo que obligaría a permitir `unsafe-eval`. ZAP lo reporta como riesgo Medio (regla 10055).
- **Impacto × probabilidad:** 3 × 1. No se encontró ningún XSS (SEC-A03-01 a SEC-A03-03), por eso la probabilidad es baja; pero si un plugin introdujera uno, la CSP no lo contendría.
- **Mitigación:** definir la CSP en el proxy inverso (nginx) con `default-src 'self'`, `object-src 'none'` y `script-src` con nonces; empezar en modo `Content-Security-Policy-Report-Only` y reemplazar `new Function()` por plantillas precompiladas como módulos.

### VUL-06 – Usuarios y administradores visibles sin sesión (A01)

- **Descripción:** sin iniciar sesión, `GET /api/users` devuelve la lista de usuarios y `GET /api/user/admin` devuelve `groupTitle: ["administrators"]`. Es la configuración por defecto (el grupo `guests` tiene el privilegio de ver usuarios).
- **Impacto × probabilidad:** 1 × 3. El dato por sí solo es poco sensible, pero indica a un atacante qué cuentas atacar (VUL-03, VUL-04).
- **Mitigación:** en *Admin → Privileges*, quitar a `guests` el permiso de ver usuarios y perfiles, y no mostrar el grupo `administrators` como insignia pública.

### VUL-07 – Cabeceras de endurecimiento ausentes (A05)

- **Descripción:** todas las respuestas incluyen `X-Powered-By: NodeBB`; faltan `Permissions-Policy` y `Cross-Origin-Embedder-Policy`, y `/favicon.ico` se sirve sin `X-Content-Type-Options` (lo envía `serve-favicon` antes de Helmet).
- **Impacto × probabilidad:** 1 × 2.
- **Mitigación:** en *Admin → Settings → Advanced → Headers*, poner en "Powered By" un valor genérico (dejarlo vacío no sirve, porque `src/middleware/headers.js` vuelve a `NodeBB`) o quitar la cabecera en el proxy; definir `Permissions-Policy` (por ejemplo, `camera=(), microphone=(), geolocation=()`).

## Controles que funcionaron (sin hallazgo)

| Prueba | Control verificado |
|---|---|
| SEC-A01-01, SEC-A01-02 | Un usuario normal no accede a `/admin` ni a la API de administración (403/401) |
| SEC-A01-03 | No hay IDOR: B no puede editar ni borrar el contenido, el perfil ni la contraseña de A |
| SEC-A01-04 | Las peticiones de escritura sin token CSRF válido se rechazan (403) |
| SEC-A03-01 a SEC-A03-03 | El HTML del usuario se escapa en temas, perfiles, búsqueda y etiquetas; los enlaces `javascript:` se descartan |
| SEC-A03-04 | El login rechaza objetos con operadores de MongoDB (sin inyección NoSQL) |
| SEC-A07-01 | La fuerza bruta se detiene en el quinto intento fallido |
| SEC-A07-05 | Cerrar sesión destruye la sesión en el servidor |
| SEC-A05-01 | Cookie de sesión `HttpOnly` y `SameSite=Lax`; X-Frame-Options, nosniff, Referrer-Policy, HSTS y COOP presentes |

## Observación del ambiente (no es un defecto de NodeBB)

El ambiente de pruebas usa HTTP, así que la cookie `express.sid` no lleva el atributo `Secure` y la cabecera HSTS no tiene efecto. NodeBB activa `Secure` automáticamente cuando la URL configurada empieza por `https` (`src/prestart.js:108` y `src/meta/configs.js`). En producción hay que desplegarlo detrás de TLS.
