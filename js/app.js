const STORAGE_KEY = "omarStereos_citas_v1";

const form = document.getElementById("formCita");
const btnLimpiar = document.getElementById("btnLimpiar");
const lista = document.getElementById("listaCitas");
const search = document.getElementById("searchCitas");
const btnGuardar = document.getElementById("btnGuardar");

let editandoId = null;

// Estado de filtros (texto + rango)
let state = {
  text: "",
  range: "" // formato: "YYYY-MM-DD to YYYY-MM-DD"
};

// ✅ CONFIG: pega aquí tu link real de reseñas (Google Maps / Facebook)
const REVIEW_LINK = "https://g.page/r/TU_LINK_AQUI"; // <-- cámbialo

// Tabs
document.querySelectorAll(".tab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(b => b.classList.remove("is-active"));
    btn.classList.add("is-active");

    document.querySelectorAll(".panel").forEach(p => p.classList.remove("is-active"));
    const tab = btn.dataset.tab;
    document.getElementById(`panel-${tab}`).classList.add("is-active");

    // Si el usuario abre "Clientes", podemos mostrar un resumen básico
    if (tab === "clientes") {
      renderClientesPanel();
    }
  });
});

// LocalStorage
function loadCitas() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveCitas(citas) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(citas));
}

function formatFecha(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// Helpers de fechas
function isoToday() {
  return new Date().toISOString().split("T")[0];
}

function parseRange(range) {
  if (!range) return null;
  const [start, end] = range.split(" to ").map(s => (s || "").trim());
  if (!start || !end) return null;
  return { start, end };
}

function inRange(isoDate, range) {
  if (!range) return true;
  if (!isoDate) return false;

  const r = parseRange(range);
  if (!r) return true;

  const d = new Date(isoDate);
  const s = new Date(r.start);
  const e = new Date(r.end);

  d.setHours(0, 0, 0, 0);
  s.setHours(0, 0, 0, 0);
  e.setHours(0, 0, 0, 0);

  return d >= s && d <= e;
}

function getStartOfWeekMonday() {
  const date = new Date();
  const day = date.getDay(); // 0 Domingo, 1 Lunes...
  const diff = date.getDate() - day + (day === 0 ? -6 : 1); // lunes
  date.setDate(diff);
  return date.toISOString().split("T")[0];
}

function getEndOfWeekSunday() {
  const start = new Date(getStartOfWeekMonday());
  start.setDate(start.getDate() + 6);
  return start.toISOString().split("T")[0];
}

function getStartOfMonth() {
  const d = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  return d.toISOString().split("T")[0];
}

function getEndOfMonth() {
  const d = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);
  return d.toISOString().split("T")[0];
}

// ✅ Teléfonos MX/USA para WhatsApp
// Reglas prácticas:
// - Si ya viene con 52xxxxxxxxxx (12+), lo dejamos
// - Si ya viene con 1xxxxxxxxxx (11) lo dejamos
// - Si viene 10 dígitos, asumimos México (52) por defecto
// - Si viene otra longitud, lo mandamos como esté (mejor que fallar)
function normalizeWhatsAppPhone(raw) {
  const digits = String(raw || "").replace(/\D/g, "");

  if (!digits) return "";

  // México: 52 + 10 dígitos típicos => 12
  if (digits.startsWith("52") && digits.length >= 12) return digits;

  // USA: 1 + 10 dígitos => 11
  if (digits.startsWith("1") && digits.length === 11) return digits;

  // Si el usuario puso 10 dígitos, asumimos México
  if (digits.length === 10) return "52" + digits;

  // Si puso 11 y NO empieza con 1, puede ser (52 + 9?) o raro; lo dejamos
  return digits;
}

// ✅ Mensajes WhatsApp
function openWhatsApp(phoneDigits, message) {
  if (!phoneDigits) {
    Swal.fire("Falta teléfono", "Este cliente no tiene un número válido.", "error");
    return;
  }
  const url = `https://wa.me/${phoneDigits}?text=${encodeURIComponent(message)}`;
  window.open(url, "_blank");
}

