/* Gastos compartidos (FCM) — app estática con sync a GitHub. */
const REPO_OWNER = "fafedele";
const REPO_NAME = "control-de-egresos";
const DATA_PATH = "fcm/fcm-data.json";
const API = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${DATA_PATH}`;

const COLORES = ["#C63D28", "#2C5F8A", "#8E4585", "#3F9B4E", "#E0A82E", "#3A3A3A"];
const GRUPO_EMPAREJAR = ["FEFE", "MARCO", "CODA"];

let estado = { gastos: [], proximos: [], todos: [] };
let sha = null;
let token = localStorage.getItem("gh_token") || "";
let filtroMes = "", filtroId = "", todoFiltro = "", editId = null;

/* ---------- sonidos retro (8-bit) ---------- */
let audioCtx;
function initAudio() {
  if (!audioCtx) { try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
}
function tono(freq, start, dur, vol) {
  const o = audioCtx.createOscillator(), g = audioCtx.createGain();
  o.type = "square"; o.frequency.value = freq;
  o.connect(g); g.connect(audioCtx.destination);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(vol || 0.06, start + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.start(start); o.stop(start + dur + 0.02);
}
const SFX = {
  tap:   [[660, 0.05]],
  nav:   [[520, 0.05], [800, 0.05]],
  add:   [[523, 0.06], [659, 0.06], [784, 0.10]],
  del:   [[440, 0.06], [294, 0.10]],
  done:  [[784, 0.05], [1047, 0.08]],
  save:  [[659, 0.05], [880, 0.05], [1319, 0.11]],
  alert: [[880, 0.10], [587, 0.10], [880, 0.14]],
  open:  [[392, 0.05], [523, 0.05]],
};
function sfx(name) {
  initAudio(); if (!audioCtx) return;
  const seq = SFX[name] || SFX.tap; let t = audioCtx.currentTime;
  seq.forEach(([f, d]) => { tono(f, t, d, 0.06); t += d; });
  if (navigator.vibrate) navigator.vibrate(name === "del" ? 16 : name === "alert" ? [10, 40, 10] : 8);
}
document.addEventListener("pointerdown", (e) => {
  const el = e.target.closest(".mov-del, .nav-btn, .col-head, button, .chip, .connect-tile");
  if (!el) return;
  if (el.classList.contains("mov-del")) sfx("del");
  else if (el.classList.contains("nav-btn")) sfx("nav");
  else if (el.classList.contains("col-head")) sfx("open");
  else sfx("tap");
}, true);

/* ---------- utilidades ---------- */
const up = (s) => (s == null ? "" : String(s)).toUpperCase();
const fmtARS = (n) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 }).format(n || 0);
const fmtUSD = (n) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n || 0);
const esEgreso = (g) => (g.tipo || "egreso").toLowerCase() !== "ingreso";
const nextId = (arr) => (arr.reduce((m, x) => Math.max(m, x.id || 0), 0) + 1);
const b64encode = (str) => btoa(unescape(encodeURIComponent(str)));
const b64decode = (str) => decodeURIComponent(escape(atob(str)));

function badge(txt, ok) {
  const b = document.getElementById("sync-badge");
  b.textContent = txt;
  b.className = "sync-badge show" + (ok === false ? " err" : "");
  if (ok !== false && /✓/.test(txt)) sfx("save");
  clearTimeout(b._t);
  b._t = setTimeout(() => { b.className = "sync-badge"; }, 2500);
}

/* ---------- GitHub API ---------- */
async function cargarDatos() {
  const r = await fetch(API + "?ref=main&t=" + Date.now(), {
    headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json" }, cache: "no-store",
  });
  if (r.status === 401) throw new Error("Token inválido o vencido");
  if (r.status === 403) throw new Error("El token no tiene permiso (Contents: read & write)");
  if (r.status === 404) throw new Error("No encontré los datos. Revisá que el token acceda a 'control-de-egresos'");
  if (!r.ok) throw new Error("Error " + r.status);
  const j = await r.json();
  sha = j.sha;
  const data = JSON.parse(b64decode(j.content));
  estado = { gastos: data.gastos || [], proximos: data.proximos || [], todos: data.todos || [] };
}
async function guardarDatos(mensaje) {
  badge("Guardando…");
  const body = {
    message: mensaje || "Actualiza FCM",
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
  sha = (await r.json()).content.sha;
  badge("Guardado ✓");
}

/* ---------- navegación ---------- */
function goScreen(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
  const nav = document.getElementById("bottom-nav");
  const conNav = ["screen-totales", "screen-porid", "screen-proximos", "screen-todo"].includes(id);
  nav.classList.toggle("hidden", !conNav);
  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.screen === id));
}

/* ---------- long-press ---------- */
function attachLongPress(el, cb) {
  let timer = null;
  const start = () => { timer = setTimeout(() => { timer = null; if (navigator.vibrate) navigator.vibrate(22); cb(); }, 480); };
  const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
  el.addEventListener("touchstart", start, { passive: true });
  el.addEventListener("touchend", cancel);
  el.addEventListener("touchmove", cancel);
  el.addEventListener("mousedown", start);
  el.addEventListener("mouseup", cancel);
  el.addEventListener("mouseleave", cancel);
}

/* ---------- barras ---------- */
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

/* ---------- Totales + detalle ---------- */
function opcionesFiltro() {
  const meses = [...new Set(estado.gastos.map((g) => g.mes).filter(Boolean))];
  const ids = [...new Set(estado.gastos.map((g) => g.id_persona).filter(Boolean))];
  const selMes = document.getElementById("f-mes"), selId = document.getElementById("f-id");
  selMes.innerHTML = '<option value="">MES: TODOS</option>' + meses.map((m) => `<option ${m === filtroMes ? "selected" : ""}>${up(m)}</option>`).join("");
  selId.innerHTML = '<option value="">ID: TODOS</option>' + ids.map((x) => `<option ${x === filtroId ? "selected" : ""}>${up(x)}</option>`).join("");
}
function renderTotales() {
  const egresos = estado.gastos.filter(esEgreso);
  document.getElementById("tot-ars").textContent = fmtARS(egresos.reduce((s, x) => s + Number(x.monto_ars || 0), 0));
  document.getElementById("tot-usd").textContent = fmtUSD(egresos.reduce((s, x) => s + Number(x.monto_usd || 0), 0));
  document.getElementById("tot-cant").textContent = estado.gastos.length;
  renderBars("bars-mes", agrupar(egresos, (x) => up(x.mes)));
  renderBars("bars-concepto", agrupar(egresos, (x) => up(x.concepto)));
  opcionesFiltro();

  const cont = document.getElementById("lista-gastos");
  cont.innerHTML = "";
  let lista = estado.gastos.slice()
    .filter((g) => (!filtroMes || up(g.mes) === up(filtroMes)) && (!filtroId || up(g.id_persona) === up(filtroId)))
    .sort((a, b) => (b.fecha || "").localeCompare(a.fecha || "") || (b.id || 0) - (a.id || 0));
  lista.forEach((x) => {
    const row = document.createElement("div");
    row.className = "mov-item";
    row.innerHTML = `<div class="mov-avatar">${up((x.id_persona || "?").slice(0, 2))}</div>
      <div class="mov-info"><div class="mov-desc">${up(x.concepto)}</div>
        <div class="mov-meta">${up(x.id_persona)} · ${x.fecha || ""}</div></div>
      <div class="mov-right"><div class="mov-amount ${esEgreso(x) ? "egreso" : "ingreso"}">${esEgreso(x) ? "-" : "+"}${fmtARS(x.monto_ars)}</div>
        <div class="mov-usd">${fmtUSD(x.monto_usd)}</div></div>
      <button class="mov-del" data-id="${x.id}">✕</button>`;
    row.querySelector(".mov-del").addEventListener("click", async (e) => {
      e.stopPropagation();
      estado.gastos = estado.gastos.filter((y) => y.id != x.id);
      render(); await guardarDatos("Elimina gasto FCM");
    });
    attachLongPress(row, () => abrirEdicion(x.id));
    cont.appendChild(row);
  });
  if (!lista.length) cont.innerHTML = '<p style="color:var(--antracita);font-size:13px;padding:6px 2px">Sin gastos con ese filtro.</p>';

  renderReminder();
}

/* ---------- edición (long-press) ---------- */
function abrirEdicion(id) {
  const g = estado.gastos.find((x) => x.id == id);
  if (!g) return;
  editId = id;
  document.getElementById("e-fecha").value = g.fecha || "";
  document.getElementById("e-persona").value = up(g.id_persona);
  document.getElementById("e-concepto").value = up(g.concepto);
  document.getElementById("e-tipo").value = esEgreso(g) ? "egreso" : "ingreso";
  document.getElementById("e-ars").value = g.monto_ars || "";
  document.getElementById("e-usd").value = g.monto_usd || "";
  document.getElementById("edit-modal").classList.remove("hidden");
  sfx("open");
}
function cerrarEdicion() { document.getElementById("edit-modal").classList.add("hidden"); editId = null; }

/* ---------- Por ID + emparejar ---------- */
function calcEmparejar() {
  const egresos = estado.gastos.filter(esEgreso);
  const porId = {};
  egresos.forEach((g) => {
    const k = up(g.id_persona) || "OTRO";
    if (!porId[k]) porId[k] = { ars: 0, usd: 0, n: 0 };
    porId[k].ars += Number(g.monto_ars || 0); porId[k].usd += Number(g.monto_usd || 0); porId[k].n += 1;
  });
  const montos = GRUPO_EMPAREJAR.map((p) => (porId[p] ? porId[p].ars : 0));
  const total = montos.reduce((a, b) => a + b, 0), prom = total / GRUPO_EMPAREJAR.length;
  const deben = GRUPO_EMPAREJAR.map((p, i) => ({ p, d: prom - montos[i] })).filter((x) => x.d > 0.5).sort((a, b) => b.d - a.d);
  const top = GRUPO_EMPAREJAR[montos.indexOf(Math.max(...montos))];
  return { porId, montos, prom, deben, top };
}
function renderPorId() {
  const { porId } = calcEmparejar();
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
  renderEmparejar();
}
function renderEmparejar() {
  const { montos, prom, deben } = calcEmparejar();
  const cont = document.getElementById("emparejar");
  const max = Math.max(...montos, 1);
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
  if (deben.length) html += `<div class="empar-liq"><b>Para emparejar:</b><br>` +
    deben.map((x) => `${x.p} debe poner <b>${fmtARS(x.d)}</b>`).join("<br>") + `</div>`;
  cont.innerHTML = html;
}

/* ---------- Próximos ---------- */
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
      <div class="mov-info"><div class="mov-desc">${up(p.concepto)}</div>
        <div class="mov-meta">${p.fecha || "SIN FECHA"}${p.id_persona ? " · " + up(p.id_persona) : ""}${p.nota ? " · " + up(p.nota) : ""}</div></div>
      <div class="mov-right"><div class="mov-amount egreso">${fmtARS(p.monto_ars)}</div><div class="mov-usd">${fmtUSD(p.monto_usd)}</div></div>
      <button class="mov-del" data-id="${p.id}">✕</button>`;
    row.querySelector(".mov-del").addEventListener("click", async () => {
      estado.proximos = estado.proximos.filter((y) => y.id != p.id);
      render(); await guardarDatos("Elimina próximo FCM");
    });
    cont.appendChild(row);
  });
  if (!items.length) cont.innerHTML = '<p style="color:var(--antracita);font-size:13px;padding:6px 2px">Sin gastos próximos.</p>';
}

