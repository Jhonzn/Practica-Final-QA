## 11.2 Resultados de SonarQube

Análisis del 19/11/2026 (02:46 UTC) con SonarQube Community Build 26.11.0 sobre el código de NodeBB 4.16.7 (`nodebb/NodeBB`, rama `main`), clave de proyecto `nodebb`. Se analizaron 837 archivos y 96.492 líneas de código (JavaScript del servidor y del cliente, instalador y hojas de estilo); se excluyeron dependencias, archivos generados, traducciones y la especificación OpenAPI. La cobertura se importó del `lcov.info` de las pruebas unitarias de Mocha (92 pruebas aprobadas). La configuración está en `qa/security/sonarqube/sonar-project.properties` y los datos exportados en `qa/security/reportes/sonarqube/`.

![EVI-SEC-01. Dashboard de SonarQube (Overall Code) del proyecto NodeBB 4.16.7.](qa/security/evidencias/SEC-SQ-01-dashboard.png)

| Métrica | Valor | Calificación / umbral |
|---|---|---|
| Quality Gate (Sonar way) | Passed | Solo evalúa código nuevo; en un primer análisis no hay código nuevo |
| Bugs | 608 | Reliability Rating **E** (por 3 Blocker) |
| Vulnerabilities | 27 | Security Rating **D** (por 14 Critical) |
| Code Smells | 1.026 | Maintainability Rating **A** |
| Deuda técnica | 2.604 min (≈ 43 h) | Ratio de deuda 0,1 % (A ≤ 5 %) |
| Duplicación | 1,4 % (1.601 líneas, 81 bloques, 44 archivos) | Umbral del Quality Gate: ≤ 3 % |
| Cobertura | 12,7 % (líneas 15,1 %, condiciones 5,8 %) | Umbral del Quality Gate: ≥ 80 % en código nuevo |
| Security Hotspots | 0 | En la versión 26.x se reportan como vulnerabilidades (etiqueta `former-hotspot`) |
| Complejidad ciclomática / cognitiva | 26.603 / 18.439 | 11.109 funciones |
| Densidad de comentarios | 2,9 % | — |

## 11.3 Interpretación técnica

**Las calificaciones de SonarQube exageran el riesgo real y hay que leerlas junto con la revisión manual.** El Reliability Rating E se debe únicamente a 3 bugs Blocker de la regla "Loops should not be infinite" (S2189), y los 3 son falsos positivos: en `src/controllers/admin/dashboard.js:409` la variable `nextDay` sí cambia dentro del bucle mediante `setDate()`, y en `src/database/helpers.js:26` el bucle termina cuando `item` es nulo. Del mismo modo, el Security Rating D proviene de 14 vulnerabilidades Critical que, revisadas una a una (sección 10.2), son usos no sensibles de MD5/SHA-1 o código que solo procesa datos de confianza. En la escala de SonarQube (E si hay un Blocker, D si hay un Critical, C si hay un Major), descartar los falsos positivos lleva la confiabilidad a D por 20 bugs Critical de argumentos sobrantes (S930, inofensivos en los casos revisados, como `getPostsFromUserSet` en `src/controllers/accounts/posts.js`, que recibe un `next` que no usa) y, sin ellos, a C. La seguridad pasaría de D a C por el único caso Major (S2612, `umask('0000')` en `src/webserver.js:340`, que solo aplica si NodeBB escucha en un socket Unix y no en un puerto).

**El hallazgo de confiabilidad que sí importa es el volumen de promesas no manejadas.** 572 de los 608 bugs (94 %) son de la regla S9383: funciones `async` que se llaman sin `await` ni `.catch()`, sobre todo `helpers.formatApiResponse(...)` al final de los controladores de la API de escritura (205 casos en `src/controllers/write`). Si una de esas promesas falla, el error no llega al manejador de Express y Node.js registra un *unhandled rejection*. No se observó ningún fallo durante las pruebas, pero es un riesgo de fiabilidad (RNF04) que conviene corregir añadiendo `await`.

**La mantenibilidad es buena (RNF05).** El ratio de deuda de 0,1 % y la duplicación de 1,4 % indican un código ordenado y sin copias significativas. El 96 % de los code smells (981 de 1.026) son de una sola regla de estilo, S7773 (usar `Number.parseInt` en lugar de `parseInt`), que se corrige de forma automática. Los 28 casos de S8786 (expresiones regulares con retroceso no lineal) merecen más atención porque se relacionan con la disponibilidad.

**La cobertura es baja y depende de la selección de pruebas.** El 12,7 % de SonarQube es menor que el 24,7 % que reporta nyc porque SonarQube cuenta también el código del cliente (`public/src`) y del instalador, que las pruebas de Mocha nunca ejecutan, mientras que nyc solo mide los archivos que se cargan. Las dos cifras salen de solo 2 de los archivos de prueba de NodeBB (`utils.js` y `password.js`, los mismos del pipeline de CI), así que no reflejan la calidad de la suite completa del proyecto. El Quality Gate "Passed" no es una señal de calidad en este caso: sus condiciones solo se aplican al código nuevo, y en un primer análisis todo el código es antiguo.

**Relación con los atributos de calidad.** Mantenibilidad: cumple (A, 0,1 % de deuda, 1,4 % de duplicación). Fiabilidad: riesgo medio por las promesas no manejadas; los Blocker son falsos positivos. Seguridad: el análisis estático no encontró vulnerabilidades explotables, pero la edición Community no hace análisis de flujo de datos (*taint analysis*) para inyección SQL/NoSQL ni XSS, como advierte el propio dashboard; por eso esos riesgos se evaluaron con ZAP y con las pruebas manuales de la sección 10.