function buildCitaMessage(c) {
  return (
`Hola ${c.cliente} 👋

*Omar Stereos* 🔊🚗

📌 *Confirmación de cita*
🚗 Vehículo: ${c.vehiculo} ${c.anio} (${c.color || "—"})
🔧 Servicio: ${c.servicio}
📅 Fecha de cita: ${formatFecha(c.fechaCita)}

Gracias por confiar en nosotros 🙌`
  );
}

function buildMantenimientoMessage(c) {
  return (
`Hola ${c.cliente} 👋

*Omar Stereos* 🔊🚗

🔔 *Recordatorio de mantenimiento*
Tu mantenimiento está programado para: *${formatFecha(c.mantenimiento)}*

Si gustas, responde a este mensaje para agendar tu visita ✅`
  );
}

function buildReviewMessage(c) {
  return (
`Hola ${c.cliente} 👋
Gracias por confiar en *Omar Stereos* 🔊🚗

Si quedaste satisfecho con el trabajo, ¿nos ayudas con una reseña? ⭐⭐⭐⭐⭐

👉 ${REVIEW_LINK}

¡Nos ayuda muchísimo! 🙌`
  );
}

// Render
function renderCitas({ text = state.text, range = state.range } = {}) {
  state.text = (text || "").trim();
  state.range = (range || "").trim();

  const citas = loadCitas();
  const q = state.text.toLowerCase();

  // filtro por texto
  let filtradas = !q ? citas : citas.filter(c =>
    (c.cliente || "").toLowerCase().includes(q) ||
    (c.vehiculo || "").toLowerCase().includes(q) ||
    (c.telefono || "").toLowerCase().includes(q)
  );

  // filtro por rango
  filtradas = filtradas.filter(c => inRange(c.fechaCita, state.range));

  if (filtradas.length === 0) {
    lista.innerHTML = `<div class="item"><div class="meta">No hay citas para mostrar.</div></div>`;
    updateCounters();
    return;
  }

  lista.innerHTML = filtradas
    .sort((a, b) => (a.fechaCita || "").localeCompare(b.fechaCita || ""))
    .map(c => `
      <div class="item">
        <div class="item__top">
          <div>
            <strong>${escapeHtml(c.cliente)}</strong>
            <div class="meta">${escapeHtml(c.telefono)} · ${escapeHtml(c.vehiculo)} (${escapeHtml(c.anio)}) · Color: ${escapeHtml(c.color || "—")}</div>
            <div class="meta">Servicio: ${escapeHtml(c.servicio)}</div>
            <div class="meta">Notas: ${escapeHtml(c.notas || "—")}</div>
          </div>
          <div class="badge">Cita: ${formatFecha(c.fechaCita)}</div>
        </div>

        <div class="meta">Mantenimiento: ${formatFecha(c.mantenimiento)}</div>

        <div class="item__actions">
          <button class="btn btn--ghost btn--mini" data-action="whatsapp" data-id="${c.id}" type="button">WhatsApp</button>
          <button class="btn btn--ghost btn--mini" data-action="pdf" data-id="${c.id}" type="button">PDF</button>
          <button class="btn btn--ghost btn--mini" data-action="review" data-id="${c.id}" type="button">Reseña</button>
          <button class="btn btn--ghost btn--mini" data-action="history" data-id="${c.id}" type="button">Historial</button>

          <button class="btn btn--ghost btn--mini" data-action="edit" data-id="${c.id}" type="button">Editar</button>
          <button class="btn btn--ghost btn--mini" data-action="delete" data-id="${c.id}" type="button">Eliminar</button>
        </div>
      </div>
    `).join("");

  // acciones
  lista.querySelectorAll("button[data-action='delete']").forEach(btn => {
    btn.addEventListener("click", () => confirmarEliminar(btn.dataset.id));
  });

  lista.querySelectorAll("button[data-action='edit']").forEach(btn => {
    btn.addEventListener("click", () => editarCita(btn.dataset.id));
  });

  lista.querySelectorAll("button[data-action='whatsapp']").forEach(btn => {
    btn.addEventListener("click", () => enviarWhatsAppCita(btn.dataset.id));
  });

  lista.querySelectorAll("button[data-action='pdf']").forEach(btn => {
    btn.addEventListener("click", () => generarPDFPorId(btn.dataset.id));
  });

  lista.querySelectorAll("button[data-action='review']").forEach(btn => {
    btn.addEventListener("click", () => enviarResenaPorId(btn.dataset.id));
  });

  lista.querySelectorAll("button[data-action='history']").forEach(btn => {
    btn.addEventListener("click", () => mostrarHistorialPorId(btn.dataset.id));
  });

  updateCounters();
}

