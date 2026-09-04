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