/* ---------- To Do ---------- */
function renderTodo() {
  const ids = [...new Set(estado.todos.map((t) => up(t.id_persona)).filter(Boolean))];
  const filt = document.getElementById("todo-filtros");
  filt.innerHTML = `<button class="chip ${todoFiltro === "" ? "active" : ""}" data-f="">TODOS</button>` +
    ids.map((x) => `<button class="chip ${todoFiltro === x ? "active" : ""}" data-f="${x}">${x}</button>`).join("");
  filt.querySelectorAll(".chip").forEach((c) => c.addEventListener("click", () => { todoFiltro = c.dataset.f; renderTodo(); }));

  const cont = document.getElementById("lista-todo");
  cont.innerHTML = "";
  const lista = estado.todos.filter((t) => !todoFiltro || up(t.id_persona) === todoFiltro);
  lista.sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0));
  lista.forEach((t) => {
    const row = document.createElement("div");
    row.className = "todo-item" + (t.done ? " done" : "");
    row.innerHTML = `<div class="todo-check">${t.done ? "✓" : ""}</div>
      <div class="mov-info"><div class="mov-desc">${up(t.texto)}</div>
        <div class="mov-meta">${t.id_persona ? up(t.id_persona) : "SIN ID"}</div></div>
      <button class="mov-del" data-id="${t.id}">✕</button>`;
    row.querySelector(".todo-check").addEventListener("click", async (e) => {
      e.stopPropagation(); t.done = !t.done; sfx("done"); renderTodo(); await guardarDatos("Actualiza tarea FCM");
    });
    row.querySelector(".mov-info").addEventListener("click", async () => {
      t.done = !t.done; sfx("done"); renderTodo(); await guardarDatos("Actualiza tarea FCM");
    });
    row.querySelector(".mov-del").addEventListener("click", async () => {
      estado.todos = estado.todos.filter((y) => y.id != t.id);
      renderTodo(); await guardarDatos("Elimina tarea FCM");
    });
    cont.appendChild(row);
  });
  if (!lista.length) cont.innerHTML = '<p style="color:var(--antracita);font-size:13px;padding:6px 2px">Sin tareas.</p>';
}

