# Pruebas de seguridad y análisis estático de NodeBB (Persona 3)

Análisis de seguridad de **NodeBB 4.16.7** para el caso práctico final de QA: análisis estático con SonarQube, análisis dinámico con OWASP ZAP y pruebas manuales guiadas por el **OWASP Top 10 (2021)**. Todo se ejecutó el 19/11/2026 en un ambiente local y controlado (`http://localhost:4567`), sin tocar sistemas de terceros.

| Carpeta / archivo | Contenido |
|---|---|
| `docker-compose.yml` | Ambiente de seguridad: NodeBB 4.16.7 (imagen oficial), MongoDB 7 y SonarQube Community |
| `sonarqube/sonar-project.properties` | Configuración del análisis (fuentes, exclusiones, cobertura) |
| `sonarqube/coverage/` | `lcov.info` de las pruebas unitarias de NodeBB (Mocha + nyc) importado en SonarQube |
| `scripts/sonar-scan.sh` | Ejecuta `sonar-scanner` en Docker contra el SonarQube local |
| `scripts/sonar-export.js` | Exporta métricas e issues de SonarQube a JSON y toma las capturas del dashboard |
| `scripts/zap-scan.sh` | Ejecuta el baseline y el full scan de OWASP ZAP |
| `scripts/zap-captura.js` | Captura el resumen de un reporte HTML de ZAP como evidencia |
| `scripts/md2docx.py` | Pasa `10-seguridad.md` y `11-sonarqube.md` a la plantilla del informe (secciones 10 y 11.2-11.3) |
| `owasp/` | Pruebas OWASP Top 10 automatizadas con Playwright (A01, A03, A05, A07) |
| `reportes/sonarqube/` | Resumen de métricas, vulnerabilidades y bugs exportados |
| `reportes/zap/` | Reportes HTML, JSON y Markdown del baseline y del full scan |
| `reportes/owasp/` | Reporte HTML de Playwright y detalle JSON de cada prueba |
| `evidencias/` | Capturas `SEC-*.png` (cada una muestra la URL y la fecha) |
| `hallazgos.md` | Tabla de vulnerabilidades con categoría OWASP, riesgo, evidencia y mitigación |
| `defectos-para-registro.md` | Hallazgos confirmados, listos para registrar como Issues (Persona 4) |
| `10-seguridad.md` | Texto de la sección 10 y de la parte de SonarQube de la sección 11 |

## Cómo reproducir

Requisitos: Docker Desktop, Node.js 20+ y Git Bash. Todos los comandos se ejecutan desde `qa/security`.

```bash
# 1. Ambiente (la primera vez instala NodeBB sin interacción con admin / QaAdmin#2026x)
docker compose up -d mongo sonarqube
docker compose run --rm -e SETUP=1 nodebb
docker compose up -d nodebb            # http://localhost:4567

# 2. SonarQube (http://localhost:9000): cambiar la clave de admin, crear el proyecto "nodebb"
#    y un token de análisis; luego:
export SONAR_TOKEN=squ_xxx
bash scripts/sonar-scan.sh
cd owasp && npm install && npx playwright install chromium
NODE_PATH=node_modules SONAR_PASSWORD=... node ../scripts/sonar-export.js

# 3. OWASP ZAP (baseline + full scan)
bash ../scripts/zap-scan.sh

# 4. Pruebas manuales OWASP Top 10 automatizadas
npx playwright test          # reporte: npm run report
```

La cobertura (`sonarqube/coverage/lcov.info`) se generó con los mismos archivos de prueba que usa el pipeline de CI:
`npx nyc --reporter=lcov mocha test/utils.js test/password.js` en una copia de `nodebb/NodeBB` (92 pruebas aprobadas), y luego se convirtieron las rutas a relativas.

## Notas

- **Las pruebas que fallan son hallazgos, no errores del script.** SEC-A07-02, SEC-A07-03 y SEC-A07-04 fallan a propósito porque comprueban el comportamiento seguro esperado y NodeBB no lo cumple (ver `hallazgos.md`).
- `owasp/global-setup.js` desactiva en el ambiente de pruebas la cola de moderación y las esperas para usuarios nuevos (`postQueue`, `initialPostDelay`, `newbiePostDelay`), para poder publicar las cargas XSS. No cambia la sanitización, que es lo que se evalúa.
- Las pruebas de A07 bloquean cuentas y la IP; `helpers.resetLockouts()` borra los bloqueos en MongoDB antes y después de cada prueba.
- ZAP se ejecuta dentro de la red del contenedor de NodeBB (`--network container:...`), así `http://localhost:4567` apunta a la aplicación y sus enlaces absolutos funcionan. Sus intentos de login bloquean solo la IP interna del contenedor.
- NO ejecutar `docker compose down -v`: borra la base de datos y las evidencias.
