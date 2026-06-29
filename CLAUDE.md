# clik — fuente de verdad del proyecto
# Dominio de producción: clik.work

## Qué es clik

SaaS autoservicio que se vende a restaurantes por suscripción. El restaurante paga una cuota fija mensual ($50.000 COL, primer mes gratis) y obtiene un menú digital con código QR para sus mesas. Los clientes del restaurante escanean el QR, ven el menú y hacen pedidos con pago en línea.

Diferencial vs apps de delivery: **sin comisión por venta**, solo cuota fija. Cada restaurante conecta su propia cuenta de Mercado Pago; la plata de las ventas va directo a ellos. El operador de clik solo cobra la suscripción.

---

## Clave: 100% autoservicio

El operador del SaaS **NO** da de alta clientes a mano, **NO** carga menús, **NO** genera QR, **NO** hace ningún trabajo manual por restaurante. El restaurante se registra solo, configura todo solo y administra su propio menú. El software corre sin intervención humana.

**No existe ningún "panel de administrador" del operador.** clik es software que se vende y se administra solo.

Meta de negocio: ~100 restaurantes pagando la cuota mensual.

---

## Cómo entra un restaurante

1. Lo encuentran en Google → llegan a la landing → se registran solos → prueban gratis el primer mes.
2. O el operador les pasa el link y se registran solos igual. En ningún caso el operador crea cuentas manualmente.

---

## Las 3 partes del producto (no confundirlas)

### 1. Landing pública (`landing.html`)
Página de marketing visible en Google. Explica el producto y el precio. Botones "Probar gratis" (→ `register.html`) e "Iniciar sesión" (→ `login.html`). Es la entrada de nuevos clientes.

### 2. Panel del dueño (`index.html` → evolucionar)
Lo accede el restaurante con su login. Administra **su** menú (categorías y platos), ve **sus** pedidos, descarga **su** código QR, conecta **su** cuenta de Mercado Pago. Multitenant: cada dueño solo ve y edita lo suyo.

> **NOTA importante**: la vista "Restaurantes" actual en `index.html` fue construida como si fuera un panel de admin del operador — eso está MAL conceptualmente. `index.html` debe evolucionar al panel del dueño: un dueño = un restaurante = sus datos.

### 3. Menú público (`menu.html`)
Lo que ve el cliente final al escanear el QR en la mesa. URL tipo `clik.com/r/{slug}`. Sin login. Solo lectura.

---

## Sobre el código QR

clik lo genera automáticamente para cada restaurante. El dueño **no** crea ni sube ningún QR. El software toma la URL del menú público (`clik.com/r/{slug}`) y genera el QR que apunta ahí. En el panel del dueño aparece su QR ya listo para descargar e imprimir. Generación automática, cero trabajo manual.

---

## Estado actual del código

- **Backend** (Node http nativo + pg + Supabase, sin frameworks): CRUD de restaurantes en Supabase con columnas `activo` y `plan_hasta` (el mes gratis). Validaciones de entrada y XSS arreglados. CORS habilitado.
- **`index.html`**: vista que lista/crea/borra restaurantes conectada al backend real. Hay que repensarla como panel del dueño con login, no como lista de todos los restaurantes.
- **`menu.html`**: maqueta del menú público con datos de ejemplo (sin datos reales aún).
- **Falta**: landing pública, registro + login de dueños, autenticación (JWT + bcrypt), panel del dueño con editor de menú conectado a BD, generación de QR, menú público dinámico por slug, integración con Mercado Pago.

---

## Orden de trabajo pendiente

1. Landing pública
2. Registro + login de dueños con autenticación (JWT + bcrypt)
3. Panel del dueño: editor de menú conectado a BD + generación de QR
4. Menú público dinámico por slug
5. Integración con Mercado Pago (lo último)

---

## Stack (no proponer alternativas)

### Backend
- **Runtime**: Node.js 24 con type stripping (`--experimental-strip-types`), sin paso de build
- **HTTP**: módulo `node:http` nativo, sin frameworks
- **Router**: implementado a mano en `src/router.ts` (método + patrón + params `/:slug`)
- **Base de datos**: `pg` con SQL escrito a mano, sin ORM ni query builders. Base de datos: Supabase (PostgreSQL)
- **Auth**: `bcrypt` para hashes de contraseña, `jsonwebtoken` para tokens JWT
- **Config**: `process.loadEnvFile()` nativo de Node, sin dotenv ni librerías externas
- **TypeScript**: type stripping — los tipos se eliminan en runtime, no hay compilación

### Frontend
- HTML semántico, CSS con variables nativas, JS vanilla
- Sin React, Vue, ni ningún framework
- Sin bundler ni paso de build — archivos estáticos directamente
- Sin librerías de UI (Bootstrap, Tailwind, etc.)

---

## Arrancar el backend

```bash
cd backend
cp .env.example .env   # completar DATABASE_URL y JWT_SECRET
npm install
npm run dev            # node --watch --experimental-strip-types src/server.ts
```

---

## Patrón multitenant

Cada tabla del negocio lleva una FK:

```sql
restaurant_id INTEGER NOT NULL REFERENCES restaurants(id)
```

Todas las queries deben filtrar siempre por `restaurant_id` para aislar datos entre tenants.

---

## Estructura de archivos

```
clik/
  backend/
    src/
      config.ts       — carga y valida variables de entorno
      db.ts           — pool pg + helpers query<T> y queryOne<T>
      router.ts       — router manual: registrar() y despachar()
      server.ts       — punto de entrada, crea el servidor HTTP
      utils.ts        — helpers HTTP: responderJSON(), leerCuerpo()
      restaurants.ts  — CRUD /restaurants
    db/
      schema.sql      — DDL de todas las tablas
  frontend/
    index.html        — panel del dueño (en evolución)
    landing.html      — (pendiente) landing pública
    register.html     — (pendiente) registro de dueños
    login.html        — (pendiente) login de dueños
    menu.html         — menú público (maqueta, datos reales pendiente)
    css/
      styles.css      — diseño con CSS variables (design tokens en :root)
      menu.css        — estilos del menú público
    js/
      app.js          — lógica del panel del dueño
      menu.js         — lógica del menú público
```

---

## Endpoints actuales

| Método | Ruta              | Handler    |
|--------|-------------------|------------|
| GET    | /health           | inline     |
| GET    | /restaurants      | listar     |
| GET    | /restaurants/:id  | obtener    |
| POST   | /restaurants      | crear      |
| PUT    | /restaurants/:id  | actualizar |
| DELETE | /restaurants/:id  | eliminar   |

---

## Convenciones

### Backend
- Un archivo = una responsabilidad
- Imports con extensión `.ts` (requerido por Node type stripping + moduleResolution NodeNext)
- Sin abstracciones especulativas: si algo se usa una sola vez, no se extrae
- Comentarios solo cuando el "por qué" no es obvio en el código
- Nombres en español para el dominio del negocio; inglés para términos técnicos universales
- Errores de validación de entorno se lanzan al arrancar, no en runtime

### Frontend
- Clases en español donde describen dominio (`.campo`, `.oculto`, `.activo`)
- CSS variables para todos los valores visuales: colores, tipografía, espaciado
- JS sin `var`, sin jQuery, sin librerías externas
- Funciones pequeñas y con nombre descriptivo

---

## Reglas de trabajo

- Paso a paso, una cosa a la vez
- Código simple y limpio, comentado en español
- Commits atómicos
- No adelantarse a etapas futuras
- No proponer frameworks
