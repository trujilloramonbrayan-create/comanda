// app.js — panel del dueño de restaurante
// Conectado al backend real. Sin datos mock.

// ─────────────────────────────────────────────────────────────
// Logout
// ─────────────────────────────────────────────────────────────

document.getElementById('btn-cerrar-sesion').addEventListener('click', () => {
  localStorage.removeItem('clik_token');
  localStorage.removeItem('clik_restaurant');
  window.location.replace('login.html');
});

// ─────────────────────────────────────────────────────────────
// API — fetch centralizado con JWT automático
// ─────────────────────────────────────────────────────────────

// Local (localhost / 127.0.0.1 / IP de red privada) → backend directo en :3000
// Producción (clik.work) → URL relativa '' para que Nginx proxee al backend
const esLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname)
  || /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(window.location.hostname);
const API_URL = esLocal ? `http://${window.location.hostname}:3000` : '';

async function llamarAPI(ruta, opciones = {}) {
  const token = localStorage.getItem('clik_token');
  const { headers: hdrsExtra = {}, ...resto } = opciones;

  const res = await fetch(`${API_URL}${ruta}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...hdrsExtra,
    },
    ...resto,
  });

  if (!res.ok) {
    if (res.status === 401) {
      localStorage.removeItem('clik_token');
      localStorage.removeItem('clik_restaurant');
      window.location.replace('login.html');
      return;
    }
    if (res.status === 402) {
      mostrarPlanVencido();
      return;
    }
    const cuerpo = await res.json().catch(() => ({}));
    throw Object.assign(new Error(cuerpo.error ?? `Error ${res.status}`), { status: res.status });
  }

  return res.status === 204 ? null : res.json();
}

// ─────────────────────────────────────────────────────────────
// Plan vencido
// ─────────────────────────────────────────────────────────────

function mostrarPlanVencido() {
  document.getElementById('overlay-plan-vencido').classList.remove('oculto');
}

document.getElementById('btn-cerrar-sesion-plan').addEventListener('click', () => {
  localStorage.removeItem('clik_token');
  localStorage.removeItem('clik_restaurant');
  window.location.replace('login.html');
});

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function escaparHTML(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

function formatearFecha(isoStr) {
  const d = new Date(isoStr);
  return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
}

function formatearPlan(planHasta) {
  if (!planHasta) return { texto: 'Sin plan', clase: 'sin-plan' };
  const fecha = new Date(planHasta);
  if (fecha < new Date()) return { texto: 'Plan vencido', clase: 'vencido' };
  return { texto: `Gratis hasta ${formatearFecha(planHasta)}`, clase: 'ok' };
}

function formatearPrecio(n) {
  return '$' + Number(n).toLocaleString('es-CO');
}

// Gradientes deterministas para la foto placeholder de cada plato
const GRADIENTES_PLATO = [
  'linear-gradient(145deg,#e8956d,#c94e35)',
  'linear-gradient(145deg,#c4956a,#8b6040)',
  'linear-gradient(145deg,#e8b86d,#c08030)',
  'linear-gradient(145deg,#e86050,#c03020)',
  'linear-gradient(145deg,#e8d498,#c0a040)',
  'linear-gradient(145deg,#b8d498,#6a9040)',
  'linear-gradient(145deg,#d4a870,#9a6c38)',
  'linear-gradient(145deg,#6b4838,#3a2018)',
];

function gradientePlato(id) {
  return GRADIENTES_PLATO[Math.abs(Number(id)) % GRADIENTES_PLATO.length];
}

// ─────────────────────────────────────────────────────────────
// Estado global
// ─────────────────────────────────────────────────────────────

const estado = { vistaActual: 'menu' };

const estadoMenu = {
  categorias: [],       // cargadas desde GET /menu
  abierta: {},          // { catId: boolean } — estado acordeón en memoria
};

// Contexto de modales
const ctxCategoria = { modo: 'crear', catId: null };
const ctxPlato     = { modo: 'crear', platoId: null, catId: null };


// ─────────────────────────────────────────────────────────────
// Navegación
// ─────────────────────────────────────────────────────────────

function cambiarVista(nombre) {
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('activo'));

  const vistaAnterior = document.getElementById(`vista-${estado.vistaActual}`);
  if (vistaAnterior) vistaAnterior.classList.add('oculto');

  estado.vistaActual = nombre;

  const vistaNueva = document.getElementById(`vista-${nombre}`);
  if (vistaNueva) vistaNueva.classList.remove('oculto');

  const navItem = document.querySelector(`[data-vista="${nombre}"]`);
  if (navItem) navItem.classList.add('activo');

  const titulos = {
    menu:      'Menú',
    qr:        'Mi QR',
    cobros:    'Mercado Pago',
    pedidos:   'Pedidos',
    ganancias: 'Ganancias',
  };
  document.getElementById('titulo-pagina').textContent = titulos[nombre] ?? nombre;

  // btn-nuevo solo aparece en la vista de menú
  const btnNuevo = document.getElementById('btn-nuevo');
  if (nombre === 'menu') {
    btnNuevo.classList.remove('oculto');
    btnNuevo.textContent = '+ Nueva categoría';
  } else {
    btnNuevo.classList.add('oculto');
  }

  if (nombre === 'menu')      cargarMenu();
  if (nombre === 'qr')        cargarQR();
  if (nombre === 'cobros')    cargarCobros();
  if (nombre === 'ganancias') cargarGanancias();
  if (nombre === 'pedidos')   { actualizarBadgePedidos(0); cargarPedidos(); }
}

// ─────────────────────────────────────────────────────────────
// Vista QR
// ─────────────────────────────────────────────────────────────

async function cargarQR() {
  try {
    const r = await llamarAPI('/mi-restaurante');

    // URL del menú público: menu.html?slug=<slug>
    // Esta convención la lee menu.js con URLSearchParams. El QR y el menú usan la misma URL.
    // En producción, Nginx puede reescribir /r/:slug → menu.html?slug=:slug sin cambiar este código.
    const base = window.location.href.replace(/\/[^/]*$/, '/');
    const urlMenu = `${base}menu.html?slug=${encodeURIComponent(r.slug)}`;

    // QR via api.qrserver.com — gratuito, no requiere clave
    const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(urlMenu)}&bgcolor=ffffff&color=1e293b&margin=3`;

    document.getElementById('qr-imagen').src  = qrSrc;
    document.getElementById('qr-url-texto').textContent = urlMenu;
    document.getElementById('qr-descargar').href = qrSrc;
  } catch {
    // Si falla la carga del restaurante, el QR queda en blanco
  }
}

