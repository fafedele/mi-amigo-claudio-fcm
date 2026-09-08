# Gastos compartidos · Claudio

PWA para registrar y repartir gastos entre personas. HTML/CSS/JS vanilla: **sin build, sin dependencias, sin backend**.

**En vivo:** https://fafedele.github.io/mi-amigo-claudio-fcm/

## Cómo funciona

El estado (`gastos`, `proximos`, `todos`) se guarda como JSON en un repo **privado** aparte, vía la GitHub Contents API:

| | |
|---|---|
| Repo de datos | `fafedele/control-de-egresos` (privado) |
| Ruta | `fcm/fcm-data.json` |
| Auth | token fine-grained que el usuario pega en la app |
| Concurrencia | `sha` del archivo como optimistic locking |

El token queda en `localStorage` del dispositivo. **Nunca se commitea ni viaja a ningún servidor propio** — solo a `api.github.com`.

### Token requerido

Fine-grained PAT, acotado a **`control-de-egresos` únicamente**, con:

- **Contents:** Read and write

Nada más. Si el token se filtra, el daño queda contenido en ese repo.

## Cotización del dólar

Los montos en US$ **se calculan** sobre el monto en pesos con la cotización de hoy, en cada render. No se guardan en `fcm-data.json` y ya no se cargan a mano — el input de USD se quitó de los tres formularios.

Antes `monto_usd` era un campo manual, y eso daba tres problemas a la vez: desde julio de 2026 nadie lo completaba (25 de 45 gastos iban como US$0, o sea $1.331.164 sin contar), los que sí estaban usaban cotizaciones de 1.414–1.440 ya viejas, y sumar dólares convertidos en fechas distintas no da un número interpretable.

| | |
|---|---|
| Fuente | `https://dolarapi.com/v1/dolares/{blue\|oficial}` — pública, sin API key, con CORS |
| Cuál | Elegible en **⚙ → Cotización del dólar**. Preferencia por dispositivo (`localStorage`), no dato compartido |
| Sin red | Usa el último valor guardado y lo marca en rojo: *"sin conexión, valor guardado"* |
| Sin red ni valor | Muestra `—`, nunca `US$ 0` |

El valor en uso siempre está a la vista en la barra bajo el título de **Totales**.

Los `monto_usd` viejos siguen en el JSON — no se borran, simplemente ya no se leen.

## Deudas interpersonales

Solapa **Deudas**. A diferencia de *Emparejar* (que dice cuánto le falta a cada uno contra el promedio), acá sale **quién le transfiere a quién y cuánto**.

- **Balance** de cada participante = lo que puso − lo que le tocaba.
- **Liquidación greedy**: el que más debe le paga al que más puso, hasta saldar. Da el mínimo práctico de transferencias (con 1 acreedor y 2 deudores, 2 transferencias).
- **Quiénes reparten**: chips para incluir o excluir personas a mano. Se persiste en `grupo[]`. Vacío = el default histórico `GRUPO_EMPAREJAR`. Lo que puso quien queda afuera **no se reparte** y se muestra en *Fuera del reparto*, para que no desaparezca sin dejar rastro.
- **Pagos**: cada transferencia sugerida tiene *Registrar*, que precarga el formulario. También se cargan a mano. Se guardan en `pagos[]` y corrigen el balance de los dos lados: quien pagó aportó de más, quien cobró recuperó.

### Fijar un saldo a mano

Tocá a una persona en **Balance** y el modal deja escribir cuánto **debe** o cuánto **le deben**, sin depender de los gastos. Queda marcada con el tag *a mano* y su saldo deja de recalcularse; *Volver al cálculo* la devuelve al automático. Los pagos registrados se siguen descontando sobre el valor fijado.

Con saldos a mano la suma puede no dar cero: lo que se debe deja de coincidir con lo que se cobra. Eso **no se reparte a la fuerza** — se avisa el descuadre y se nombra a quién le queda saldo sin contraparte, porque la liquidación greedy salda primero al acreedor más grande y con un ledger desbalanceado los chicos quedan en cero.