// CRUD
function confirmarEliminar(id) {
  Swal.fire({
    title: "¿Estás seguro?",
    text: "¡Esta cita será eliminada!",
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "Sí, eliminar",
    cancelButtonText: "Cancelar",
    reverseButtons: true
  }).then((result) => {
    if (result.isConfirmed) {
      eliminarCita(id);
      Swal.fire("¡Eliminada!", "La cita ha sido eliminada.", "success");
    }
  });
}

function eliminarCita(id) {
  const citas = loadCitas();
  const nuevas = citas.filter(c => String(c.id) !== String(id));
  saveCitas(nuevas);
  renderCitas({ text: state.text, range: state.range });
}

function editarCita(id) {
  const citas = loadCitas();
  const cita = citas.find(c => String(c.id) === String(id));
  if (!cita) return;

  form.querySelector("[name='cliente']").value = cita.cliente || "";
  form.querySelector("[name='telefono']").value = cita.telefono || "";
  form.querySelector("[name='vehiculo']").value = cita.vehiculo || "";
  form.querySelector("[name='anio']").value = cita.anio ?? "";
  form.querySelector("[name='color']").value = cita.color || "";
  form.querySelector("[name='servicio']").value = cita.servicio || "";
  form.querySelector("[name='fechaCita']").value = cita.fechaCita || "";
  form.querySelector("[name='mantenimiento']").value = cita.mantenimiento || "";
  form.querySelector("[name='notas']").value = cita.notas || "";

  editandoId = cita.id;
  btnGuardar.textContent = "Actualizar Cita";
}

function resetEdicion() {
  editandoId = null;
  btnGuardar.textContent = "Guardar Cita";
}

// Contadores
function updateCounters() {
  const citas = loadCitas();
  const today = isoToday();

  const totalCitas = citas.length;
  const citasDeHoy = citas.filter(c => c.fechaCita === today).length;

  const totalEl = document.getElementById("totalCount");
  const todayEl = document.getElementById("todayCount");

  if (totalEl) totalEl.textContent = String(totalCitas);
  if (todayEl) todayEl.textContent = String(citasDeHoy);
}

// Submit
form.addEventListener("submit", (e) => {
  e.preventDefault();

  const data = new FormData(form);
  const cita = {
    id: editandoId || Date.now(),
    cliente: (data.get("cliente") || "").trim(),
    telefono: (data.get("telefono") || "").trim(),
    vehiculo: (data.get("vehiculo") || "").trim(),
    anio: Number(data.get("anio")),
    color: (data.get("color") || "").trim(),
    servicio: (data.get("servicio") || "").trim(),
    fechaCita: data.get("fechaCita"),
    mantenimiento: data.get("mantenimiento"),
    notas: (data.get("notas") || "").trim()
  };

  const citas = loadCitas();

  if (editandoId) {
    const index = citas.findIndex(c => String(c.id) === String(editandoId));
    if (index !== -1) citas[index] = cita;
  } else {
    citas.push(cita);
  }

  saveCitas(citas);
  form.reset();
  resetEdicion();

  renderCitas({ text: state.text, range: state.range });
});

// Limpiar
btnLimpiar.addEventListener("click", () => {
  form.reset();
  resetEdicion();
});

// Buscar
search.addEventListener("input", () => {
  renderCitas({ text: search.value, range: state.range });
});

// Filtros por fecha (si existen en el HTML)
const filterAll = document.getElementById("filterAll");
const filterToday = document.getElementById("filterToday");
const filterThisWeek = document.getElementById("filterThisWeek");
const filterThisMonth = document.getElementById("filterThisMonth");