// ─────────────────────────────────────────────────────────────
// Sidebar — nombre del restaurante
// ─────────────────────────────────────────────────────────────

async function cargarNombreRestaurante() {
  try {
    const r = await llamarAPI('/mi-restaurante');
    if (!r) return; // 401 ya redirigió a login, 402 ya mostró overlay
    if (r.plan_vencido) { mostrarPlanVencido(); return; }
    const el = document.getElementById('sidebar-restaurante-nombre');
    const plan = formatearPlan(r.plan_hasta);
    el.innerHTML = `
      <span class="sidebar-rest-nombre">${escaparHTML(r.nombre)}</span>
      <span class="badge-plan ${plan.clase}">${plan.texto}</span>`;
  } catch {
    // Silencioso: si falla, el sidebar queda en "…"
  }
}

// ─────────────────────────────────────────────────────────────
// Editor de menú — carga desde la BD
// ─────────────────────────────────────────────────────────────

async function cargarMenu() {
  const contenedor = document.getElementById('lista-categorias');
  contenedor.innerHTML = '<div class="cargando-vista">Cargando menú…</div>';
  try {
    const datos = await llamarAPI('/menu');
    estadoMenu.categorias = datos;
    renderizarCategorias();
  } catch (err) {
    contenedor.innerHTML = `<div class="error-menu">Error al cargar el menú: ${escaparHTML(err.message)}</div>`;
  }
}

// ── Render ─────────────────────────────────────────────────────

