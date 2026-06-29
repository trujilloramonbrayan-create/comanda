// menu.js — menú público dinámico
//
// Convención de URL: menu.html?slug=<slug-del-restaurante>
// El backend expone GET /r/:slug (API). El frontend lee el slug del query string.
// Funciona en local (Live Server / file://) y en producción sin cambios de código.

// Local → backend directo en :3000. Producción (clik.work) → URL relativa '' (Nginx proxea)
const esLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname)
  || /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(window.location.hostname);
const API_URL = esLocal ? `http://${window.location.hostname}:3000` : '';

// ─── Helpers ────────────────────────────────────────────────────────────────

function escaparHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Formatea precio entero en pesos colombianos: 12000 → "$12.000"
function formatearPrecio(n) {
  return '$' + Number(n).toLocaleString('es-CO');
}

// Extrae las iniciales del nombre para el logo circular (máximo 2 palabras)
function iniciales(nombre) {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0].toUpperCase())
    .join('');
}

// ─── Estados de pantalla ─────────────────────────────────────────────────────

function mostrarCargando() {
  document.getElementById('estado-cargando').classList.remove('oculto');
  document.getElementById('estado-mensaje').classList.add('oculto');
}

function mostrarMensaje(titulo, subtitulo) {
  document.getElementById('estado-cargando').classList.add('oculto');
  document.getElementById('estado-titulo').textContent = titulo;
  document.getElementById('estado-subtitulo').textContent = subtitulo;
  document.getElementById('estado-mensaje').classList.remove('oculto');
}

function mostrarContenido() {
  document.getElementById('estado-cargando').classList.add('oculto');
  document.getElementById('estado-mensaje').classList.add('oculto');
  ['seccion-hero', 'nav-cat', 'menu-body', 'seccion-pie'].forEach(id => {
    document.getElementById(id).classList.remove('oculto');
  });
}

// ─── Render ──────────────────────────────────────────────────────────────────

// Gradientes deterministas para fotos placeholder: el índice depende del id del plato
const GRADIENTES = [
  'linear-gradient(145deg,#e8956d,#c94e35)',
  'linear-gradient(145deg,#c4956a,#8b6040)',
  'linear-gradient(145deg,#e8b86d,#c08030)',
  'linear-gradient(145deg,#e86050,#c03020)',
  'linear-gradient(145deg,#e8d498,#c0a040)',
  'linear-gradient(145deg,#b8d498,#6a9040)',
  'linear-gradient(145deg,#d4a870,#9a6c38)',
  'linear-gradient(145deg,#6b4838,#3a2018)',
];

// Construye el nodo <article> de un plato. Usa textContent (seguro, no XSS).
function crearNodoPlato(plato) {
  const article = document.createElement('article');
  article.className = 'plato';

  const foto = document.createElement('div');
  foto.className = 'plato-foto';
  if (plato.imagen_url) {
    foto.style.backgroundImage    = `url('${plato.imagen_url}')`;
    foto.style.backgroundSize     = 'cover';
    foto.style.backgroundPosition = 'center';
  } else {
    foto.style.background = GRADIENTES[plato.id % GRADIENTES.length];
  }
  article.appendChild(foto);

  const info = document.createElement('div');
  info.className = 'plato-info';

  const cabecera = document.createElement('div');
  cabecera.className = 'plato-cabecera';
  const nombre = document.createElement('h3');
  nombre.className = 'plato-nombre';
  nombre.textContent = plato.nombre;
  cabecera.appendChild(nombre);
  info.appendChild(cabecera);

  if (plato.descripcion) {
    const desc = document.createElement('p');
    desc.className = 'plato-desc';
    desc.textContent = plato.descripcion;
    info.appendChild(desc);
  }

  const pie = document.createElement('div');
  pie.className = 'plato-pie';
  const precio = document.createElement('span');
  precio.className = 'plato-precio';
  precio.textContent = formatearPrecio(plato.precio);
  // Guardamos el número en data-precio para leerlo al agregar al carrito
  precio.dataset.precio = String(plato.precio);
  pie.appendChild(precio);
  info.appendChild(pie);

  // Control de cantidad (inicialmente muestra "Agregar")
  const ctrl = document.createElement('div');
  ctrl.className = 'plato-ctrl';
  ctrl.id = `ctrl-plato-${plato.id}`;
  ctrl.innerHTML = `<button class="btn-agregar" data-plato-id="${plato.id}">Agregar</button>`;
  info.appendChild(ctrl);

  article.appendChild(info);
  return article;
}

