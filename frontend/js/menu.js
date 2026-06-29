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
  pie.appendChild(precio);
  info.appendChild(pie);

  article.appendChild(info);
  return article;
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

  // El IntersectionObserver se inicializa DESPUÉS del render, cuando los nodos existen
  iniciarScrollBehavior();
}

// ─── Scroll: resaltar tab activo al hacer scroll ─────────────────────────────
// Se llama solo después de que renderizarMenu haya insertado los elementos en el DOM.

function iniciarScrollBehavior() {
  const secciones = Array.from(document.querySelectorAll('.categoria'));
  const tabs = Array.from(document.querySelectorAll('.cat-tab'));
  const OFFSET_TOP = 60;

  function activarTab(id) {
    tabs.forEach(t => t.classList.toggle('activo', t.dataset.cat === id));
    const tabActivo = tabs.find(t => t.dataset.cat === id);
    if (tabActivo) {
      tabActivo.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }

  const observer = new IntersectionObserver(
    entries => {
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
      const seccion = document.getElementById(tab.dataset.cat);
      if (!seccion) return;
      const navAlto = document.getElementById('nav-cat').offsetHeight;
      const y = seccion.getBoundingClientRect().top + window.scrollY - navAlto - 8;
      window.scrollTo({ top: y, behavior: 'smooth' });
    });
  });
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────

async function cargarMenu() {
  const slug = new URLSearchParams(window.location.search).get('slug');

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