/* ---------- aviso de pago (10/20/30, 3 días antes) ---------- */
function renderReminder() {
  const pop = document.getElementById("reminder-pop");
  const hoy = new Date(), dia = hoy.getDate();
  let target = null;
  for (const D of [10, 20, 30]) { const diff = D - dia; if (diff >= 0 && diff <= 3) { target = { D, diff }; break; } }
  const claveDismiss = target ? `dismiss_${hoy.getFullYear()}_${hoy.getMonth()}_${target.D}` : null;
  if (!target || localStorage.getItem(claveDismiss)) { pop.classList.add("hidden"); return; }

  const { top, deben } = calcEmparejar();
  if (!deben.length) { pop.classList.add("hidden"); return; }
  const cuando = target.diff === 0 ? "hoy" : `en ${target.diff} día${target.diff !== 1 ? "s" : ""}`;
  pop.innerHTML = `<div class="rem-close" id="rem-close">✕</div>
    <div class="rem-title">⏰ Pago del ${target.D} — ${cuando}</div>
    <div class="rem-body">Hay que pagarle a <b>${top}</b> (puso más):<br>` +
    deben.map((x) => `${x.p} → <b>${fmtARS(x.d)}</b>`).join("<br>") + `</div>`;
  pop.classList.remove("hidden");
  document.getElementById("rem-close").addEventListener("click", () => {
    localStorage.setItem(claveDismiss, "1"); pop.classList.add("hidden");
  });
  if (!pop._sonó) { pop._sonó = true; sfx("alert"); }
}

