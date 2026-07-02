# clik — fuente de verdad del proyecto
# Dominio de producción: clik.work
# Fecha de referencia: julio 2026 — meta: 200 restaurantes pagando para julio 2027

---

## Qué es clik

SaaS autoservicio que se vende a restaurantes por suscripción mensual. El restaurante paga **$50.000 COP/mes** (primer mes gratis) y obtiene:

- Menú digital con código QR listo para imprimir
- Sistema de pedidos en línea desde la mesa del cliente
- Pago con tarjeta/PSE vía Mercado Pago, Nequi, Daviplata o efectivo
- Panel de administración para gestionar menú, pedidos y ganancias

**Diferencial vs. delivery:** sin comisión por venta. Un restaurante que vende $2M COP/mes en pedidos paga $50k/mes fijo con clik, en vez de $500k–600k de comisión con Rappi o iFood. El dinero de cada venta va directo al restaurante; clik solo cobra la suscripción.

---

## Principio de operación: 100% autoservicio

El operador de clik **no** da de alta clientes a mano, no carga menús, no genera QR, no hace ningún trabajo manual por restaurante. El restaurante se registra solo, configura todo solo y administra su propio negocio. El software corre sin intervención humana.

**No existe panel de administrador del operador.** clik es software que se vende y se administra solo.

Flujo de adquisición:
1. Restaurante llega por Google o link directo → `clik.work`
2. Hace clic en "Probar gratis" → `register.html`
3. Completa el registro en 2 minutos → queda con 30 días de prueba activos
4. Sube su menú, descarga el QR, lo imprime, empieza a recibir pedidos

---

## Las 3 partes del producto

### 1. Landing pública — `landing.html`
Página de marketing. Explica el producto, el precio y el diferencial vs. delivery. CTA: "Probar gratis" → `register.html`. Es la puerta de entrada de nuevos clientes.

### 2. Panel del dueño — `index.html`
Lo accede el restaurante tras el login. Vistas disponibles:
- **Menú**: editor de categorías y platos (nombre, descripción, precio, imagen, disponibilidad)
- **Pedidos**: lista en tiempo real con estados (pendiente → en preparación → listo → entregado), filtros por estado
- **Ganancias**: resumen del período
- **QR**: código QR del restaurante listo para descargar e imprimir
- **Métodos de pago**: configuración de números Nequi y Daviplata; estado de Mercado Pago y efectivo

Multitenant: cada dueño ve y edita solo sus propios datos.

### 3. Menú público — `menu.html`
Lo que ve el cliente final al escanear el QR en la mesa. URL: `clik.work/menu.html?slug={slug}` (pendiente migrar a `/r/{slug}`). Sin login. Muestra categorías y platos del restaurante, carrito de compras y métodos de pago disponibles.

---

## Infraestructura de producción

| Componente | Servicio | URL |
|---|---|---|
| Frontend (estáticos) | Vercel | `clik.work` |
| Backend (API) | Render | `comanda-g891.onrender.com` |
| Base de datos | Supabase (PostgreSQL) | pool pg directo |
| Imágenes de platos | Supabase Storage | bucket público `platos` |

**Vercel actúa como proxy:** rewrites en `frontend/vercel.json` redirigen las rutas de API hacia Render. El frontend nunca llama directo a Render en producción — todo pasa por `clik.work`.

Variables de entorno en Render:
- `DATABASE_URL` — cadena de conexión Supabase
- `JWT_SECRET` — secreto para firmar tokens
- `SUPABASE_URL` — URL del proyecto Supabase
- `SUPABASE_SERVICE_ROLE_KEY` — clave de servicio para Supabase Storage
- `APP_URL` — `https://clik.work`
- `MP_ACCESS_TOKEN` — token de Mercado Pago de clik (pendiente configurar)

---

## Stack (no proponer alternativas)

### Backend
- **Runtime**: Node.js con type stripping (`--experimental-strip-types`), sin paso de build. `.node-version`: `22.6.0`
- **HTTP**: módulo `node:http` nativo, sin frameworks
- **Router**: implementado a mano en `src/router.ts` (método + patrón con params `/:slug`)
- **Base de datos**: `pg` con SQL escrito a mano, sin ORM ni query builders
- **Auth**: `bcrypt` para hashes, `jsonwebtoken` para tokens JWT (expiración 7 días)
- **Config**: `process.loadEnvFile()` nativo de Node, sin dotenv
- **TypeScript**: type stripping — los tipos se eliminan en runtime, no hay compilación