// Mesa actual seleccionada por el cliente
let mesaActual = null;

// Slug del restaurante — necesario para POST /r/:slug/pedidos
let slugRestaurante = null;

// Carrito: Map<platoId, { nombre, precio, cantidad }>
const carrito = new Map();

function actualizarMesa(num) {
  const badge = document.getElementById('badge-mesa');
  if (Number.isInteger(num) && num > 0) {
    mesaActual = num;
    badge.textContent = `Mesa ${num}`;
    badge.classList.remove('oculto');
  } else {
    mesaActual = null;
    badge.classList.add('oculto');
  }
}

function inicializarSelectorMesa() {
  document.getElementById('carrito-input-mesa').addEventListener('input', e => {
    actualizarMesa(parseInt(e.target.value, 10));
    // Limpiar error visual si lo había
    e.target.classList.remove('input-error');
    document.getElementById('carrito-error').classList.add('oculto');
  });
}

// ─── Carrito ─────────────────────────────────────────────────────────────────

function totalCarrito() {
  let total = 0;
  carrito.forEach(({ precio, cantidad }) => { total += precio * cantidad; });
  return total;
}

function cantidadCarrito() {
  let cant = 0;
  carrito.forEach(({ cantidad }) => { cant += cantidad; });
  return cant;
}

function actualizarBarraCarrito() {
  const cant  = cantidadCarrito();
  const bar   = document.getElementById('carrito-bar');
  if (cant === 0) {
    bar.classList.add('oculto');
    return;
  }
  bar.classList.remove('oculto');
  document.getElementById('carrito-cant').textContent      = cant;
  document.getElementById('carrito-bar-total').textContent = formatearPrecio(totalCarrito());
}

function renderizarItemsCarrito() {
  const contenedor = document.getElementById('carrito-items');
  contenedor.innerHTML = '';

  carrito.forEach(({ nombre, precio, cantidad }, platoId) => {
    const div = document.createElement('div');
    div.className = 'carrito-item';
    div.innerHTML = `
      <div class="carrito-item-info">
        <p class="carrito-item-nombre">${escaparHTML(nombre)}</p>
        <p class="carrito-item-precio">${formatearPrecio(precio)} c/u</p>
      </div>
      <div class="carrito-item-ctrl">
        <button class="btn-qty-drawer" data-plato-id="${platoId}" data-accion="menos">−</button>
        <span class="carrito-item-qty">${cantidad}</span>
        <button class="btn-qty-drawer" data-plato-id="${platoId}" data-accion="mas">+</button>
      </div>`;
    contenedor.appendChild(div);
  });

  document.getElementById('carrito-total-drawer').textContent = formatearPrecio(totalCarrito());
}

function actualizarControlPlato(platoId) {
  const ctrl = document.getElementById(`ctrl-plato-${platoId}`);
  if (!ctrl) return;
  const item = carrito.get(platoId);
  if (!item || item.cantidad === 0) {
    ctrl.innerHTML = `<button class="btn-agregar" data-plato-id="${platoId}">Agregar</button>`;
  } else {
    ctrl.innerHTML = `
      <div class="qty-ctrl-plato">
        <button class="btn-qty-plato" data-plato-id="${platoId}" data-accion="menos">−</button>
        <span class="qty-plato-num">${item.cantidad}</span>
        <button class="btn-qty-plato" data-plato-id="${platoId}" data-accion="mas">+</button>
      </div>`;
  }
}

function cambiarCantidad(platoId, delta) {
  const item = carrito.get(platoId);
  if (!item) return;
  const nueva = item.cantidad + delta;
  if (nueva <= 0) {
    carrito.delete(platoId);
  } else {
    item.cantidad = Math.min(nueva, 99);
  }
  actualizarControlPlato(platoId);
  actualizarBarraCarrito();
  renderizarItemsCarrito();
}

function abrirCarrito() {
  renderizarItemsCarrito();
  document.getElementById('carrito-overlay').classList.remove('oculto');
  document.body.style.overflow = 'hidden';
}

function cerrarCarrito() {
  document.getElementById('carrito-overlay').classList.add('oculto');
  document.getElementById('carrito-error')?.classList.add('oculto');
  document.body.style.overflow = '';
}

