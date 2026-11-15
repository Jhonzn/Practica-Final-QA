// Configuracion de Playwright para las pruebas de NodeBB.
// Dos proyectos: "api" (integracion contra la API REST) y "e2e" (sistema, en Chromium).
require('dotenv').config();
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1, // NodeBB limita la frecuencia de publicaciones; se ejecuta en serie
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'reports/html', open: 'never' }],
    ['junit', { outputFile: 'reports/junit.xml' }],
  ],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:4567',
    screenshot: 'on', // captura de cada prueba como evidencia
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'api', testDir: './tests/api' },
    { name: 'e2e', testDir: './tests/e2e', use: { ...devices['Desktop Chrome'] } },
  ],
});