if (filterAll) {
  filterAll.addEventListener("click", () => {
    renderCitas({ text: state.text, range: "" });
  });
}
if (filterToday) {
  filterToday.addEventListener("click", () => {
    const today = isoToday();
    renderCitas({ text: state.text, range: `${today} to ${today}` });
  });
}
if (filterThisWeek) {
  filterThisWeek.addEventListener("click", () => {
    const start = getStartOfWeekMonday();
    const end = getEndOfWeekSunday();
    renderCitas({ text: state.text, range: `${start} to ${end}` });
  });
}
if (filterThisMonth) {
  filterThisMonth.addEventListener("click", () => {
    const start = getStartOfMonth();
    const end = getEndOfMonth();
    renderCitas({ text: state.text, range: `${start} to ${end}` });
  });
}

// ============================
// ✅ WHATSAPP (cita / mantenimiento / reseña)
// ============================

function findCitaById(id) {
  const citas = loadCitas();
  return citas.find(c => String(c.id) === String(id)) || null;
}

function enviarWhatsAppCita(id) {
  const c = findCitaById(id);
  if (!c) return;

  const phone = normalizeWhatsAppPhone(c.telefono);
  const msg = buildCitaMessage(c);

  openWhatsApp(phone, msg);
}

function enviarMantenimientoWhatsApp(c) {
  const phone = normalizeWhatsAppPhone(c.telefono);
  const msg = buildMantenimientoMessage(c);
  openWhatsApp(phone, msg);
}

function enviarResenaPorId(id) {
  const c = findCitaById(id);
  if (!c) return;

  const phone = normalizeWhatsAppPhone(c.telefono);
  const msg = buildReviewMessage(c);

  openWhatsApp(phone, msg);
}

// ============================
// ✅ RECORDATORIO AUTOMÁTICO (mantenimiento)
// ============================
// En app local: no puede enviar solo, pero sí te avisa y te da acceso rápido.
function checkMantenimientosHoy() {
  const citas = loadCitas();
  const today = isoToday();

  const pendientes = citas
    .filter(c => c.mantenimiento && c.mantenimiento === today)
    .sort((a, b) => (a.cliente || "").localeCompare(b.cliente || ""));

  if (pendientes.length === 0) return;

  const htmlList = `
    <div style="text-align:left;">
      <p>Tienes <strong>${pendientes.length}</strong> recordatorio(s) para hoy <strong>${formatFecha(today)}</strong>:</p>
      <ol style="padding-left:18px;">
        ${pendientes.map(p => `<li><strong>${escapeHtml(p.cliente)}</strong> · ${escapeHtml(p.telefono)} · ${escapeHtml(p.vehiculo)} (${escapeHtml(p.anio)})</li>`).join("")}
      </ol>
      <p style="margin-top:10px;">Puedes enviarlos desde aquí o filtrar "Hoy" y usar el botón WhatsApp.</p>
    </div>
  `;

  Swal.fire({
    title: "🔔 Recordatorios de mantenimiento",
    html: htmlList,
    icon: "info",
    showCancelButton: true,
    confirmButtonText: "Ver citas de hoy",
    cancelButtonText: "Cerrar",
    reverseButtons: true
  }).then(res => {
    if (res.isConfirmed) {
      // Filtra lista por hoy para revisar fácilmente (citas por fecha de cita)
      // Si prefieres filtrar por mantenimiento, dímelo y lo ajusto.
      renderCitas({ text: "", range: `${today} to ${today}` });
    }
  });
}

// ============================
// ✅ PDF ORDEN DE TRABAJO
// ============================

function generarPDFPorId(id) {
  const c = findCitaById(id);
  if (!c) return;
  generarPDFOrden(c);
}