### Frontend
- HTML semántico, CSS con variables nativas (design tokens en `:root`), JS vanilla
- Sin React, Vue, ni ningún framework de UI
- Sin bundler ni paso de build — archivos estáticos servidos directamente por Vercel
- Sin librerías externas (Bootstrap, Tailwind, jQuery, etc.)
- Patrón `esLocal`: detecta si corre en localhost para apuntar la API a Render o a `localhost:3000`

---

## Arrancar el backend en local

```bash
cd backend
cp .env.example .env   # completar DATABASE_URL, JWT_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
npm install
npm run dev            # node --watch --experimental-strip-types src/server.ts
```

---

## Esquema de base de datos

```
restaurants   — un registro por restaurante; campos: nombre, slug, activo, plan_hasta, nequi, daviplata
owners        — credenciales de acceso del dueño (1:1 con restaurants)
categorias    — secciones del menú (Entradas, Pastas…), ordenadas por `orden`
platos        — platos del menú; FK a categoria + restaurant; imagen en Supabase Storage
mesas         — mesas del restaurante (tabla existente, aún no integrada al flujo de pedidos)
pedidos       — pedidos creados desde el menú público; estado: pendiente→en_preparacion→listo→entregado
pedido_items  — ítems de cada pedido (snapshot de nombre y precio al momento del pedido)
mp_credentials — credenciales OAuth MP por restaurante (tabla existente, integración pendiente de activar)
```

**Patrón multitenant:** toda tabla de negocio lleva `restaurant_id INTEGER NOT NULL REFERENCES restaurants(id)`. Todas las queries deben filtrar por `restaurant_id` para aislar datos entre tenants.

---

## Endpoints de la API

### Públicos (sin autenticación)
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health` | Estado del servidor |
| POST | `/auth/register` | Registro de nuevo restaurante + dueño (crea 30 días de prueba) |
| POST | `/auth/login` | Login; devuelve JWT |
| GET | `/r/:slug` | Menú público del restaurante (categorías, platos, métodos de pago disponibles) |
| POST | `/r/:slug/pedidos` | Cliente crea un pedido |
| POST | `/mp/webhook` | Webhook de Mercado Pago (confirma pagos) |

### Protegidos — requieren `Authorization: Bearer <token>`
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/mi-restaurante` | Datos del restaurante del dueño autenticado |
| PUT | `/cobros` | Actualizar números de Nequi y Daviplata |
| GET | `/menu` | Menú completo del restaurante (para el editor) |
| POST | `/categorias` | Crear categoría |
| PUT | `/categorias/:id` | Editar categoría |
| DELETE | `/categorias/:id` | Eliminar categoría |
| POST | `/platos` | Crear plato |
| POST | `/platos/:id/imagen` | Subir imagen del plato a Supabase Storage |
| PUT | `/platos/:id` | Editar plato |
| PATCH | `/platos/:id` | Cambiar disponibilidad del plato |
| DELETE | `/platos/:id` | Eliminar plato |
| GET | `/pedidos` | Listar pedidos del restaurante (filtros: `?estado=activos`, `?estado=listo`) |
| PATCH | `/pedidos/:id` | Avanzar estado del pedido |
| GET | `/ganancias` | Resumen de ganancias del período |

---

## Estructura de archivos

```
clik/
  backend/
    src/
      config.ts         — carga y valida variables de entorno
      db.ts             — pool pg + helpers query<T>, queryOne<T>, transaccion()
      router.ts         — router manual: registrar() y despachar()
      server.ts         — punto de entrada: registra todas las rutas, crea el servidor HTTP
      utils.ts          — helpers HTTP: responderJSON(), leerCuerpo()
      auth.ts           — POST /auth/register y /auth/login + verificarToken()
      menu.ts           — CRUD de menú (categorías, platos, imágenes) + PUT /cobros
      menu-publico.ts   — GET /r/:slug (menú público sin auth)
      pedidos.ts        — POST /r/:slug/pedidos, GET /pedidos, PATCH /pedidos/:id
      ganancias.ts      — GET /ganancias
      mp.ts             — crearPreferenciaMP() + webhookMP (POST /mp/webhook)
    db/
      schema.sql             — DDL completo de todas las tablas
      migration_cobros.sql   — migración: columns nequi, daviplata en restaurants; metodo_pago en pedidos
    .node-version            — 22.6.0 (type stripping requiere ≥ 22.6)
    .env.example
    package.json
  frontend/
    landing.html        — landing pública de marketing
    register.html       — registro de nuevos restaurantes
    login.html          — login de dueños
    index.html          — panel del dueño (menú, pedidos, ganancias, QR, cobros)
    menu.html           — menú público para clientes finales
    css/
      landing.css       — estilos de landing.html
      styles.css        — design tokens (:root) + estilos del panel del dueño
      menu.css          — estilos del menú público y carrito
    js/
      app.js            — lógica del panel del dueño (auth, menú, pedidos, QR, cobros)
      menu.js           — lógica del menú público (carrito, pedido, pago)
    vercel.json         — rewrites de Vercel hacia Render; orden exacto importa (rutas exactas antes de wildcards)
```

