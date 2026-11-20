// Pruebas de seguridad guiadas por el OWASP Top 10 (2021) sobre NodeBB.
// Se ejecutan en serie y en orden (A01 -> A03 -> A05 -> A07) porque las pruebas de
// fuerza bruta bloquean la IP y deben correr al final.
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  globalSetup: require.resolve('./global-setup.js'),
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: '../reportes/owasp/html', open: 'never' }],
    ['json', { outputFile: '../reportes/owasp/resultados-playwright.json' }],
  ],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:4567',
    ...devices['Desktop Chrome'],
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