Schema nuevo en `fcm-data.json`: `pagos[]`, `grupo[]` y `ajustes{}`. Todos opcionales — un archivo viejo sin esas claves carga igual.

> **Ojo:** una versión de la app anterior a la v9 no conoce esas claves y las borraría al guardar. El service worker es network-first, así que con red cualquier dispositivo toma la v9 al abrir; el riesgo es solo un dispositivo offline con caché vieja.

## Backup de datos

En **Totales → ⚙** está la copia local de `fcm-data.json`: **Copiar JSON** (portapapeles) y **Descargar** (archivo). No pasa por la API ni necesita red — sale del estado ya cargado en memoria.

Sirve para respaldar, para mover los datos a otro lado, o para leerlos desde fuera de la app sin dar acceso al repo privado.

## Concurrencia

El `sha` funciona como optimistic locking. Si otro dispositivo guardó primero, el `PUT` vuelve 409/422 y la app **no reintenta**: un `PUT` con el `sha` fresco pisaría lo que el otro acaba de escribir. En su lugar avisa (*"Otro dispositivo guardó primero"*), recarga el estado real del repo y vuelve a renderizar, así la pantalla nunca muestra un cambio que el repo no tiene. El dato que estabas cargando se pierde y hay que reingresarlo.

`guardarDatos()` devuelve `true`/`false` en vez de tirar excepción — ningún llamador la capturaba.

## Estructura

```
index.html      Markup completo, pantallas como <section class="screen">
app.js          Toda la lógica: estado, API, render, SFX, voz
style.css       Estilos, tema y layout tipo mockup de teléfono
sw.js           Service worker network-first
manifest.json   Manifiesto PWA
assets/         Logo e íconos SVG
scripts/        version.sh: mantiene alineado el cache-busting
.githooks/      pre-commit que bumpea la versión
```

## Desarrollo local

No hay build. Sirve la carpeta con cualquier servidor estático — abrirlo con `file://` rompe el service worker y el manifiesto.

```bash
python3 -m http.server 8000
# http://localhost:8000
```

## Caché y despliegue

Push a `main` → GitHub Pages publica automáticamente.

El service worker es **network-first con fallback a caché**: con red, gana siempre la red y se refresca la caché; sin red, se sirve lo último guardado. Las respuestas de `api.github.com` **no** se cachean nunca (filtro por `origin`).

La versión que rompe caché vive en **4 lugares** repartidos en 3 archivos:

| Archivo | Referencia |
|---|---|
| `index.html` | `style.css?v=N` |
| `index.html` | `app.js?v=N` |
| `sw.js` | `const CACHE = "claudio-fcm-vN"` |
| `app.js` | `navigator.serviceWorker.register("sw.js?v=N")` |

**No se editan a mano.** Un hook de pre-commit las bumpea juntas cuando el commit toca `app.js`, `style.css` o `sw.js`, y mete los tres archivos en el mismo commit. Así el celular nunca queda con una mezcla de versiones — ya pasó una vez que `index.html` pidiera `style.css?v=6` junto a `app.js?v=7`.

En un clon nuevo hay que activarlo una sola vez:

```bash
git config core.hooksPath .githooks
```

El hook **aborta** si hay cambios sin stagear en `index.html`, `sw.js` o `app.js`: el bump los tocaría y un `git add` automático se llevaría trabajo que no pensabas commitear. Stageá o `git stash` y volvé a intentar.

A mano, si hace falta:

```bash
./scripts/version.sh check    # falla si las 4 no coinciden
./scripts/version.sh bump     # todas a max+1
./scripts/version.sh set 20   # todas a 20
./scripts/version.sh print    # la versión actual
```

Un commit que solo toca `README.md` u otros archivos no bumpea nada.

Si un service worker queda pegado: DevTools → Application → Service Workers → *Unregister*.

## Instalación como app

| Plataforma | Cómo |
|---|---|
| Android / Chrome | Menú ⋮ → *Instalar aplicación* |
| iOS / Safari | Compartir → *Agregar a inicio* |
| Escritorio / Chrome | Ícono de instalar en la barra de direcciones |