---

## Flujo de pago

El menú público muestra solo los métodos activos para ese restaurante:

- **Efectivo**: siempre disponible; el cliente paga al mesero al recibir el pedido
- **Nequi**: visible si el restaurante configuró su número; el cliente hace la transferencia y muestra el comprobante
- **Daviplata**: igual que Nequi
- **Mercado Pago** (tarjeta/PSE/PSE): visible si `MP_ACCESS_TOKEN` está configurado en Render; redirige al checkout de MP y confirma vía webhook

Los pedidos de Nequi y Daviplata aparecen en el panel del dueño con estado `pendiente` — la verificación del pago es manual (el mesero pide el comprobante). Los pedidos de MP solo aparecen una vez que el webhook de MP confirma el pago (`mp_payment_id` queda guardado).

---

## Lo que falta construir (prioridad de julio 2026 en adelante)

### Bloqueante inmediato
1. **Alerta sonora en el panel de pedidos** — cuando llega un pedido nuevo, el panel debe emitir un sonido y mostrar una notificación visual prominente. Sin esto, un restaurante ocupado pierde pedidos. El panel ya hace polling; falta agregar el `Audio` y la lógica de diff.

2. **Enforcement del plan** — `plan_hasta` existe en la BD pero nunca se verifica. Un restaurante puede usar clik gratis indefinidamente. Hay que bloquear el acceso al panel y al menú público cuando el plan esté vencido, y mostrar una pantalla de renovación.

3. **`MP_ACCESS_TOKEN` en Render** — la variable está en el código pero no en las variables de entorno de Render. Sin esto los clientes del restaurante no pueden pagar con tarjeta. Es una sola variable de entorno.

### Siguiente etapa (escala)
4. **Cobro automático de la suscripción** — clik necesita cobrar los $50.000/mes automáticamente (link de pago, débito recurrente, o similar). Hoy no existe ningún mecanismo de cobro.

5. **Notificación al cliente del estado del pedido** — el cliente no sabe si su pedido está siendo preparado. Un refresh de la vista de post-pedido o un flujo de seguimiento mejoraría la experiencia.

6. **URL limpia del menú** — el QR lleva a `clik.work/menu.html?slug=X`. La URL correcta sería `clik.work/r/X`. Requiere que Vercel sirva `menu.html` cuando llega a `/r/:slug` en vez de proxy al backend.

7. **Panel optimizado para móvil** — los dueños de restaurante suelen usar el celular. El panel actual no está diseñado pensando en pantallas pequeñas.

8. **Integración de mesas** — la tabla `mesas` existe en la BD pero no está integrada. El cliente escribe libremente su número de mesa. Validar contra las mesas configuradas mejoraría la experiencia.

---

## Convenciones

### Backend
- Un archivo = una responsabilidad
- Imports con extensión `.ts` (requerido por Node type stripping + `moduleResolution NodeNext`)
- Sin abstracciones especulativas: si algo se usa una sola vez, no se extrae
- Comentarios solo cuando el "por qué" no es obvio
- Nombres de dominio en español; términos técnicos en inglés
- Errores de validación de entorno se lanzan al arrancar, no en runtime
- Validar siempre `restaurant_id` del JWT antes de cualquier operación de escritura

### Frontend
- Clases CSS en español cuando describen dominio (`.campo`, `.oculto`, `.activo`, `.cobros-card`)
- CSS variables para todos los valores visuales: colores, tipografía, espaciado
- JS sin `var`, sin jQuery, sin librerías externas
- Patrón `esLocal` para detectar entorno y apuntar la URL de API correcta
- Funciones pequeñas y con nombre descriptivo

### Git
- Commits atómicos en español
- Paso a paso, una cosa a la vez
- No adelantarse a etapas futuras
- No proponer frameworks