function renderizarCategorias() {
  const contenedor = document.getElementById('lista-categorias');

  if (estadoMenu.categorias.length === 0) {
    contenedor.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon"></div>
        <h3>Sin categorías</h3>
        <p>Creá una categoría para empezar a armar el menú.</p>
      </div>`;
    return;
  }

  contenedor.innerHTML = estadoMenu.categorias.map(htmlCategoria).join('');
}

function htmlCategoria(cat) {
  const abierta = estadoMenu.abierta[cat.id] ?? true;
  const n = cat.platos.length;
  return `
    <div class="categoria-item${abierta ? ' abierta' : ''}" data-cat-id="${cat.id}">
      <div class="categoria-cabecera">
        <button class="categoria-toggle btn-toggle-cat" data-cat-id="${cat.id}" type="button" aria-label="Expandir">&#9660;</button>
        <span class="categoria-nombre">${escaparHTML(cat.nombre)}</span>
        <span class="categoria-count">${n} plato${n !== 1 ? 's' : ''}</span>
        <div class="categoria-acciones">
          <button class="btn btn-ghost btn-editar-cat"    data-cat-id="${cat.id}" type="button">Editar</button>
          <button class="btn btn-danger btn-eliminar-cat" data-cat-id="${cat.id}" type="button">Eliminar</button>
        </div>
      </div>
      <div class="categoria-cuerpo">
        ${n === 0 ? '<div class="empty-categoria">Aún no hay platos en esta categoría.</div>' : ''}
        ${cat.platos.map(htmlPlato).join('')}
        <button class="btn btn-agregar-plato btn-nuevo-plato" data-cat-id="${cat.id}" type="button">+ Agregar plato</button>
      </div>
    </div>`;
}

function htmlPlato(plato) {
  const agotado = !plato.disponible;
  const fotoEstilo = plato.imagen_url
    ? `background-image:url('${plato.imagen_url}');background-size:cover;background-position:center`
    : `background:${gradientePlato(plato.id)}`;
  return `
    <div class="plato-fila${agotado ? ' agotado' : ''}" data-plato-id="${plato.id}" data-cat-id="${plato.categoria_id}">
      <div class="plato-foto-mini" style="${fotoEstilo}"></div>
      <div class="plato-fila-info">
        <span class="plato-fila-nombre">${escaparHTML(plato.nombre)}</span>
        <span class="plato-fila-desc">${escaparHTML(plato.descripcion ?? '')}</span>
      </div>
      <span class="plato-fila-precio">${formatearPrecio(plato.precio)}</span>
      <div class="plato-fila-acciones">
        <button class="btn-disponible ${agotado ? 'agotado' : 'disponible'} btn-toggle-disp" type="button">
          ${agotado ? 'Agotado' : 'Disponible'}
        </button>
        <button class="btn btn-ghost btn-editar-plato"    type="button">Editar</button>
        <button class="btn btn-danger btn-eliminar-plato" type="button">Eliminar</button>
      </div>
    </div>`;
}

// ── CRUD categorías ────────────────────────────────────────────

function toggleCategoria(id) {
  estadoMenu.abierta[id] = !(estadoMenu.abierta[id] ?? true);
  renderizarCategorias();
}

async function guardarCategoria(nombre, catId = null) {
  try {
    if (catId) {
      await llamarAPI(`/categorias/${catId}`, { method: 'PUT', body: JSON.stringify({ nombre }) });
    } else {
      await llamarAPI('/categorias', { method: 'POST', body: JSON.stringify({ nombre }) });
    }
    await cargarMenu();
  } catch (err) {
    const el = document.getElementById('modal-cat-error');
    el.textContent = err.message;
    el.classList.remove('oculto');
  }
}

async function confirmarEliminarCategoria(id) {
  const cat = estadoMenu.categorias.find(c => c.id == id);
  if (!cat) return;
  const aviso = cat.platos.length
    ? `¿Eliminar "${cat.nombre}"? Se eliminarán también sus ${cat.platos.length} plato(s).`
    : `¿Eliminar la categoría "${cat.nombre}"?`;
  if (!confirm(aviso)) return;
  try {
    await llamarAPI(`/categorias/${id}`, { method: 'DELETE' });
    await cargarMenu();
  } catch (err) {
    alert(`Error al eliminar: ${err.message}`);
  }
}

// ── CRUD platos ────────────────────────────────────────────────

// Guarda el plato y devuelve el objeto guardado (con su id), o null si falla.
async function guardarPlato(datos, platoId = null, catId = null) {
  try {
    if (platoId) {
      return await llamarAPI(`/platos/${platoId}`, { method: 'PUT', body: JSON.stringify(datos) });
    } else {
      return await llamarAPI('/platos', {
        method: 'POST',
        body: JSON.stringify({ ...datos, categoria_id: Number(catId) }),
      });
    }
  } catch (err) {
    const el = document.getElementById('modal-plato-error');
    el.textContent = err.message;
    el.classList.remove('oculto');
    return null;
  }
}

// Sube la imagen de un plato al backend (raw binary, sin multipart).
// Devuelve true si tuvo éxito.
async function subirImagenPlato(platoId, archivo) {
  const TIPOS_VALIDOS = ['image/jpeg', 'image/png', 'image/webp'];
  if (!TIPOS_VALIDOS.includes(archivo.type)) {
    mostrarErrorPlato('Solo se permiten imágenes JPG, PNG o WebP');
    return false;
  }

  const token = localStorage.getItem('clik_token');
  try {
    const res = await fetch(`${API_URL}/platos/${platoId}/imagen`, {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${token}`,
        'Content-Type': archivo.type,
      },
      body: archivo,
    });

    if (res.status === 401) {
      localStorage.removeItem('clik_token');
      localStorage.removeItem('clik_restaurant');
      window.location.replace('login.html');
      return false;
    }

    if (!res.ok) {
      const cuerpo = await res.json().catch(() => ({}));
      mostrarErrorPlato(cuerpo.error ?? 'Error al subir la imagen');
      return false;
    }

    return true;
  } catch {
    mostrarErrorPlato('No se pudo conectar con el servidor al subir la imagen');
    return false;
  }
}

