# Prueba de usabilidad (RNF03) — guía del moderador

Sección 7.5.4 del informe. RNF03 se cumple si **al menos 4 de los 5 participantes** completan las tres tareas **sin ayuda** y en **3 minutos o menos** (tiempo total).

## Antes de empezar (una sola vez)

1. Levantar NodeBB y comprobar que abre `http://localhost:4567`:

   ```powershell
   cd nodebb/NodeBB; docker compose up -d
   ```

2. Asegurar que existe la cuenta de prueba `qa_usuario01` (la crea `node qa/manual/ejecutar-casos.js preparar`). Contraseña: la de `qa/manual/ejecutar-casos.js`, línea 17.
3. Escribir el usuario y la contraseña en una tarjeta de papel para entregarla al participante.
4. Tener un cronómetro (el del celular sirve) y una copia de `registro.csv` abierta.

## Antes de cada participante

- El participante **no debe haber usado NodeBB** (preguntar). Si lo usó, no cuenta.
- Cerrar sesión en NodeBB y dejar el navegador en `http://localhost:4567`.
- Leerle el guion de abajo, entregarle la tarjeta y las tareas impresas.

## Guion (leer en voz alta)

> "Vamos a probar un foro, no a ti. No hay respuestas incorrectas. Te voy a dar tres tareas; hazlas como lo harías en casa. No puedo ayudarte mientras las haces. Si te quedas atascado más de un minuto o quieres rendirte, dímelo. Empiezo el cronómetro cuando digas 'listo'."

## Tareas (entregar impresas)

1. **Iniciar sesión** con el usuario y la contraseña de la tarjeta.
2. **Consultar una categoría**: entra a la categoría "General Discussion" y abre cualquier tema.
3. **Publicar un tema** en esa misma categoría con el título `Prueba usabilidad P<n>` y un texto de al menos una frase.

## Cómo medir

- Cronómetro desde "listo" hasta que el tema publicado aparece en pantalla.
- Por tarea, anotar **Completada**, **Con ayuda** o **No completada**.
- "Con ayuda" = el moderador tuvo que decir o señalar algo. Una pregunta respondida con "haz lo que harías normalmente" no cuenta como ayuda.
- Anotar en observaciones dónde dudó (por ejemplo, "buscó el botón de nuevo tema en la barra superior").
- Si es posible, tomar una captura del tema publicado: `qa/no-funcionales/usabilidad/evidencias/P<n>.png`.

## Al terminar

Llenar `registro.csv` (una fila por participante). Con esos datos se llena la tabla 7.5.4 del informe y se agregan las evidencias EVI-NF al catálogo 7.6.

**Importante:** los datos deben venir de personas reales. Si no se alcanza a hacer la prueba, la sección 7.5.4 debe decir que RNF03 no se evaluó, en lugar de inventar resultados.
