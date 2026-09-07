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

Al cambiar `app.js` o `style.css`, bumpear dos cosas en el mismo commit:

1. El query string en `index.html` (`app.js?v=N`, `style.css?v=N`)
2. La constante `CACHE` en `sw.js` (`claudio-fcm-vN`)

Si un service worker queda pegado: DevTools → Application → Service Workers → *Unregister*.

## Instalación como app

| Plataforma | Cómo |
|---|---|
| Android / Chrome | Menú ⋮ → *Instalar aplicación* |
| iOS / Safari | Compartir → *Agregar a inicio* |
| Escritorio / Chrome | Ícono de instalar en la barra de direcciones |