function mostrarErrorPlato(msg) {
  const el = document.getElementById('modal-plato-error');
  el.textContent = msg;
  el.classList.remove('oculto');
}

async function toggleDisponiblePlato(platoId) {
  // Buscar el valor actual en el estado en memoria
  let actual;
  for (const cat of estadoMenu.categorias) {
    actual = cat.platos.find(p => p.id == platoId);
    if (actual) break;
  }
  if (!actual) return;
  try {
    await llamarAPI(`/platos/${platoId}`, {
      method: 'PATCH',
      body: JSON.stringify({ disponible: !actual.disponible }),
    });
    await cargarMenu();
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

async function confirmarEliminarPlato(platoId) {
  let actual;
  for (const cat of estadoMenu.categorias) {
    actual = cat.platos.find(p => p.id == platoId);
    if (actual) break;
  }
  if (!actual || !confirm(`¿Eliminar "${actual.nombre}"?`)) return;
  try {
    await llamarAPI(`/platos/${platoId}`, { method: 'DELETE' });
    await cargarMenu();
  } catch (err) {
    alert(`Error al eliminar: ${err.message}`);
  }
}

// ── Modal categoría ────────────────────────────────────────────

function abrirModalCategoria(modo, catId = null) {
  ctxCategoria.modo  = modo;
  ctxCategoria.catId = catId;
  document.getElementById('form-categoria').reset();
  document.getElementById('modal-cat-error').classList.add('oculto');
  document.getElementById('modal-cat-titulo').textContent = modo === 'editar' ? 'Editar categoría' : 'Nueva categoría';
  if (modo === 'editar') {
    const cat = estadoMenu.categorias.find(c => c.id == catId);
    if (cat) document.getElementById('campo-cat-nombre').value = cat.nombre;
  }
  document.getElementById('modal-categoria').classList.remove('oculto');
  document.getElementById('campo-cat-nombre').focus();
}

function cerrarModalCategoria() {
  document.getElementById('modal-categoria').classList.add('oculto');
}

// ── Modal plato ────────────────────────────────────────────────

// Aplica imagen real o gradiente al elemento preview del modal.
function mostrarFotoPreviewModal(elemento, imagenUrl, id) {
  if (imagenUrl) {
    elemento.style.cssText = `background-image:url('${imagenUrl}');background-size:cover;background-position:center`;
  } else {
    elemento.style.cssText = `background:${gradientePlato(id)}`;
  }
}

function abrirModalPlato(modo, platoId = null, catId = null) {
  ctxPlato.modo    = modo;
  ctxPlato.platoId = platoId;
  ctxPlato.catId   = catId;
  document.getElementById('form-plato').reset();
  // Limpiar el input de archivo explícitamente (reset() no lo limpia en todos los browsers)
  document.getElementById('campo-plato-imagen').value = '';
  document.getElementById('modal-plato-error').classList.add('oculto');
  document.getElementById('modal-plato-titulo').textContent = modo === 'editar' ? 'Editar plato' : 'Nuevo plato';

  const preview = document.getElementById('plato-foto-preview');

  if (modo === 'editar') {
    for (const cat of estadoMenu.categorias) {
      const p = cat.platos.find(p => p.id == platoId);
      if (p) {
        document.getElementById('campo-plato-nombre').value = p.nombre;
        document.getElementById('campo-plato-desc').value   = p.descripcion ?? '';
        document.getElementById('campo-plato-precio').value = p.precio;
        document.getElementById('campo-plato-disp').checked = p.disponible;
        mostrarFotoPreviewModal(preview, p.imagen_url, p.id);
        break;
      }
    }
  } else {
    document.getElementById('campo-plato-disp').checked = true;
    mostrarFotoPreviewModal(preview, null, Date.now());
  }

  document.getElementById('modal-plato').classList.remove('oculto');
  document.getElementById('campo-plato-nombre').focus();
}

function cerrarModalPlato() {
  document.getElementById('modal-plato').classList.add('oculto');
}

// ── Inicialización del editor ──────────────────────────────────

function inicializarEditorMenu() {
  // Delegación de eventos sobre toda la lista de categorías
  document.getElementById('lista-categorias').addEventListener('click', e => {
    const btn = e.target.closest('button');

    if (btn) {
      if (btn.classList.contains('btn-toggle-cat'))   return toggleCategoria(btn.dataset.catId);
      if (btn.classList.contains('btn-editar-cat'))   return abrirModalCategoria('editar', btn.dataset.catId);
      if (btn.classList.contains('btn-eliminar-cat')) return confirmarEliminarCategoria(btn.dataset.catId);
      if (btn.classList.contains('btn-nuevo-plato'))  return abrirModalPlato('crear', null, btn.dataset.catId);

      const fila = btn.closest('.plato-fila');
      if (fila) {
        if (btn.classList.contains('btn-toggle-disp'))    return toggleDisponiblePlato(fila.dataset.platoId);
        if (btn.classList.contains('btn-editar-plato'))   return abrirModalPlato('editar', fila.dataset.platoId, fila.dataset.catId);
        if (btn.classList.contains('btn-eliminar-plato')) return confirmarEliminarPlato(fila.dataset.platoId);
      }
      return;
    }

    // Click en cabecera (fuera de botones) → toggle acordeón
    const cabecera = e.target.closest('.categoria-cabecera');
    if (cabecera) {
      const item = cabecera.closest('.categoria-item');
      if (item) toggleCategoria(item.dataset.catId);
    }
  });

  // Modal categoría — cerrar
  document.getElementById('btn-cerrar-cat').addEventListener('click', cerrarModalCategoria);
  document.getElementById('btn-cancelar-cat').addEventListener('click', cerrarModalCategoria);
  document.getElementById('modal-categoria').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-categoria')) cerrarModalCategoria();
  });

  // Modal categoría — guardar
  document.getElementById('form-categoria').addEventListener('submit', async e => {
    e.preventDefault();
    const nombre = document.getElementById('campo-cat-nombre').value.trim();
    if (!nombre) return;
    const btn = e.target.querySelector('[type="submit"]');
    btn.disabled = true;
    await guardarCategoria(nombre, ctxCategoria.modo === 'editar' ? ctxCategoria.catId : null);
    btn.disabled = false;
    // cerrarModalCategoria solo si no hubo error (error queda visible en el modal)
    if (document.getElementById('modal-cat-error').classList.contains('oculto')) {
      cerrarModalCategoria();
    }
  });

  // Modal plato — cerrar
  document.getElementById('btn-cerrar-plato').addEventListener('click', cerrarModalPlato);
  document.getElementById('btn-cancelar-plato').addEventListener('click', cerrarModalPlato);
  document.getElementById('modal-plato').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-plato')) cerrarModalPlato();
  });

  // Modal plato — preview en tiempo real al seleccionar archivo
  document.getElementById('campo-plato-imagen').addEventListener('change', e => {
    const archivo = e.target.files[0];
    if (!archivo) return;
    const preview = document.getElementById('plato-foto-preview');
    const url = URL.createObjectURL(archivo);
    preview.style.cssText = `background-image:url('${url}');background-size:cover;background-position:center`;
  });

  // Preview es clickeable para abrir el selector de archivo
  document.getElementById('plato-foto-preview').addEventListener('click', () => {
    document.getElementById('campo-plato-imagen').click();
  });

  // Modal plato — guardar (datos + imagen si se seleccionó)
  document.getElementById('form-plato').addEventListener('submit', async e => {
    e.preventDefault();
    const nombre      = document.getElementById('campo-plato-nombre').value.trim();
    const descripcion = document.getElementById('campo-plato-desc').value.trim();
    const precio      = parseInt(document.getElementById('campo-plato-precio').value, 10);
    const disponible  = document.getElementById('campo-plato-disp').checked;
    if (!nombre || isNaN(precio) || precio < 0) return;

    const archivo = document.getElementById('campo-plato-imagen').files[0];

    const btn = e.target.querySelector('[type="submit"]');
    btn.disabled = true;

    const plato = await guardarPlato(
      { nombre, descripcion, precio, disponible },
      ctxPlato.modo === 'editar' ? ctxPlato.platoId : null,
      ctxPlato.catId
    );

    if (plato) {
      if (archivo) await subirImagenPlato(plato.id, archivo);
      await cargarMenu();
    }

    btn.disabled = false;
    if (document.getElementById('modal-plato-error').classList.contains('oculto')) {
      cerrarModalPlato();
    }
  });

  // Escape cierra cualquier modal abierto
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    cerrarModalCategoria();
    cerrarModalPlato();
  });
}

