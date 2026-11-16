// CP-A08: valores limite de la longitud del nombre de usuario en el registro (RF01).
// Limites de NodeBB: minimo 2 y maximo 16 caracteres (install/data/defaults.json).
const { test, expect } = require('@playwright/test');

test.describe('Registro de usuarios', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/register');
  });

  async function validarUsuario(page, username) {
    const campo = page.locator('#username');
    await campo.fill(username);
    await campo.blur(); // NodeBB valida el campo al perder el foco
  }

  test('CP-A08a | Usuario de 1 caracter (debajo del minimo) muestra error', async ({ page }) => {
    await validarUsuario(page, 'a');
    await expect(page.locator('#username-notify')).not.toBeEmpty();
    await page.screenshot({ path: 'reports/evidencias/CP-A08a-usuario-1-caracter.png' });
  });

  test('CP-A08b | Usuario de 17 caracteres (encima del maximo) muestra error', async ({ page }) => {
    await validarUsuario(page, 'a'.repeat(17));
    await expect(page.locator('#username-notify')).not.toBeEmpty();
    await page.screenshot({ path: 'reports/evidencias/CP-A08b-usuario-17-caracteres.png' });
  });

  test('CP-A08c | Usuario valido de 16 caracteres permite completar el registro', async ({ page }) => {
    const usuario = `qa${Date.now()}`.slice(0, 16).padEnd(16, 'x');
    expect(usuario).toHaveLength(16);
    await validarUsuario(page, usuario);
    await expect(page.locator('#username-notify')).toBeEmpty();

    await page.locator('#password').fill('Qa-Prueba-2026!');
    await page.locator('#password-confirm').fill('Qa-Prueba-2026!');
    await page.locator('#register').click();

    // NodeBB muestra un paso intermedio (/register/complete) con correo opcional y
    // consentimientos de GDPR (gdpr_enabled = 1). Se aceptan y se envia el formulario.
    await expect(page).toHaveURL(/\/register\/complete/);
    for (const consentimiento of await page.locator('main form input[type="checkbox"]').all()) {
      await consentimiento.check();
    }
    await page.locator('main form button.btn-primary').click();

    await expect.poll(() => page.evaluate(() => window.app && window.app.user && window.app.user.uid)).toBeGreaterThan(0);
    await page.screenshot({ path: 'reports/evidencias/CP-A08c-registro-exitoso.png', fullPage: true });
  });
});
