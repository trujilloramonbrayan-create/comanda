# comanda — contexto del proyecto

## Estructura del repositorio

```
comanda/
  backend/    — API Node.js
  frontend/   — UI HTML/CSS/JS vanilla
  .gitignore  — cubre ambas carpetas
```

---

## Backend

### Stack (no proponer alternativas)

- **Runtime**: Node.js 24 con type stripping (`--experimental-strip-types`), sin paso de build
- **HTTP**: módulo `node:http` nativo, sin frameworks
- **Router**: implementado a mano en `src/router.ts` (método + patrón + params `/:slug`)
- **Base de datos**: `pg` con SQL escrito a mano, sin ORM ni query builders
- **Auth**: `bcrypt` para hashes de contraseña, `jsonwebtoken` para tokens JWT (pendiente)
- **Config**: `process.loadEnvFile()` nativo de Node, sin dotenv ni librerías externas
- **TypeScript**: type stripping — los tipos se eliminan en runtime, no hay compilación

### Arrancar

```bash
cd backend
cp .env.example .env   # completar DATABASE_URL y JWT_SECRET
npm install
npm run dev            # node --watch --experimental-strip-types src/server.ts
```

### Patrón multitenant

Cada tabla del negocio (mesas, pedidos, productos, etc.) lleva una FK:

```sql
restaurant_id INTEGER NOT NULL REFERENCES restaurants(id)
```

Todas las queries deben filtrar siempre por `restaurant_id` para aislar datos entre tenants.

### Estructura de archivos backend

```
backend/
  src/
    config.ts       — carga y valida variables de entorno
    db.ts           — pool pg + helpers query<T> y queryOne<T>
    router.ts       — router manual: registrar() y despachar()
    server.ts       — punto de entrada, crea el servidor HTTP
    utils.ts        — helpers HTTP: responderJSON(), leerCuerpo()
    restaurants.ts  — CRUD /restaurants (listar, obtener, crear, actualizar, eliminar)
  db/
    schema.sql      — DDL de todas las tablas
```

### Endpoints actuales

| Método | Ruta              | Handler    |
|--------|-------------------|------------|
| GET    | /health           | inline     |
| GET    | /restaurants      | listar     |
| GET    | /restaurants/:id  | obtener    |
| POST   | /restaurants      | crear      |
| PUT    | /restaurants/:id  | actualizar |
| DELETE | /restaurants/:id  | eliminar   |

### Convenciones backend

- Un archivo = una responsabilidad
- Imports con extensión `.ts` (requerido por Node type stripping + moduleResolution NodeNext)
- Sin abstracciones especulativas: si algo se usa una sola vez, no se extrae
- Comentarios solo cuando el "por qué" no es obvio en el código
- Nombres en español para el dominio del negocio; inglés para términos técnicos universales
- Errores de validación de entorno se lanzan al arrancar, no en runtime

---

## Frontend

### Stack (no proponer alternativas)

- HTML semántico, CSS con variables nativas, JS vanilla (ES modules no usados aún)
- Sin React, Vue, ni ningún framework
- Sin bundler ni paso de build — se sirven los archivos estáticos directamente
- Sin librerías de UI (Bootstrap, Tailwind, etc.)

### Arrancar

Abrir `frontend/index.html` directamente en el browser, o servir con cualquier servidor estático.

### Estructura de archivos frontend

```
frontend/
  index.html         — shell principal con layout sidebar + main
  css/
    styles.css       — diseño completo con CSS variables (design tokens en :root)
  js/
    app.js           — navegación, modal, generación de slug, lógica UI
```

### Convenciones frontend

- Clases en español donde describen dominio (`.campo`, `.oculto`, `.activo`)
- CSS variables para todos los valores visuales: colores, tipografía, espaciado
- JS sin `var`, sin jQuery, sin librerías externas
- Funciones pequeñas y con nombre descriptivo
- Los TODO en app.js marcan los puntos donde se conectará el backend con `fetch()`