async function confirmarPedido() {
  if (carrito.size === 0) return;

  // Validar mesa
  if (!mesaActual) {
    const inputMesa = document.getElementById('carrito-input-mesa');
    const el        = document.getElementById('carrito-error');
    inputMesa.classList.add('input-error');
    inputMesa.focus();
    el.textContent = 'Ingresá el número de tu mesa para continuar.';
    el.classList.remove('oculto');
    return;
  }

  const btn = document.getElementById('btn-confirmar-pedido');
  btn.disabled = true;
  btn.textContent = 'Enviando…';
  document.getElementById('carrito-error').classList.add('oculto');

  const items = [];
  carrito.forEach(({ cantidad }, platoId) => items.push({ plato_id: platoId, cantidad }));

  try {
    const res = await fetch(`${API_URL}/r/${encodeURIComponent(slugRestaurante)}/pedidos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mesa_numero: mesaActual, items }),
    });

    if (!res.ok) {
      const datos = await res.json().catch(() => ({}));
      throw new Error(datos.error ?? `Error ${res.status}`);
    }

    // Éxito — limpiar carrito y mostrar pantalla de confirmación
    const mesaConfirmada = mesaActual;
    carrito.clear();
    actualizarBarraCarrito();

    document.getElementById('carrito-drawer').innerHTML = `
      <div class="pedido-enviado">
        <div class="pedido-enviado-check">✓</div>
        <h3>¡Pedido enviado!</h3>
        <p>Mesa ${mesaConfirmada} · Te lo llevamos en breve.</p>
      </div>`;

    setTimeout(cerrarCarrito, 2500);

  } catch (err) {
    const el = document.getElementById('carrito-error');
    el.textContent = err.message;
    el.classList.remove('oculto');
    btn.disabled = false;
    btn.textContent = 'Confirmar pedido';
  }
}

function inicializarCarrito() {
  // Apertura / cierre
  document.getElementById('btn-abrir-carrito').addEventListener('click', abrirCarrito);
  document.getElementById('btn-cerrar-carrito').addEventListener('click', cerrarCarrito);
  document.getElementById('carrito-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('carrito-overlay')) cerrarCarrito();
  });

  // Confirmar pedido
  document.getElementById('btn-confirmar-pedido').addEventListener('click', confirmarPedido);

  // Delegación de eventos para botones +/- del drawer
  document.getElementById('carrito-items').addEventListener('click', e => {
    const btn = e.target.closest('.btn-qty-drawer');
    if (!btn) return;
    const platoId = parseInt(btn.dataset.platoId, 10);
    cambiarCantidad(platoId, btn.dataset.accion === 'mas' ? 1 : -1);
  });

  // Delegación de eventos para botones en las tarjetas del menú
  document.getElementById('menu-body').addEventListener('click', e => {
    // Botón "Agregar"
    const btnAgregar = e.target.closest('.btn-agregar');
    if (btnAgregar) {
      const platoId = parseInt(btnAgregar.dataset.platoId, 10);
      const ctrl = document.getElementById(`ctrl-plato-${platoId}`);
      // Tomamos el nombre y precio del nodo del plato
      const article = ctrl.closest('.plato');
      const nombre  = article.querySelector('.plato-nombre').textContent;
      const precioEl = article.querySelector('.plato-precio');
      // El precio formateado es "$12.000" — lo reconvertimos al número
      const precio = parseInt(precioEl.dataset.precio, 10);
      carrito.set(platoId, { nombre, precio, cantidad: 1 });
      actualizarControlPlato(platoId);
      actualizarBarraCarrito();
      return;
    }

    // Botones +/- en la tarjeta del plato
    const btnQty = e.target.closest('.btn-qty-plato');
    if (btnQty) {
      const platoId = parseInt(btnQty.dataset.platoId, 10);
      cambiarCantidad(platoId, btnQty.dataset.accion === 'mas' ? 1 : -1);
    }
  });
}

function renderizarMenu(datos) {
  const { restaurante, categorias } = datos;

  // Título de pestaña y meta description
  document.title = `${restaurante.nombre} — Menú`;
  document.getElementById('meta-desc').setAttribute('content', `Menú de ${restaurante.nombre}`);

  // Hero: nombre e iniciales
  document.getElementById('restaurante-logo').textContent = iniciales(restaurante.nombre);
  document.getElementById('restaurante-nombre').textContent = restaurante.nombre;

  const contenedorTabs = document.getElementById('contenedor-tabs');
  const menuBody       = document.getElementById('menu-body');

  categorias.forEach((cat, i) => {
    const catId = `cat-${cat.id}`;

    // Tab de navegación
    const tab = document.createElement('a');
    tab.href = `#${catId}`;
    tab.className = 'cat-tab' + (i === 0 ? ' activo' : '');
    tab.dataset.cat = catId;
    tab.textContent = cat.nombre;
    contenedorTabs.appendChild(tab);

    // Sección de categoría con sus platos
    const seccion = document.createElement('section');
    seccion.className = 'categoria';
    seccion.id = catId;

    const titulo = document.createElement('h2');
    titulo.className = 'categoria-titulo';
    titulo.textContent = cat.nombre;
    seccion.appendChild(titulo);

    cat.platos.forEach(plato => seccion.appendChild(crearNodoPlato(plato)));

    menuBody.appendChild(seccion);
  });

  mostrarContenido();
  inicializarSelectorMesa();
  inicializarCarrito();

  // El IntersectionObserver se inicializa DESPUÉS del render, cuando los nodos existen
  iniciarScrollBehavior();
}