function generarPDFOrden(c) {
  const jsPDF = window.jspdf?.jsPDF;
  if (!jsPDF) {
    Swal.fire("PDF no disponible", "jsPDF no está cargado.", "error");
    return;
  }

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4"
  });

  // =========================
  // CONFIGURACIÓN GENERAL
  // =========================
  const MARGIN_X = 15;
  let y = 20;

  const orderNumber = `OS-${c.id}`;
  const today = new Date().toLocaleDateString("es-MX");

  // =========================
  // LOGO
  // =========================
  try {
    const logo = new Image();
    logo.src = "assets/logo.png";
    doc.addImage(logo, "PNG", MARGIN_X, y, 35, 35);
  } catch (e) {
    // si falla el logo, no rompe el PDF
  }

  // =========================
  // ENCABEZADO
  // =========================
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("ORDEN DE TRABAJO", 105, y + 10, { align: "center" });

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Omar Stereos · Performance Car Audio & Electronics", 105, y + 18, { align: "center" });

  doc.setLineWidth(0.5);
  doc.line(MARGIN_X, y + 40, 195, y + 40);

  // =========================
  // DATOS GENERALES
  // =========================
  y += 50;
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Datos de la orden", MARGIN_X, y);

  y += 6;
  doc.setFont("helvetica", "normal");
  doc.text(`Orden N°: ${orderNumber}`, MARGIN_X, y);
  doc.text(`Fecha emisión: ${today}`, 120, y);

  // =========================
  // DATOS DEL CLIENTE
  // =========================
  y += 10;
  doc.setFont("helvetica", "bold");
  doc.text("Cliente", MARGIN_X, y);

  y += 6;
  doc.setFont("helvetica", "normal");
  doc.text(`Nombre: ${c.cliente}`, MARGIN_X, y);
  doc.text(`Teléfono: ${c.telefono}`, 120, y);

  // =========================
  // DATOS DEL VEHÍCULO
  // =========================
  y += 10;
  doc.setFont("helvetica", "bold");
  doc.text("Vehículo", MARGIN_X, y);

  y += 6;
  doc.setFont("helvetica", "normal");
  doc.text(`Modelo: ${c.vehiculo}`, MARGIN_X, y);
  doc.text(`Año: ${c.anio}`, 120, y);

  y += 6;
  doc.text(`Color: ${c.color || "—"}`, MARGIN_X, y);

  // =========================
  // SERVICIO
  // =========================
  y += 10;
  doc.setFont("helvetica", "bold");
  doc.text("Servicio solicitado", MARGIN_X, y);

  y += 6;
  doc.setFont("helvetica", "normal");
  doc.text(c.servicio || "—", MARGIN_X, y, { maxWidth: 180 });

  // =========================
  // OBSERVACIONES TÉCNICAS
  // =========================
  y += 20;
  doc.setFont("helvetica", "bold");
  doc.text("Observaciones técnicas", MARGIN_X, y);

  y += 6;
  doc.rect(MARGIN_X, y, 180, 25);

  // =========================
  // FECHAS
  // =========================
  y += 35;
  doc.setFont("helvetica", "normal");
  doc.text(`Fecha de cita: ${formatFecha(c.fechaCita)}`, MARGIN_X, y);
  doc.text(`Mantenimiento: ${formatFecha(c.mantenimiento)}`, 120, y);

  // =========================
  // FIRMAS
  // =========================
  y += 20;
  doc.line(MARGIN_X, y, MARGIN_X + 60, y);
  doc.line(120, y, 180, y);

  doc.setFontSize(10);
  doc.text("Firma cliente", MARGIN_X + 15, y + 5);
  doc.text("Firma taller", 140, y + 5);

  // =========================
  // PIE DE PÁGINA
  // =========================
  doc.setFontSize(9);
  doc.text(
    "Gracias por confiar en Omar Stereos · Este documento es una orden de trabajo.",
    105,
    290,
    { align: "center" }
  );

  // =========================
  // GUARDAR
  // =========================
  const safeClient = c.cliente.replace(/[^\w\s]/gi, "").replace(/\s+/g, "_");
  doc.save(`OrdenTrabajo_${orderNumber}_${safeClient}.pdf`);
}


// ============================
// ✅ HISTORIAL POR CLIENTE
// ============================

