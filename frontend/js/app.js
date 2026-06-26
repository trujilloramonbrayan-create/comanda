// app.js — lógica del frontend (sin conexión al backend por ahora)
// Cuando el backend esté listo, las funciones marcadas con TODO
// reemplazarán los datos de ejemplo por llamadas a fetch().

// ─────────────────────────────────────────────────────────────
// Estado global mínimo
// ─────────────────────────────────────────────────────────────

const estado = {
  vistaActual: 'restaurantes',
};

// ─────────────────────────────────────────────────────────────
// Navegación entre vistas
// ─────────────────────────────────────────────────────────────

function cambiarVista(nombre) {
  // Desactivar ítem anterior
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('activo'));

  // Ocultar vista anterior
  const vistaAnterior = document.getElementById(`vista-${estado.vistaActual}`);
  if (vistaAnterior) vistaAnterior.classList.add('oculto');

  // Activar nueva vista
  estado.vistaActual = nombre;
  const vistaNueva = document.getElementById(`vista-${nombre}`);
  if (vistaNueva) vistaNueva.classList.remove('oculto');

  // Activar ítem de nav
  const navItem = document.querySelector(`[data-vista="${nombre}"]`);
  if (navItem) navItem.classList.add('activo');

  // Actualizar título y botón de acción del topbar
  const titulos = {
    restaurantes: 'Restaurantes',
    mesas:        'Mesas',
    pedidos:      'Pedidos',
    menu:         'Menú / Productos',
  };

  document.getElementById('titulo-pagina').textContent = titulos[nombre] ?? nombre;

  // El botón "Nuevo" solo tiene sentido en la vista de restaurantes por ahora
  const btnNuevo = document.getElementById('btn-nuevo');
  btnNuevo.textContent = `+ Nuevo ${titulos[nombre].toLowerCase().replace(' / productos', '')}`;
}

// ─────────────────────────────────────────────────────────────
// Modal — abrir / cerrar
// ─────────────────────────────────────────────────────────────

const modalOverlay = document.getElementById('modal-restaurante');
const formRestaurante = document.getElementById('form-restaurante');

function abrirModal() {
  formRestaurante.reset();
  document.getElementById('modal-titulo').textContent = 'Nuevo restaurante';
  modalOverlay.classList.remove('oculto');
  document.getElementById('campo-nombre').focus();
}

function cerrarModal() {
  modalOverlay.classList.add('oculto');
}

// Cerrar al hacer clic fuera del cuadro
modalOverlay.addEventListener('click', e => {
  if (e.target === modalOverlay) cerrarModal();
});

// Cerrar con Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') cerrarModal();
});

// ─────────────────────────────────────────────────────────────
// Slug — generación automática desde el nombre
// ─────────────────────────────────────────────────────────────

function generarSlug(texto) {
  return texto
    .toLowerCase()
    .normalize('NFD')                          // separa los diacríticos
    .replace(/[̀-ͯ]/g, '')           // elimina los diacríticos
    .replace(/[^a-z0-9]+/g, '-')              // reemplaza no alfanumérico con -
    .replace(/^-+|-+$/g, '');                 // recorta guiones extremos
}

const campoNombre = document.getElementById('campo-nombre');
const campoSlug   = document.getElementById('campo-slug');
let slugManual = false;  // true cuando el usuario editó el slug a mano

campoNombre.addEventListener('input', () => {
  if (!slugManual) {
    campoSlug.value = generarSlug(campoNombre.value);
  }
});

// Si el usuario toca el campo slug, dejamos de autogenerar
campoSlug.addEventListener('input', () => {
  slugManual = campoSlug.value !== generarSlug(campoNombre.value);
});

// ─────────────────────────────────────────────────────────────
// Formulario — submit
// TODO: reemplazar con fetch() POST /restaurants
// ─────────────────────────────────────────────────────────────

formRestaurante.addEventListener('submit', e => {
  e.preventDefault();
  const nombre = campoNombre.value.trim();
  const slug   = campoSlug.value.trim();

  if (!nombre || !slug) return;

  // Por ahora solo muestra en consola; aquí irá el fetch al backend
  console.log('Guardar restaurante:', { nombre, slug });

  cerrarModal();
});

// ─────────────────────────────────────────────────────────────
// Inicialización — conectar eventos
// ─────────────────────────────────────────────────────────────

function init() {
  // Navegación
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      cambiarVista(item.dataset.vista);
    });
  });

  // Botones del modal
  document.getElementById('btn-nuevo').addEventListener('click', abrirModal);
  document.getElementById('btn-cerrar').addEventListener('click', cerrarModal);
  document.getElementById('btn-cancelar').addEventListener('click', cerrarModal);
}

init();
