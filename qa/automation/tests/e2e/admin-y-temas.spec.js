// CA-09: control de acceso al panel de administracion (tabla de decision, regla R1).
// CA-10: flujo completo de crear un tema desde la interfaz y verlo en /recent.
const { test, expect } = require('@playwright/test');
const { ADMIN, loginUi } = require('../helpers');

test('CA-09 | Un visitante sin sesion no puede entrar a /admin y es enviado a /login (RF11)', async ({ page }) => {
  const res = await page.goto('/admin');
  expect(res.status()).toBeLessThan(500);
  await expect(page).toHaveURL(/\/login/);
  await expect(page.locator('#login-form')).toBeVisible();
  await page.screenshot({ path: 'reports/evidencias/CA-09-admin-sin-sesion.png', fullPage: true });
});

test('CA-10 | Crear un tema desde la interfaz y verlo publicado en /recent (RF05, RF07)', async ({ page }) => {
  const titulo = `Tema E2E Playwright ${Date.now()}`;
  await loginUi(page, ADMIN);
  await expect(page).not.toHaveURL(/\/login/);

  // Abrir la primera categoria y el editor de nuevo tema
  await page.goto('/categories');
  await page.locator('a[href*="/category/"]').first().click();
  await page.locator('#new_topic').click();

  const editor = page.locator('[component="composer"]');
  await expect(editor).toBeVisible();
  await editor.locator('input.title').fill(titulo);
  await editor.locator('textarea.write').fill('Contenido publicado por una prueba automatizada de Playwright.');
  await editor.locator('button.composer-submit:visible').first().click();

  // Al publicar, NodeBB redirige al tema creado
  await expect(page).toHaveURL(/\/topic\//);
  await expect(page.locator('[component="topic/title"]').first()).toContainText(titulo);
  await page.screenshot({ path: 'reports/evidencias/CA-10-tema-creado.png', fullPage: true });

  // El tema aparece en la lista de recientes
  await page.goto('/recent');
  await expect(page.getByText(titulo).first()).toBeVisible();
});
