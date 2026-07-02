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
3. Completa el registro en 2 minutos → queda con 30 días de prueba activos automáticamente
4. Sube su menú, descarga el QR, lo imprime, empieza a recibir pedidos

---

## Las 3 partes del producto

### 1. Landing pública — `landing.html`
Página de marketing. Explica el producto, el precio y el diferencial vs. delivery. CTA: "Probar gratis" → `register.html`. Es la puerta de entrada de nuevos clientes.

### 2. Panel del dueño — `index.html`
Lo accede el restaurante tras el login. Vistas disponibles:
- **Menú**: editor de categorías y platos (nombre, descripción, precio, imagen, disponibilidad)
- **Mi QR**: código QR del restaurante listo para descargar e imprimir
- **Métodos de pago**: configura números de Nequi y Daviplata; muestra estado de MP y efectivo
- **Pedidos**: lista en tiempo real con estados (pendiente → en preparación → listo → entregado), filtros por estado, alerta sonora al llegar pedidos nuevos, badge rojo en el nav
- **Ganancias**: resumen del período (hoy, mes, desglose por día)

Multitenant: cada dueño ve y edita solo sus propios datos. El `restaurant_id` viene siempre del JWT, nunca del cliente.

### 3. Menú público — `menu.html`
Lo que ve el cliente final al escanear el QR en la mesa. URL actual: `clik.work/menu.html?slug={slug}`. Sin login. Muestra categorías, platos con imagen, carrito de compras y métodos de pago disponibles para ese restaurante.

---

## Infraestructura de producción

| Componente | Servicio | URL |
|---|---|---|
| Frontend (estáticos) | Vercel | `clik.work` |
| Backend (API) | Render | `comanda-g891.onrender.com` |
| Base de datos | Supabase (PostgreSQL) | pool pg directo con `pg` |
| Imágenes de platos | Supabase Storage | bucket público `platos` |

**Vercel actúa como proxy:** los rewrites en `frontend/vercel.json` redirigen rutas de API hacia Render. El frontend nunca llama directo a Render en producción — todo pasa por `clik.work`. El orden de los rewrites importa: rutas exactas antes que wildcards (`/pedidos` antes de `/pedidos/:path*`).

Variables de entorno en Render (todas requeridas salvo MP_ACCESS_TOKEN):
- `DATABASE_URL` — cadena de conexión Supabase
- `JWT_SECRET` — secreto para firmar tokens
- `SUPABASE_URL` — URL del proyecto Supabase
- `SUPABASE_SERVICE_ROLE_KEY` — clave de servicio para Supabase Storage
- `APP_URL` — `https://clik.work`
- `MP_ACCESS_TOKEN` — token de Mercado Pago de clik (**pendiente configurar en Render** — sin esto los pagos con tarjeta no funcionan)

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
- Patrón `esLocal`: detecta si corre en localhost para apuntar la API a `localhost:3000` o usar URL relativa

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
restaurants    — un registro por restaurante
               campos: nombre, slug, activo, plan_hasta, nequi, daviplata
               plan_hasta: TIMESTAMPTZ — si < NOW() el plan está vencido

owners         — credenciales del dueño (1:1 con restaurants)
               campos: restaurant_id, email, password_hash, rol ('owner' | 'superadmin')

categorias     — secciones del menú (Entradas, Pastas…), ordenadas por `orden`

platos         — platos del menú
               FK doble: categoria_id + restaurant_id
               imagen_url apunta a Supabase Storage (bucket público "platos")
               precio en pesos colombianos enteros

mesas          — tabla existente, aún no integrada al flujo de pedidos

pedidos        — pedidos creados desde el menú público
               estado: pendiente → en_preparacion → listo → entregado (avance en un solo sentido)
               metodo_pago: 'efectivo' | 'mp' | 'nequi' | 'daviplata'
               mp_preference_id: ID de preferencia MP (solo pedidos MP)
               mp_payment_id: ID del pago confirmado por webhook (solo pedidos MP pagados)
               Los pedidos de nequi/daviplata/efectivo aparecen siempre; los de MP solo si mp_payment_id != null

pedido_items   — snapshot de nombre y precio al momento del pedido (nunca mutan con el menú)

