// Captura el resumen de un reporte HTML de OWASP ZAP como evidencia (con ruta y fecha).
// Uso (desde qa/security/owasp): NODE_PATH=node_modules node ../scripts/zap-captura.js zap-baseline SEC-ZAP-01-baseline
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('@playwright/test');

const [reporte, salida] = process.argv.slice(2);
const html = path.resolve(__dirname, '..', 'reportes', 'zap', `${reporte}.html`);
const png = path.resolve(__dirname, '..', 'evidencias', `${salida}.png`);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } });
  await page.goto(pathToFileURL(html).href);
  const fecha = new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' });
  await page.evaluate(([r, f]) => {
    const d = document.createElement('div');
    d.textContent = `Reporte: qa/security/reportes/zap/${r}.html   ·   capturado ${f}`;
    d.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:99999;background:#111;color:#ffeb3b;font:13px Consolas,monospace;padding:4px 8px';
    document.body.appendChild(d);
  }, [reporte, fecha]);
  await page.screenshot({ path: png });
  await browser.close();
  console.log('Captura:', png);
})();