// ─────────────────────────────────────────────────────────────
// Módulo de Ganancias
// ─────────────────────────────────────────────────────────────

function formatearCOP(n) {
  return '$' + Number(n).toLocaleString('es-CO');
}

function formatearFechaCorta(fechaStr) {
  // fechaStr viene como "2026-06-29" desde el backend (DATE)
  // Construimos con año/mes/día para evitar desfase de zona horaria
  const [anio, mes, dia] = fechaStr.split('-').map(Number);
  const d = new Date(anio, mes - 1, dia);
  const hoy   = new Date();
  const ayer  = new Date(hoy); ayer.setDate(hoy.getDate() - 1);

  const mismaFecha = (a, b) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth()    === b.getMonth()    &&
    a.getDate()     === b.getDate();

  if (mismaFecha(d, hoy))  return 'Hoy';
  if (mismaFecha(d, ayer)) return 'Ayer';

  return d.toLocaleDateString('es-CO', {
    weekday: 'long',
    day:     'numeric',
    month:   'long',
  });
}

async function cargarGanancias() {
  const contenedor = document.getElementById('ganancias-contenido');
  contenedor.innerHTML = '<div class="cargando-vista">Cargando ganancias…</div>';
  try {
    const datos = await llamarAPI('/ganancias');
    renderizarGanancias(datos);
  } catch (err) {
    contenedor.innerHTML = `<div class="error-menu">Error: ${escaparHTML(err.message)}</div>`;
  }
}