mp_credentials — tabla existente para OAuth MP por restaurante (no usada actualmente)
```

**Patrón multitenant:** toda tabla de negocio lleva `restaurant_id INTEGER NOT NULL REFERENCES restaurants(id)`. Todas las queries deben filtrar por `restaurant_id` para aislar datos entre tenants. El `restaurant_id` viene siempre del JWT, **nunca del body del request**.

---

## Endpoints de la API

### Públicos (sin autenticación)
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health` | Estado del servidor |
| POST | `/auth/register` | Registro de nuevo restaurante + dueño. Crea `plan_hasta = NOW() + 30 days` automáticamente. Devuelve JWT. |
| POST | `/auth/login` | Login; devuelve JWT |
| GET | `/r/:slug` | Menú público. Devuelve restaurante (con `plan_vencido`), categorías y platos disponibles. |
| POST | `/r/:slug/pedidos` | Cliente crea un pedido. Retorna 402 si el plan del restaurante venció. |
| POST | `/mp/webhook` | Webhook de Mercado Pago (confirma pagos con tarjeta) |

### Protegidos — requieren `Authorization: Bearer <token>`
Todos llaman `verificarPlan(restaurant_id)` después de `verificarToken()`. Si el plan venció, responden 402 y el frontend muestra el overlay de renovación.

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/mi-restaurante` | Datos del restaurante. **No** bloquea por plan vencido — devuelve `plan_vencido: true` para que el frontend muestre el overlay. |
| PUT | `/cobros` | Guarda números de Nequi y Daviplata |
| GET | `/menu` | Menú completo con platos anidados por categoría (para el editor) |
| POST | `/categorias` | Crear categoría |
| PUT | `/categorias/:id` | Editar categoría |
| DELETE | `/categorias/:id` | Eliminar categoría |
| POST | `/platos` | Crear plato |
| POST | `/platos/:id/imagen` | Subir imagen a Supabase Storage (raw binary, límite 5 MB) |
| PUT | `/platos/:id` | Editar plato |
| PATCH | `/platos/:id` | Cambiar disponibilidad del plato |
| DELETE | `/platos/:id` | Eliminar plato |
| GET | `/pedidos` | Listar pedidos (`?estado=activos` o `?estado=listo`). Excluye pedidos MP sin confirmar. |
| PATCH | `/pedidos/:id` | Avanzar estado del pedido |
| GET | `/ganancias` | Totales de hoy, del mes y desglose día a día (solo pedidos 'entregado') |

---

## Enforcement del plan (implementado)

**Backend — `auth.ts`:**
```typescript
export async function verificarPlan(restaurantId: number): Promise<void>
// Lanza error { status: 402 } si plan_hasta < NOW() o activo = false.
// Se llama en todos los handlers protegidos excepto /mi-restaurante.
```

**Frontend — `app.js`:**
- `llamarAPI()` captura respuestas 402 → llama `mostrarPlanVencido()`
- `cargarNombreRestaurante()` detecta `plan_vencido: true` en `/mi-restaurante` → llama `mostrarPlanVencido()`
- `mostrarPlanVencido()` muestra un overlay de pantalla completa con precio, CTA de renovación y opción de cerrar sesión

**Renovación manual (actual):** Cuando el restaurante pague, ejecutar en Supabase:
```sql
UPDATE restaurants SET plan_hasta = NOW() + INTERVAL '30 days' WHERE id = <id>;
```
El billing automático es trabajo futuro.

**Menú público:** si `plan_vencido`, el GET del menú devuelve los datos pero con `plan_vencido: true` y `tiene_mp: false`. El frontend muestra "Pedidos no disponibles". El POST de pedidos retorna 402. El restaurante siente el impacto en su operación → incentivo para renovar.

---

## Alertas sonoras de pedidos (implementado)

**`app.js` — polling global:**
- `pollPedidos()` corre cada 30s desde `init()`, independientemente de la vista activa
- Compara IDs de pedidos activos con `idsConocidosPedidos` (Set)
- Si hay IDs nuevos → `sonarAlerta()` (doble pitido a 880 Hz con Web Audio API)
- Badge rojo en el nav con el conteo de pedidos `pendiente` cuando el dueño no está en la vista de pedidos
- Al entrar a la vista de pedidos → badge se limpia
- El `AudioContext` se inicializa en el primer click del usuario (requerido por política de autoplay del navegador)

---

## Flujo de pago

El menú público muestra solo los métodos activos para ese restaurante:

- **Efectivo**: siempre disponible; el cliente paga al mesero al recibir el pedido
- **Nequi**: visible si el restaurante configuró su número en Métodos de pago; el cliente transfiere y muestra el comprobante
- **Daviplata**: igual que Nequi
- **Mercado Pago** (tarjeta/PSE): visible si `MP_ACCESS_TOKEN` está configurado en Render; redirige al checkout de MP; el webhook confirma el pago

Si el plan venció: MP se oculta aunque el token esté configurado, y el POST de pedidos retorna 402.

---

## Estructura de archivos

```
clik/
  backend/
    src/
      config.ts         — carga y valida variables de entorno; falla al arrancar si falta algo requerido
      db.ts             — pool pg + helpers query<T>, queryOne<T>, transaccion()
      router.ts         — router manual: registrar() y despachar(); soporta params /:slug
      server.ts         — punto de entrada: registra rutas, maneja errores globales (401/402/403/413/500)
      utils.ts          — helpers HTTP: responderJSON(), leerCuerpo(), leerCuerpoRaw()
      auth.ts           — register, login, verificarToken(), verificarPlan()
      menu.ts           — CRUD de menú (categorías, platos, imágenes) + PUT /cobros + GET /mi-restaurante
      menu-publico.ts   — GET /r/:slug — devuelve menú + plan_vencido + métodos de pago disponibles
      pedidos.ts        — POST /r/:slug/pedidos, GET /pedidos, PATCH /pedidos/:id
      ganancias.ts      — GET /ganancias
      mp.ts             — crearPreferenciaMP() + webhookMP (POST /mp/webhook)
    db/
      schema.sql             — DDL completo de todas las tablas
      migration_cobros.sql   — migración aplicada: nequi/daviplata en restaurants; metodo_pago en pedidos
    .node-version            — 22.6.0 (type stripping requiere ≥ 22.6)
    .env.example
    package.json
  frontend/
    landing.html        — landing pública de marketing
    register.html       — registro de nuevos restaurantes
    login.html          — login de dueños
    index.html          — panel del dueño; incluye overlay #overlay-plan-vencido
    menu.html           — menú público para clientes finales
    css/
      landing.css       — estilos de landing.html
      styles.css        — design tokens (:root) + estilos del panel, badge pedidos, overlay plan vencido
      menu.css          — estilos del menú público, carrito y pantalla de transferencia Nequi/Daviplata
    js/
      app.js            — panel del dueño: auth, menú, pedidos, QR, cobros, pollPedidos, plan vencido
      menu.js           — menú público: carrito, pedido, métodos de pago, plan_vencido
    vercel.json         — rewrites hacia Render; orden crítico: exactas antes que wildcards
