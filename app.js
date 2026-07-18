/* App estática de Gastos compartidos (FCM). Corre 100% en el navegador y
   guarda los datos en un JSON del repo privado vía la API de GitHub. */

const REPO_OWNER = "fafedele";
const REPO_NAME = "control-de-egresos";
const DATA_PATH = "fcm/fcm-data.json";
const API = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${DATA_PATH}`;

const COLORES = ["#C63D28", "#2C5F8A", "#8E4585", "#3F9B4E", "#E0A82E", "#3A3A3A"];
const GRUPO_EMPAREJAR = ["FEFE", "MARCO", "CODA"];

let estado = { gastos: [], proximos: [] };
let sha = null;
let token = localStorage.getItem("gh_token") || "";

/* ---------- utilidades ---------- */
const fmtARS = (n) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 }).format(n || 0);
const fmtUSD = (n) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n || 0);
const esEgreso = (g) => (g.tipo || "egreso").toLowerCase() !== "ingreso";
const nextId = (arr) => (arr.reduce((m, x) => Math.max(m, x.id || 0), 0) + 1);

function b64encode(str) {
  return btoa(unescape(encodeURIComponent(str)));
}
function b64decode(str) {
  return decodeURIComponent(escape(atob(str)));
}

function badge(txt, ok) {
  const b = document.getElementById("sync-badge");
  b.textContent = txt;
  b.className = "sync-badge show" + (ok === false ? " err" : "");
  clearTimeout(b._t);
  b._t = setTimeout(() => { b.className = "sync-badge"; }, 2500);
}

/* ---------- GitHub API ---------- */
async function cargarDatos() {
  const r = await fetch(API + "?ref=main&t=" + Date.now(), {
    headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json" },
    cache: "no-store",
  });
  if (r.status === 401) throw new Error("Token inválido o vencido");
  if (r.status === 403) throw new Error("El token no tiene permiso (necesita Contents: read & write)");
  if (r.status === 404) throw new Error("No encontré los datos. Revisá que el token tenga acceso al repo 'control-de-egresos'");
  if (!r.ok) throw new Error("Error " + r.status);
  const j = await r.json();
  sha = j.sha;
  const data = JSON.parse(b64decode(j.content));
  estado = { gastos: data.gastos || [], proximos: data.proximos || [] };
}

async function guardarDatos(mensaje) {
  badge("Guardando…");
  const body = {
    message: mensaje || "Actualiza gastos FCM",
    content: b64encode(JSON.stringify({ ...estado, actualizado: new Date().toISOString().slice(0, 10) }, null, 2)),
    branch: "main",
  };
  if (sha) body.sha = sha;
  const r = await fetch(API, {
    method: "PUT",
    headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) { badge("No se pudo guardar", false); throw new Error("PUT " + r.status); }
  const j = await r.json();
  sha = j.content.sha;
  badge("Guardado ✓");
}

/* ---------- navegación ---------- */
function goScreen(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
  const nav = document.getElementById("bottom-nav");
  const conNav = ["screen-totales", "screen-porid", "screen-proximos"].includes(id);
  nav.classList.toggle("hidden", !conNav);
  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.screen === id));
}

/* ---------- render ---------- */
function agrupar(arr, keyFn) {
  const m = {};
  arr.forEach((g) => { const k = keyFn(g) || "Otro"; m[k] = (m[k] || 0) + Number(g.monto_ars || 0); });
  return Object.entries(m).sort((a, b) => b[1] - a[1]);
}
function renderBars(contId, pares) {
  const cont = document.getElementById(contId);
  cont.innerHTML = "";
  const max = Math.max(...pares.map((p) => p[1]), 1);
  pares.forEach(([label, valor], i) => {
    const pct = Math.max((valor / max) * 100, 4);
    const row = document.createElement("div");
    row.className = "bar-row";
    row.innerHTML = `<span class="bar-label">${label}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${COLORES[i % COLORES.length]}"></div></div>
      <span class="bar-amount">${fmtARS(valor)}</span>`;
    cont.appendChild(row);
  });
  if (!pares.length) cont.innerHTML = '<p style="color:var(--antracita);font-size:13px">Sin datos aún.</p>';
}

function renderTotales() {
  const g = estado.gastos, egresos = g.filter(esEgreso);
  document.getElementById("tot-ars").textContent = fmtARS(egresos.reduce((s, x) => s + Number(x.monto_ars || 0), 0));
  document.getElementById("tot-usd").textContent = fmtUSD(egresos.reduce((s, x) => s + Number(x.monto_usd || 0), 0));
  document.getElementById("tot-cant").textContent = g.length;
  renderBars("bars-mes", agrupar(egresos, (x) => x.mes));
  renderBars("bars-concepto", agrupar(egresos, (x) => x.concepto));
  const cont = document.getElementById("lista-gastos");
  cont.innerHTML = "";
  const orden = g.slice().sort((a, b) =>
    (b.fecha || "").localeCompare(a.fecha || "") || (b.id || 0) - (a.id || 0));
  orden.forEach((x) => {
    const row = document.createElement("div");
    row.className = "mov-item";
    row.innerHTML = `<div class="mov-avatar">${(x.id_persona || "?").slice(0, 2)}</div>
      <div class="mov-info"><div class="mov-desc">${x.concepto || ""}</div>
        <div class="mov-meta">${x.id_persona || ""} · ${x.fecha || ""}</div></div>
      <div class="mov-right"><div class="mov-amount ${esEgreso(x) ? "egreso" : "ingreso"}">${esEgreso(x) ? "-" : "+"}${fmtARS(x.monto_ars)}</div>
        <div class="mov-usd">${fmtUSD(x.monto_usd)}</div></div>
      <button class="mov-del" data-id="${x.id}">✕</button>`;
    cont.appendChild(row);
  });
  cont.querySelectorAll(".mov-del").forEach((b) => b.addEventListener("click", async (e) => {
    estado.gastos = estado.gastos.filter((y) => y.id != e.currentTarget.dataset.id);
    render(); await guardarDatos("Elimina gasto FCM");
  }));
}

function renderPorId() {
  const egresos = estado.gastos.filter(esEgreso);
  const porId = {};
  egresos.forEach((g) => {
    const k = g.id_persona || "Otro";
    if (!porId[k]) porId[k] = { ars: 0, usd: 0, n: 0 };
    porId[k].ars += Number(g.monto_ars || 0); porId[k].usd += Number(g.monto_usd || 0); porId[k].n += 1;
  });
  const orden = Object.entries(porId).sort((a, b) => b[1].ars - a[1].ars);
  const cont = document.getElementById("cards-porid");
  cont.innerHTML = "";
  orden.forEach(([persona, d], i) => {
    const card = document.createElement("div");
    card.className = "porid-card"; card.style.borderColor = COLORES[i % COLORES.length];
    card.innerHTML = `<div class="porid-avatar" style="background:${COLORES[i % COLORES.length]}">${persona.slice(0, 2)}</div>
      <div class="porid-body"><div class="porid-name">${persona}</div>
        <div class="porid-meta">${d.n} movimiento${d.n !== 1 ? "s" : ""}</div></div>
      <div class="porid-amounts"><div class="porid-ars">${fmtARS(d.ars)}</div><div class="porid-usd">${fmtUSD(d.usd)}</div></div>`;
    cont.appendChild(card);
  });
  if (!orden.length) cont.innerHTML = '<p style="color:var(--antracita);font-size:13px">Sin datos aún.</p>';
  renderBars("bars-porid", orden.map(([p, d]) => [p, d.ars]));
  renderEmparejar(porId);
}

function renderEmparejar(porId) {
  const cont = document.getElementById("emparejar");
  const montos = GRUPO_EMPAREJAR.map((p) => (porId[p] ? porId[p].ars : 0));
  const total = montos.reduce((a, b) => a + b, 0), prom = total / GRUPO_EMPAREJAR.length, max = Math.max(...montos, 1);
  let html = `<div class="empar-meta">Meta (promedio): <b>${fmtARS(prom)}</b> c/u</div>`;
  GRUPO_EMPAREJAR.forEach((persona, i) => {
    const monto = montos[i], diff = monto - prom;
    const pct = Math.max((monto / max) * 100, 3), metaPct = (prom / max) * 100;
    const bdg = diff < -0.5 ? `<span class="empar-badge falta">Falta ${fmtARS(-diff)}</span>`
      : diff > 0.5 ? `<span class="empar-badge favor">A favor ${fmtARS(diff)}</span>`
      : `<span class="empar-badge ok">Al día</span>`;
    html += `<div class="empar-row"><div class="empar-top"><span class="empar-name">${persona}</span>${bdg}</div>
      <div class="empar-track"><div class="empar-fill" style="width:${pct}%;background:${COLORES[i % COLORES.length]}"></div>
        <div class="empar-meta-line" style="left:${metaPct}%"></div></div>
      <div class="empar-val">${fmtARS(monto)}</div></div>`;
  });
  const deben = GRUPO_EMPAREJAR.map((p, i) => ({ p, d: prom - montos[i] })).filter((x) => x.d > 0.5).sort((a, b) => b.d - a.d);
  if (deben.length) html += `<div class="empar-liq"><b>Para emparejar:</b><br>` +
    deben.map((x) => `${x.p} debe poner <b>${fmtARS(x.d)}</b>`).join("<br>") + `</div>`;
  cont.innerHTML = html;
}

function renderProximos() {
  const items = estado.proximos;
  document.getElementById("prox-ars").textContent = fmtARS(items.reduce((s, p) => s + Number(p.monto_ars || 0), 0));
  document.getElementById("prox-usd").textContent = fmtUSD(items.reduce((s, p) => s + Number(p.monto_usd || 0), 0));
  document.getElementById("prox-cant").textContent = items.length;
  const cont = document.getElementById("lista-prox");
  cont.innerHTML = "";
  const hoy = new Date().toISOString().slice(0, 10);
  items.slice().sort((a, b) => (a.fecha || "").localeCompare(b.fecha || "")).forEach((p) => {
    const row = document.createElement("div");
    row.className = "mov-item" + (p.fecha && p.fecha < hoy ? " rechazado" : "");
    row.innerHTML = `<div class="mov-avatar">🗓️</div>
      <div class="mov-info"><div class="mov-desc">${p.concepto || ""}</div>
        <div class="mov-meta">${p.fecha || "sin fecha"}${p.id_persona ? " · " + p.id_persona : ""}${p.nota ? " · " + p.nota : ""}</div></div>
      <div class="mov-right"><div class="mov-amount egreso">${fmtARS(p.monto_ars)}</div><div class="mov-usd">${fmtUSD(p.monto_usd)}</div></div>
      <button class="mov-del" data-id="${p.id}">✕</button>`;
    cont.appendChild(row);
  });
  cont.querySelectorAll(".mov-del").forEach((b) => b.addEventListener("click", async (e) => {
    estado.proximos = estado.proximos.filter((y) => y.id != e.currentTarget.dataset.id);
    render(); await guardarDatos("Elimina gasto próximo FCM");
  }));
  if (!items.length) cont.innerHTML = '<p style="color:var(--antracita);font-size:13px;padding:6px 2px">Sin gastos próximos.</p>';
}

function render() { renderTotales(); renderPorId(); renderProximos(); }

/* ---------- eventos ---------- */
document.querySelectorAll(".nav-btn").forEach((b) => b.addEventListener("click", () => goScreen(b.dataset.screen)));
document.getElementById("btn-add-gasto").addEventListener("click", () => document.getElementById("add-gasto-sheet").classList.toggle("hidden"));
document.getElementById("btn-add-prox").addEventListener("click", () => document.getElementById("add-prox-sheet").classList.toggle("hidden"));

document.getElementById("form-gasto").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fecha = document.getElementById("g-fecha").value;
  estado.gastos.push({
    id: nextId(estado.gastos), fecha,
    mes: fecha ? new Date(fecha + "T00:00:00").toLocaleDateString("es-AR", { month: "long" }) : "",
    id_persona: document.getElementById("g-persona").value.toUpperCase(),
    concepto: document.getElementById("g-concepto").value,
    tipo: document.getElementById("g-tipo").value,
    monto_ars: parseFloat(document.getElementById("g-ars").value) || 0,
    monto_usd: parseFloat(document.getElementById("g-usd").value) || 0,
    cantidad: 1,
  });
  e.target.reset(); document.getElementById("add-gasto-sheet").classList.add("hidden");
  render(); await guardarDatos("Agrega gasto FCM");
});

document.getElementById("form-prox").addEventListener("submit", async (e) => {
  e.preventDefault();
  estado.proximos.push({
    id: nextId(estado.proximos),
    fecha: document.getElementById("p-fecha").value,
    concepto: document.getElementById("p-concepto").value,
    id_persona: document.getElementById("p-persona").value.toUpperCase(),
    monto_ars: parseFloat(document.getElementById("p-ars").value) || 0,
    monto_usd: parseFloat(document.getElementById("p-usd").value) || 0,
    nota: document.getElementById("p-nota").value,
  });
  e.target.reset(); document.getElementById("add-prox-sheet").classList.add("hidden");
  render(); await guardarDatos("Agrega gasto próximo FCM");
});

document.getElementById("form-token").addEventListener("submit", async (e) => {
  e.preventDefault();
  const t = document.getElementById("gh-token").value.trim();
  const msg = document.getElementById("config-msg");
  if (!t) return;
  token = t;
  msg.textContent = "Conectando…";
  try {
    await cargarDatos();
    localStorage.setItem("gh_token", token);
    msg.textContent = "";
    render();
    goScreen("screen-totales");
  } catch (err) {
    token = "";
    msg.textContent = "No se pudo conectar: " + err.message;
  }
});

document.getElementById("btn-olvidar").addEventListener("click", () => {
  localStorage.removeItem("gh_token"); token = "";
  document.getElementById("gh-token").value = "";
  badge("Token borrado de este dispositivo");
});

/* ---------- arranque ---------- */
(async function init() {
  if (!token) { goScreen("screen-config"); return; }
  try {
    await cargarDatos();
    render();
    goScreen("screen-totales");
  } catch (err) {
    goScreen("screen-config");
    document.getElementById("config-msg").textContent = "Reconectá: " + err.message;
  }
})();

// Sin service worker (evita problemas de caché). Si quedó uno viejo, lo limpiamos.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
  if (window.caches) caches.keys().then((ks) => ks.forEach((k) => caches.delete(k))).catch(() => {});
}