/* ---------- render global ---------- */
function render() { renderTotales(); renderPorId(); renderProximos(); renderTodo(); }

/* ---------- eventos ---------- */
document.querySelectorAll(".nav-btn").forEach((b) => b.addEventListener("click", () => goScreen(b.dataset.screen)));
document.getElementById("btn-add-gasto").addEventListener("click", () => document.getElementById("add-gasto-sheet").classList.toggle("hidden"));
document.getElementById("btn-add-prox").addEventListener("click", () => document.getElementById("add-prox-sheet").classList.toggle("hidden"));
document.getElementById("btn-add-todo").addEventListener("click", () => document.getElementById("add-todo-sheet").classList.toggle("hidden"));

// Secciones plegables
document.querySelectorAll(".col-head").forEach((h) => h.addEventListener("click", () => {
  const body = document.getElementById(h.dataset.target);
  body.classList.toggle("hidden");
  h.classList.toggle("abierto", !body.classList.contains("hidden"));
}));

// Filtros del detalle
document.getElementById("f-mes").addEventListener("change", (e) => { filtroMes = e.target.value; renderTotales(); });
document.getElementById("f-id").addEventListener("change", (e) => { filtroId = e.target.value; renderTotales(); });

// Alta de gasto
document.getElementById("form-gasto").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fecha = document.getElementById("g-fecha").value;
  estado.gastos.push({
    id: nextId(estado.gastos), fecha,
    mes: fecha ? new Date(fecha + "T00:00:00").toLocaleDateString("es-AR", { month: "long" }) : "",
    id_persona: up(document.getElementById("g-persona").value),
    concepto: up(document.getElementById("g-concepto").value),
    tipo: document.getElementById("g-tipo").value,
    monto_ars: parseFloat(document.getElementById("g-ars").value) || 0,
    monto_usd: parseFloat(document.getElementById("g-usd").value) || 0,
    cantidad: 1,
  });
  e.target.reset(); document.getElementById("add-gasto-sheet").classList.add("hidden");
  sfx("add"); render(); await guardarDatos("Agrega gasto FCM");
});