function renderizarGanancias({ hoy, mes, por_dia }) {
  const contenedor = document.getElementById('ganancias-contenido');

  const filaDias = por_dia.map(d => `
    <tr class="ganancia-fila">
      <td class="ganancia-td-fecha">${escaparHTML(formatearFechaCorta(d.fecha))}</td>
      <td class="ganancia-td-num">${d.pedidos} pedido${d.pedidos !== 1 ? 's' : ''}</td>
      <td class="ganancia-td-monto">${formatearCOP(d.total)}</td>
    </tr>`).join('');

  const pluralP = n => `${n} pedido${n !== 1 ? 's' : ''}`;

  contenedor.innerHTML = `
    <div class="ganancias-cards">
      <div class="ganancia-card ganancia-hoy">
        <p class="ganancia-label">Hoy</p>
        <p class="ganancia-monto">${formatearCOP(hoy.total)}</p>
        <p class="ganancia-sub">${pluralP(hoy.pedidos)} entregado${hoy.pedidos !== 1 ? 's' : ''}</p>
      </div>
      <div class="ganancia-card ganancia-mes">
        <p class="ganancia-label">Este mes</p>
        <p class="ganancia-monto">${formatearCOP(mes.total)}</p>
        <p class="ganancia-sub">${pluralP(mes.pedidos)} entregado${mes.pedidos !== 1 ? 's' : ''}</p>
      </div>
    </div>

    ${por_dia.length === 0
      ? `<div class="empty-state">
           <div class="empty-state-icon"></div>
           <h3>Sin datos este mes</h3>
           <p>Las ganancias aparecen acá cuando marcás pedidos como entregados.</p>
         </div>`
      : `<div class="ganancias-tabla-wrap">
           <p class="ganancias-tabla-titulo">Detalle del mes</p>
           <table class="ganancias-tabla">
             <thead>
               <tr>
                 <th>Día</th>
                 <th class="ganancia-td-num">Pedidos</th>
                 <th class="ganancia-td-monto">Total</th>
               </tr>
             </thead>
             <tbody>${filaDias}</tbody>
           </table>
         </div>`
    }`;
}

// ─────────────────────────────────────────────────────────────
// Alertas sonoras y badge de pedidos nuevos
// ─────────────────────────────────────────────────────────────

const idsConocidosPedidos = new Set();  // IDs ya vistos; evita alertar dos veces
let pedidosInicializados  = false;      // true después del primer poll (no alertar en la carga inicial)
let audioCtx = null;

// Crea (o reutiliza) el AudioContext. Debe llamarse tras interacción del usuario.
function getAudioCtx() {
  if (!audioCtx) {
    try { audioCtx = new AudioContext(); } catch { return null; }
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

// Dos pitidos cortos a 880 Hz — tono neutro y claramente audible en una cocina.
function sonarAlerta() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  [0, 0.22].forEach(t => {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0,    ctx.currentTime + t);
    gain.gain.linearRampToValueAtTime(0.3,   ctx.currentTime + t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.18);
    osc.start(ctx.currentTime + t);
    osc.stop(ctx.currentTime + t + 0.2);
  });
}

// Actualiza el badge rojo en el nav. n = 0 lo oculta.
function actualizarBadgePedidos(n) {
  const badge = document.getElementById('badge-pedidos');
  if (n > 0) {
    badge.textContent = n > 9 ? '9+' : String(n);
    badge.classList.remove('oculto');
  } else {
    badge.classList.add('oculto');
  }
}

