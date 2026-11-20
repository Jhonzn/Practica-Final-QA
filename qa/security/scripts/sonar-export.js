// Exporta los resultados del análisis de SonarQube (métricas, issues y reglas) a
// qa/security/reportes/sonarqube/ y toma capturas del dashboard como evidencia.
//
// Uso (desde qa/security/owasp, que ya tiene Playwright instalado):
//   NODE_PATH=node_modules SONAR_USER=admin SONAR_PASSWORD=... node ../scripts/sonar-export.js
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

const HOST = process.env.SONAR_URL || 'http://localhost:9000';
const USER = process.env.SONAR_USER || 'admin';
const PASS = process.env.SONAR_PASSWORD;
const KEY = process.env.SONAR_PROJECT || 'nodebb';
const OUT = path.resolve(__dirname, '..', 'reportes', 'sonarqube');
const EVI = path.resolve(__dirname, '..', 'evidencias');
if (!PASS) throw new Error('Definir SONAR_PASSWORD');
const auth = { Authorization: `Basic ${Buffer.from(`${USER}:${PASS}`).toString('base64')}` };

async function api(p) {
  const r = await fetch(`${HOST}${p}`, { headers: auth });
  if (!r.ok) throw new Error(`${p}: HTTP ${r.status}`);
  return r.json();
}

const METRICS = [
  'alert_status', 'bugs', 'vulnerabilities', 'security_hotspots', 'code_smells',
  'reliability_rating', 'security_rating', 'sqale_rating', 'security_review_rating',
  'software_quality_reliability_issues', 'software_quality_security_issues', 'software_quality_maintainability_issues',
  'software_quality_reliability_rating', 'software_quality_security_rating', 'software_quality_maintainability_rating',
  'coverage', 'line_coverage', 'branch_coverage', 'lines_to_cover', 'uncovered_lines',
  'duplicated_lines_density', 'duplicated_lines', 'duplicated_blocks', 'duplicated_files',
  'sqale_index', 'sqale_debt_ratio', 'ncloc', 'lines', 'files', 'functions', 'classes',
  'complexity', 'cognitive_complexity', 'comment_lines_density',
];
const RATING = { 1: 'A', 2: 'B', 3: 'C', 4: 'D', 5: 'E' };

async function allIssues(type) {
  const out = [];
  for (let p = 1; ; p += 1) {
    const d = await api(`/api/issues/search?componentKeys=${KEY}&types=${type}&resolved=false&ps=500&p=${p}`);
    out.push(...d.issues.map(i => ({
      regla: i.rule, severidad: i.severity, archivo: i.component.split(':').slice(1).join(':'),
      linea: i.line ?? null, mensaje: i.message, esfuerzo: i.effort ?? null,
    })));
    if (p * 500 >= d.total || p * 500 >= 10000) break;
  }
  return out;
}

async function facets(type) {
  const d = await api(`/api/issues/search?componentKeys=${KEY}&types=${type}&resolved=false&ps=1&facets=rules,severities,directories`);
  return Object.fromEntries(d.facets.map(f => [f.property, f.values.filter(v => v.count > 0).map(v => [v.val, v.count])]));
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(EVI, { recursive: true });

  const [server, comp, analyses, gate] = await Promise.all([
    api('/api/server/version').catch(async () => (await fetch(`${HOST}/api/server/version`)).text()),
    api(`/api/measures/component?component=${KEY}&metricKeys=${METRICS.join(',')}`),
    api(`/api/project_analyses/search?project=${KEY}&ps=5`),
    api(`/api/qualitygates/project_status?projectKey=${KEY}`),
  ]);
  const medidas = Object.fromEntries(comp.component.measures.map(m => [m.metric, m.value]));

  const tipos = ['BUG', 'VULNERABILITY', 'CODE_SMELL'];
  const resumenTipos = {};
  const reglas = new Set();
  for (const t of tipos) {
    resumenTipos[t] = await facets(t);
    (resumenTipos[t].rules || []).forEach(([r]) => reglas.add(r));
  }
  const nombresReglas = {};
  for (const r of reglas) {
    const d = await api(`/api/rules/show?key=${encodeURIComponent(r)}`);
    nombresReglas[r] = { nombre: d.rule.name, tipo: d.rule.type, severidad: d.rule.severity };
  }
  const vulnerabilidades = await allIssues('VULNERABILITY');
  const bugs = await allIssues('BUG');

  const resumen = {
    fecha_exportacion: new Date().toISOString(),
    sonarqube: typeof server === 'string' ? server : String(server),
    proyecto: KEY,
    analisis: analyses.analyses.map(a => ({ fecha: a.date, version: a.projectVersion })),
    quality_gate: gate.projectStatus,
    medidas,
    calificaciones: {
      reliability: RATING[Math.round(medidas.reliability_rating)],
      security: RATING[Math.round(medidas.security_rating)],
      maintainability: RATING[Math.round(medidas.sqale_rating)],
      security_review: RATING[Math.round(medidas.security_review_rating)],
    },
    desglose: resumenTipos,
    reglas: nombresReglas,
  };
  fs.writeFileSync(path.join(OUT, 'sonarqube-resumen.json'), JSON.stringify(resumen, null, 2));
  fs.writeFileSync(path.join(OUT, 'sonarqube-vulnerabilidades.json'), JSON.stringify(vulnerabilidades, null, 2));
  fs.writeFileSync(path.join(OUT, 'sonarqube-bugs.json'), JSON.stringify(bugs, null, 2));
  console.log('Medidas:', medidas);
  console.log('Calificaciones:', resumen.calificaciones);

  // Capturas del dashboard
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1250 } });
  await page.goto(`${HOST}/sessions/new`);
  await page.locator('#login-input').fill(USER);
  await page.locator('#password-input').fill(PASS);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(u => !u.pathname.startsWith('/sessions'), { timeout: 30000 });

  const fecha = new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' });
  async function captura(url, nombre, espera) {
    await page.goto(`${HOST}${url}`);
    await page.waitForLoadState('networkidle');
    if (espera) await page.locator(espera).first().waitFor({ timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(2500);
    // Cierra avisos promocionales que tapan las métricas
    for (const nombreBoton of ['Dismiss', 'Close']) {
      const b = page.getByRole('button', { name: nombreBoton });
      if (await b.count()) await b.first().click().catch(() => {});
    }
    await page.waitForTimeout(500);
    await page.evaluate(([u, f]) => {
      const d = document.createElement('div');
      d.textContent = `URL: ${u}   ·   ${f}`;
      d.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:2147483647;background:#111;color:#ffeb3b;font:13px Consolas,monospace;padding:4px 8px';
      document.body.appendChild(d);
    }, [page.url(), fecha]);
    await page.screenshot({ path: path.join(EVI, `${nombre}.png`), fullPage: false });
  }
  await captura(`/dashboard?id=${KEY}&codeScope=overall`, 'SEC-SQ-01-dashboard');
  await captura(`/project/issues?id=${KEY}&issueStatuses=OPEN%2CCONFIRMED&types=VULNERABILITY`, 'SEC-SQ-02-vulnerabilidades');
  await captura(`/project/issues?id=${KEY}&issueStatuses=OPEN%2CCONFIRMED&types=BUG`, 'SEC-SQ-03-bugs');
  await captura(`/component_measures?id=${KEY}&metric=coverage&view=list`, 'SEC-SQ-04-cobertura');
  await captura(`/component_measures?id=${KEY}&metric=duplicated_lines_density&view=list`, 'SEC-SQ-05-duplicacion');
  await browser.close();
  console.log('Exportado en', OUT);
})().catch((e) => { console.error(e); process.exit(1); });