// Edición de gasto
document.getElementById("form-edit").addEventListener("submit", async (e) => {
  e.preventDefault();
  const g = estado.gastos.find((x) => x.id == editId);
  if (g) {
    const fecha = document.getElementById("e-fecha").value;
    g.fecha = fecha;
    g.mes = fecha ? new Date(fecha + "T00:00:00").toLocaleDateString("es-AR", { month: "long" }) : g.mes;
    g.id_persona = up(document.getElementById("e-persona").value);
    g.concepto = up(document.getElementById("e-concepto").value);
    g.tipo = document.getElementById("e-tipo").value;
    g.monto_ars = parseFloat(document.getElementById("e-ars").value) || 0;
    g.monto_usd = parseFloat(document.getElementById("e-usd").value) || 0;
  }
  cerrarEdicion(); render(); await guardarDatos("Edita gasto FCM");
});
document.getElementById("edit-del").addEventListener("click", async () => {
  estado.gastos = estado.gastos.filter((x) => x.id != editId);
  sfx("del"); cerrarEdicion(); render(); await guardarDatos("Elimina gasto FCM");
});
document.getElementById("edit-cancel").addEventListener("click", cerrarEdicion);

// Alta de próximo
document.getElementById("form-prox").addEventListener("submit", async (e) => {
  e.preventDefault();
  estado.proximos.push({
    id: nextId(estado.proximos),
    fecha: document.getElementById("p-fecha").value,
    concepto: up(document.getElementById("p-concepto").value),
    id_persona: up(document.getElementById("p-persona").value),
    monto_ars: parseFloat(document.getElementById("p-ars").value) || 0,
    monto_usd: parseFloat(document.getElementById("p-usd").value) || 0,
    nota: up(document.getElementById("p-nota").value),
  });
  e.target.reset(); document.getElementById("add-prox-sheet").classList.add("hidden");
  sfx("add"); render(); await guardarDatos("Agrega próximo FCM");
});

// Alta de tarea
document.getElementById("form-todo").addEventListener("submit", async (e) => {
  e.preventDefault();
  estado.todos.push({
    id: nextId(estado.todos),
    id_persona: up(document.getElementById("t-id").value),
    texto: up(document.getElementById("t-texto").value),
    done: false,
  });
  e.target.reset(); document.getElementById("add-todo-sheet").classList.add("hidden");
  sfx("add"); renderTodo(); await guardarDatos("Agrega tarea FCM");
});

// Token
document.getElementById("form-token").addEventListener("submit", async (e) => {
  e.preventDefault();
  const t = document.getElementById("gh-token").value.trim();
  const msg = document.getElementById("config-msg");
  if (!t) return;
  token = t; msg.textContent = "Conectando…";
  try {
    await cargarDatos();
    localStorage.setItem("gh_token", token);
    msg.textContent = ""; render(); goScreen("screen-totales");
  } catch (err) { token = ""; msg.textContent = "No se pudo conectar: " + err.message; }
});
document.getElementById("btn-olvidar").addEventListener("click", () => {
  localStorage.removeItem("gh_token"); token = "";
  document.getElementById("gh-token").value = "";
  badge("Token borrado de este dispositivo");
});

/* ---------- arranque ---------- */
(async function init() {
  if (!token) { goScreen("screen-config"); return; }
  try { await cargarDatos(); render(); goScreen("screen-totales"); }
  catch (err) { goScreen("screen-config"); document.getElementById("config-msg").textContent = "Reconectá: " + err.message; }
})();

// Sin service worker (limpia cualquiera viejo)
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
  if (window.caches) caches.keys().then((ks) => ks.forEach((k) => caches.delete(k))).catch(() => {});
}