// Corre siempre (desde init), cada 30 s.
// Detecta pedidos nuevos → suena + actualiza badge.
// Si el dueño ya está en la vista de pedidos, refresca la lista en silencio.
async function pollPedidos() {
  try {
    const pedidos = await llamarAPI('/pedidos?estado=activos');

    const nuevos = pedidosInicializados
      ? pedidos.filter(p => !idsConocidosPedidos.has(p.id))
      : [];
    pedidos.forEach(p => idsConocidosPedidos.add(p.id));
    pedidosInicializados = true;

    if (nuevos.length > 0) sonarAlerta();

    // Badge = total de pedidos en estado 'pendiente' (los que aún no se empezaron a preparar)
    const pendientes = pedidos.filter(p => p.estado === 'pendiente').length;
    // Solo mostrarlo cuando el dueño NO está mirando la vista de pedidos
    actualizarBadgePedidos(estado.vistaActual === 'pedidos' ? 0 : pendientes);

    // Refrescar la lista si el dueño tiene la vista pedidos abierta con filtro activos
    if (estado.vistaActual === 'pedidos' && estadoPedidos.filtro === 'activos') {
      estadoPedidos.lista = pedidos;
      renderizarPedidos();
    }
  } catch { /* silencioso: no interrumpir al dueño si falla una consulta de fondo */ }
}

// ─────────────────────────────────────────────────────────────
// Módulo de Pedidos
// ─────────────────────────────────────────────────────────────

const estadoPedidos = {
  lista:   [],
  filtro:  'activos',  // 'activos' | 'listo' | 'todos'
};

const ESTADO_LABEL = {
  pendiente:      'Pendiente',
  en_preparacion: 'En preparación',
  listo:          'Listo',
  entregado:      'Entregado',
};

const ESTADO_SIGUIENTE_LABEL = {
  pendiente:      'Preparar',
  en_preparacion: 'Listo',
  listo:          'Entregar',
};

function tiempoRelativo(fechaStr) {
  const min = Math.floor((Date.now() - new Date(fechaStr).getTime()) / 60_000);
  if (min < 1)  return 'ahora mismo';
  if (min < 60) return `hace ${min} min`;
  return `hace ${Math.floor(min / 60)}h`;
}

function formatearPrecioCOP(n) {
  return '$' + Number(n).toLocaleString('es-CO');
}

async function cargarPedidos() {
  const contenedor = document.getElementById('lista-pedidos');
  contenedor.innerHTML = '<div class="cargando-vista">Cargando pedidos…</div>';

  const paramEstado = estadoPedidos.filtro === 'todos' ? '' : `?estado=${estadoPedidos.filtro}`;

  try {
    const pedidos = await llamarAPI(`/pedidos${paramEstado}`);
    estadoPedidos.lista = pedidos;
    renderizarPedidos();
  } catch (err) {
    contenedor.innerHTML = `<div class="error-menu">Error: ${escaparHTML(err.message)}</div>`;
  }
}

function renderizarPedidos() {
  const contenedor = document.getElementById('lista-pedidos');

  if (estadoPedidos.lista.length === 0) {
    const mensajes = {
      activos: 'No hay pedidos activos en este momento.',
      listo:   'No hay pedidos listos para entregar.',
      todos:   'Todavía no recibiste pedidos.',
    };
    contenedor.innerHTML = `
      <div class="empty-state" style="margin-top:0">
        <div class="empty-state-icon"></div>
        <h3>Sin pedidos</h3>
        <p>${mensajes[estadoPedidos.filtro] ?? ''}</p>
      </div>`;
    return;
  }

  contenedor.innerHTML = estadoPedidos.lista.map(htmlPedidoCard).join('');
}

function htmlPedidoCard(pedido) {
  const items = pedido.items ?? [];
  const total = items.reduce((s, i) => s + i.precio_unitario * i.cantidad, 0);
  const puedeAvanzar = pedido.estado !== 'entregado';

  const itemsHTML = items.map(i => `
    <li class="pedido-item-linea">
      <span>${escaparHTML(String(i.cantidad))}× ${escaparHTML(i.nombre_plato)}</span>
      <span class="pedido-item-precio">${formatearPrecioCOP(i.precio_unitario * i.cantidad)}</span>
    </li>`).join('');

  return `
    <div class="pedido-card" data-pedido-id="${pedido.id}">
      <div class="pedido-head">
        <div class="pedido-meta">
          <p class="pedido-mesa">Mesa ${escaparHTML(String(pedido.mesa_numero))}</p>
          <p class="pedido-tiempo">${tiempoRelativo(pedido.created_at)}</p>
        </div>
        <span class="badge-estado badge-${pedido.estado}">
          ${ESTADO_LABEL[pedido.estado] ?? pedido.estado}
        </span>
      </div>
      <ul class="pedido-items-lista">${itemsHTML}</ul>
      <div class="pedido-foot">
        <span class="pedido-total">Total: ${formatearPrecioCOP(total)}</span>
        ${puedeAvanzar ? `
          <button class="btn btn-primary btn-avanzar-pedido" type="button">
            ${ESTADO_SIGUIENTE_LABEL[pedido.estado] ?? '→'}
          </button>` : `<span class="pedido-tiempo">Entregado</span>`}
      </div>
    </div>`;
}