// ─── Scroll: resaltar tab activo al hacer scroll ─────────────────────────────
// Se llama solo después de que renderizarMenu haya insertado los elementos en el DOM.

function iniciarScrollBehavior() {
  const secciones = Array.from(document.querySelectorAll('.categoria'));
  const tabs = Array.from(document.querySelectorAll('.cat-tab'));
  const navScroll = document.getElementById('contenedor-tabs');
  const OFFSET_TOP = 60;

  // Centra el tab activo en el nav horizontal SIN tocar el scroll de la página.
  // scrollIntoView() puede mover la página entera aunque el nav sea sticky — por eso
  // se desplaza directamente el contenedor del nav con scrollTo.
  function activarTab(id) {
    tabs.forEach(t => t.classList.toggle('activo', t.dataset.cat === id));
    const tabActivo = tabs.find(t => t.dataset.cat === id);
    if (!tabActivo) return;
    const left = tabActivo.offsetLeft - (navScroll.offsetWidth - tabActivo.offsetWidth) / 2;
    navScroll.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
  }

  // Mientras dura el scroll de un clic en tab, ignoramos el observer para que no
  // haya un ciclo que haga saltar la página.
  let bloqueadoPorClic = false;

  const observer = new IntersectionObserver(
    entries => {
      if (bloqueadoPorClic) return;
      entries.forEach(entry => {
        if (entry.isIntersecting) activarTab(entry.target.id);
      });
    },
    { rootMargin: `-${OFFSET_TOP}px 0px -60% 0px`, threshold: 0 }
  );

  secciones.forEach(s => observer.observe(s));

  tabs.forEach(tab => {
    tab.addEventListener('click', e => {
      e.preventDefault();
      bloqueadoPorClic = true;
      activarTab(tab.dataset.cat);
      const seccion = document.getElementById(tab.dataset.cat);
      if (!seccion) return;
      const navAlto = document.getElementById('nav-cat').offsetHeight;
      const y = seccion.getBoundingClientRect().top + window.scrollY - navAlto - 8;
      window.scrollTo({ top: y, behavior: 'smooth' });
      // Desbloquear después de que termina la animación de scroll (~600ms)
      setTimeout(() => { bloqueadoPorClic = false; }, 700);
    });
  });
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────

async function cargarMenu() {
  const params = new URLSearchParams(window.location.search);
  const slug   = params.get('slug');
  slugRestaurante = slug;

  if (!slug) {
    mostrarMensaje(
      'Sin menú seleccionado',
      'Escaneá el código QR de tu mesa para ver el menú del restaurante.'
    );
    return;
  }

  mostrarCargando();

  try {
    const respuesta = await fetch(`${API_URL}/r/${encodeURIComponent(slug)}`);
    const datos = await respuesta.json();

    if (respuesta.status === 404) {
      mostrarMensaje(
        'Este menú no existe o fue dado de baja',
        'Verificá que el código QR sea el correcto o consultá al personal.'
      );
      return;
    }

    if (!respuesta.ok) {
      mostrarMensaje(
        'No se pudo cargar el menú',
        datos.error ?? `Error ${respuesta.status}`
      );
      return;
    }

    if (!datos.categorias || datos.categorias.length === 0) {
      mostrarMensaje(
        'Este restaurante todavía no cargó su menú',
        'Volvé a intentarlo en unos minutos.'
      );
      return;
    }

    renderizarMenu(datos);

  } catch {
    mostrarMensaje(
      'No se pudo conectar con el servidor',
      'Verificá tu conexión a internet e intentá de nuevo.'
    );
  }
}

cargarMenu();
