// CA-06 y CA-07: autenticacion desde la interfaz (prueba de sistema).
// Particion de equivalencia: credenciales validas (clase valida) / contrasena incorrecta (clase invalida).
const { test, expect } = require('@playwright/test');
const { ADMIN, loginUi } = require('../helpers');

test.describe('Inicio de sesion', () => {
  test('CA-06 | Login con credenciales validas lleva al inicio con la sesion iniciada (RF02)', async ({ page }) => {
    await loginUi(page, ADMIN);

    await expect(page).not.toHaveURL(/\/login/);
    // La configuracion del cliente confirma el usuario autenticado
    const uid = await page.evaluate(() => window.app && window.app.user && window.app.user.uid);
    expect(uid).toBeGreaterThan(0);
    await page.screenshot({ path: 'reports/evidencias/CA-06-login-valido.png', fullPage: true });
  });

  test('CA-07 | Login con contrasena incorrecta muestra un error y no inicia sesion (RF02)', async ({ page }) => {
    // Usuario inexistente para no sumar intentos fallidos al administrador (bloqueo tras 5 intentos, RF03)
    await loginUi(page, { username: `noexiste${Date.now()}`, password: 'ContrasenaIncorrecta1' });

    const error = page.locator('#login-error-notify');
    await expect(error).toBeVisible();
    await expect(error).not.toBeEmpty();
    await expect(page).toHaveURL(/\/login/);
    const uid = await page.evaluate(() => window.app && window.app.user && window.app.user.uid);
    expect(uid).toBe(0);
    await page.screenshot({ path: 'reports/evidencias/CA-07-login-invalido.png', fullPage: true });
  });
});