async function avanzarEstadoPedido(pedidoId) {
  try {
    const actualizado = await llamarAPI(`/pedidos/${pedidoId}`, { method: 'PATCH' });
    const idx = estadoPedidos.lista.findIndex(p => p.id == pedidoId);
    if (idx !== -1) estadoPedidos.lista[idx].estado = actualizado.estado;

    // Si el filtro activo ya no incluye este estado, quitarlo de la lista
    if (estadoPedidos.filtro === 'activos' && actualizado.estado === 'listo') {
      estadoPedidos.lista.splice(idx, 1);
    } else if (estadoPedidos.filtro === 'listo' && actualizado.estado === 'entregado') {
      estadoPedidos.lista.splice(idx, 1);
    }

    renderizarPedidos();
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

function inicializarEditorPedidos() {
  // Delegación sobre la lista de pedidos
  document.getElementById('lista-pedidos').addEventListener('click', e => {
    const btnAvanzar = e.target.closest('.btn-avanzar-pedido');
    if (!btnAvanzar) return;
    const card = btnAvanzar.closest('.pedido-card');
    if (card) avanzarEstadoPedido(card.dataset.pedidoId);
  });

  // Botón refrescar manual
  document.getElementById('btn-refrescar-pedidos').addEventListener('click', cargarPedidos);

  // Filtros
  document.querySelectorAll('.filtro-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filtro-btn').forEach(b => b.classList.remove('activo'));
      btn.classList.add('activo');
      estadoPedidos.filtro = btn.dataset.filtro;
      cargarPedidos();
    });
  });
}


// ─────────────────────────────────────────────────────────────
// Vista Cobros — métodos de pago del restaurante
// ─────────────────────────────────────────────────────────────

async function cargarCobros() {
  try {
    const r = await llamarAPI('/mi-restaurante');
    document.getElementById('cobros-nequi').value     = r.nequi     ?? '';
    document.getElementById('cobros-daviplata').value = r.daviplata ?? '';
  } catch { /* no crítico */ }
}

async function guardarCobros() {
  const btn    = document.getElementById('btn-guardar-cobros');
  const elOk   = document.getElementById('cobros-ok');
  const elErr  = document.getElementById('cobros-error');
  elOk.classList.add('oculto');
  elErr.classList.add('oculto');
  btn.disabled = true;

  try {
    await llamarAPI('/cobros', {
      method: 'PUT',
      body: JSON.stringify({
        nequi:     document.getElementById('cobros-nequi').value.trim()     || null,
        daviplata: document.getElementById('cobros-daviplata').value.trim() || null,
      }),
    });
    elOk.classList.remove('oculto');
    setTimeout(() => elOk.classList.add('oculto'), 3000);
  } catch (err) {
    elErr.textContent = err.message;
    elErr.classList.remove('oculto');
  } finally {
    btn.disabled = false;
  }
}

function inicializarCobros() {
  document.getElementById('btn-guardar-cobros').addEventListener('click', guardarCobros);
  cargarCobros();
}

// ─────────────────────────────────────────────────────────────
// Inicialización principal
// ─────────────────────────────────────────────────────────────

function init() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      cambiarVista(item.dataset.vista);
    });
  });

  document.getElementById('btn-nuevo').addEventListener('click', () => {
    if (estado.vistaActual === 'menu') abrirModalCategoria('crear');
  });

  inicializarEditorMenu();
  inicializarEditorPedidos();
  inicializarCobros();

  // Cargar nombre del restaurante en el sidebar (paralelo, no bloquea)
  cargarNombreRestaurante();

  // El AudioContext requiere interacción previa del usuario para poder reproducir sonido.
  document.addEventListener('click', () => getAudioCtx(), { once: true });

  // Polling global: detecta pedidos nuevos, suena y actualiza el badge desde cualquier vista.
  pollPedidos();
  setInterval(pollPedidos, 30_000);

  // Vista inicial: menú
  cargarMenu();
}

init();