function getHistorialClientePorCita(c) {
  const citas = loadCitas();
  const keyNombre = (c.cliente || "").trim().toLowerCase();
  const keyTel = String(c.telefono || "").replace(/\D/g, "");

  // Intento 1: mismo teléfono (más confiable)
  const porTel = keyTel
    ? citas.filter(x => String(x.telefono || "").replace(/\D/g, "") === keyTel)
    : [];

  // Si no hay por teléfono, por nombre exacto
  const porNombre = citas.filter(x => (x.cliente || "").trim().toLowerCase() === keyNombre);

  const merged = [...porTel, ...porNombre];

  // Quitar duplicados por id
  const seen = new Set();
  const unique = merged.filter(x => {
    const id = String(x.id);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  return unique.sort((a, b) => (a.fechaCita || "").localeCompare(b.fechaCita || ""));
}

function mostrarHistorialPorId(id) {
  const c = findCitaById(id);
  if (!c) return;

  const hist = getHistorialClientePorCita(c);

  const html = `
    <div style="text-align:left;">
      <p><strong>Cliente:</strong> ${escapeHtml(c.cliente)}</p>
      <p><strong>Tel:</strong> ${escapeHtml(c.telefono)}</p>
      <p><strong>Total visitas:</strong> ${hist.length}</p>
      <hr/>
      <ol style="padding-left:18px;">
        ${hist.map(h => `
          <li style="margin-bottom:6px;">
            <div><strong>Cita:</strong> ${formatFecha(h.fechaCita)} · <strong>Vehículo:</strong> ${escapeHtml(h.vehiculo)} (${escapeHtml(h.anio)})</div>
            <div><strong>Servicio:</strong> ${escapeHtml(h.servicio)}</div>
            <div><strong>Mant.:</strong> ${formatFecha(h.mantenimiento)}</div>
          </li>
        `).join("")}
      </ol>
    </div>
  `;

  Swal.fire({
    title: "📚 Historial del cliente",
    html,
    icon: "info",
    showCancelButton: true,
    confirmButtonText: "Enviar WhatsApp (cita)",
    cancelButtonText: "Cerrar",
    reverseButtons: true
  }).then(res => {
    if (res.isConfirmed) {
      // Envía confirmación de cita de este registro (el que abriste)
      enviarWhatsAppCita(id);
    }
  });
}

// Panel Clientes (resumen agrupado)
function renderClientesPanel() {
  const panel = document.getElementById("panel-clientes");
  if (!panel) return;

  const citas = loadCitas();
  if (citas.length === 0) return;

  // Agrupar por teléfono normalizado (si existe) o por nombre
  const map = new Map();

  for (const c of citas) {
    const tel = String(c.telefono || "").replace(/\D/g, "");
    const key = tel ? `tel:${tel}` : `nom:${(c.cliente || "").trim().toLowerCase()}`;

    if (!map.has(key)) {
      map.set(key, {
        cliente: c.cliente || "—",
        telefono: c.telefono || "—",
        visitas: 0,
        ultima: c.fechaCita || "",
        vehiculos: new Set()
      });
    }
    const item = map.get(key);
    item.visitas += 1;
    if ((c.fechaCita || "") > (item.ultima || "")) item.ultima = c.fechaCita || item.ultima;
    if (c.vehiculo) item.vehiculos.add(`${c.vehiculo} ${c.anio || ""}`.trim());
  }

  const rows = Array.from(map.values())
    .sort((a, b) => String(b.ultima || "").localeCompare(String(a.ultima || "")));

  // Reemplaza el placeholder del panel si existe
  const card = panel.querySelector(".card");
  if (!card) return;

  const html = `
    <h2>Clientes</h2>
    <p class="meta">Resumen por cliente (historial básico).</p>
    <div class="list" style="margin-top:10px;">
      ${rows.map(r => `
        <div class="item">
          <div class="item__top">
            <div>
              <strong>${escapeHtml(r.cliente)}</strong>
              <div class="meta">${escapeHtml(r.telefono)}</div>
              <div class="meta">Visitas: ${r.visitas} · Última cita: ${formatFecha(r.ultima)}</div>
              <div class="meta">Vehículos: ${escapeHtml(Array.from(r.vehiculos).join(", ") || "—")}</div>
            </div>
            <div class="badge">Historial</div>
          </div>
        </div>
      `).join("")}
    </div>
  `;

  card.innerHTML = html;
}

// ============================
// ✅ INIT
// ============================

updateCounters();
renderCitas();
checkMantenimientosHoy();

console.log("Omar Stereos App lista (local storage) + WhatsApp + PDF + Historial.");