```

---

## Lo que falta (próximas prioridades)

### Pendiente urgente
1. **`MP_ACCESS_TOKEN` en Render** — una sola variable de entorno separa al producto de recibir pagos con tarjeta. Sin esto solo funcionan efectivo, Nequi y Daviplata. Hay que ir al dashboard de Render → Environment → agregar la variable con el token de producción de MP de clik.

2. **Cobro automático de la suscripción** — hoy la renovación del plan es 100% manual (SQL directo en Supabase). Para escalar a 200 restaurantes se necesita al menos un link de pago de MP que, al ser pagado, extienda automáticamente `plan_hasta`. Sin esto el operador hace trabajo manual por cada cliente.

### Mejoras de experiencia (siguiente ronda)
3. **URL limpia del menú** — el QR apunta a `clik.work/menu.html?slug=X`. La URL ideal es `clik.work/r/X`. Requiere un rewrite en Vercel que sirva `menu.html` cuando el path es `/r/:slug`, en lugar de proxear al backend.

4. **Panel optimizado para móvil** — los dueños de restaurante suelen gestionar desde el celular, especialmente la vista de pedidos. El panel actual está pensado para desktop.

5. **Notificación al cliente del estado del pedido** — después de hacer el pedido, el cliente no sabe si está siendo preparado. Podría verse el estado en tiempo real en la pantalla post-pedido.

6. **Integración de mesas** — la tabla `mesas` existe en la BD pero no está conectada al flujo. El cliente escribe libremente su número de mesa sin validación.

---

## Convenciones

### Backend
- Un archivo = una responsabilidad
- Imports con extensión `.ts` (requerido por Node type stripping + `moduleResolution NodeNext`)
- Sin abstracciones especulativas: si algo se usa una sola vez, no se extrae
- Comentarios solo cuando el "por qué" no es obvio
- Nombres de dominio en español; términos técnicos en inglés
- Errores de validación de entorno se lanzan al arrancar, no en runtime
- `restaurant_id` siempre del JWT, nunca del body — validar antes de cualquier escritura
- Secuencia estándar en handlers protegidos: `verificarToken` → `verificarPlan` → lógica de negocio

### Frontend
- Clases CSS en español cuando describen dominio (`.campo`, `.oculto`, `.activo`)
- CSS variables para todos los valores visuales: colores, tipografía, espaciado
- JS sin `var`, sin jQuery, sin librerías externas
- Patrón `esLocal` para detectar entorno y apuntar la URL de API correcta
- Funciones pequeñas y con nombre descriptivo
- `llamarAPI()` centraliza fetch + JWT + manejo de 401 (→ login) y 402 (→ overlay plan vencido)

### Git
- Commits atómicos en español
- Paso a paso, una cosa a la vez
- No adelantarse a etapas futuras
- No proponer frameworks
