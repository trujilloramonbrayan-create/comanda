-- Esquema base. Todas las tablas del negocio llevarán restaurant_id -> restaurants.id
-- para aislar los datos de cada tenant.

CREATE TABLE IF NOT EXISTS restaurants (
  id         SERIAL       PRIMARY KEY,
  nombre     VARCHAR(255) NOT NULL,
  -- slug único por restaurante: se usa en URLs y como identificador legible
  slug       VARCHAR(100) NOT NULL UNIQUE,
  activo     BOOLEAN      NOT NULL DEFAULT true,
  plan_hasta TIMESTAMPTZ,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Dueños de restaurantes. Uno por restaurante (relación 1:1 en esta etapa).
-- Al eliminar el restaurante, el owner se elimina en cascada.
CREATE TABLE IF NOT EXISTS owners (
  id            SERIAL       PRIMARY KEY,
  restaurant_id INTEGER      NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  -- 'owner' = dueño de restaurante; 'superadmin' = operador del SaaS (asignado a mano)
  rol           VARCHAR(20)  NOT NULL DEFAULT 'owner',
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Categorías del menú (Entradas, Pastas, Postres…). Una por restaurante.
CREATE TABLE IF NOT EXISTS categorias (
  id            SERIAL       PRIMARY KEY,
  restaurant_id INTEGER      NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  nombre        VARCHAR(100) NOT NULL,
  orden         INTEGER      NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Mesas del restaurante. Cada mesa tiene un número único dentro del restaurante.
-- El QR de cada mesa apunta al menú público incluyendo el número de mesa.
CREATE TABLE IF NOT EXISTS mesas (
  id            SERIAL      PRIMARY KEY,
  restaurant_id INTEGER     NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  numero        INTEGER     NOT NULL,
  activa        BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (restaurant_id, numero)
);

-- Pedidos realizados por los clientes desde el menú público.
-- mesa_numero: número escrito por el cliente al pedir (no FK, dato libre).
-- estado avanza en sentido único: pendiente → en_preparacion → listo → entregado.
CREATE TABLE IF NOT EXISTS pedidos (
  id            SERIAL PRIMARY KEY,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  mesa_numero   INTEGER NOT NULL,
  estado        TEXT    NOT NULL DEFAULT 'pendiente'
                CHECK (estado IN ('pendiente','en_preparacion','listo','entregado')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ítems de cada pedido. Precio y nombre se guardan como snapshot para que cambios
-- futuros en el menú no alteren el historial de pedidos.
CREATE TABLE IF NOT EXISTS pedido_items (
  id              SERIAL  PRIMARY KEY,
  pedido_id       INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  plato_id        INTEGER NOT NULL REFERENCES platos(id),
  nombre_plato    TEXT    NOT NULL,
  precio_unitario INTEGER NOT NULL,
  cantidad        INTEGER NOT NULL CHECK (cantidad > 0)
);

-- Platos. Pertenecen a una categoría y al restaurante (FK doble para filtrar eficientemente).
-- precio en pesos colombianos enteros, sin decimales.
-- imagen_url apunta al archivo en Supabase Storage (bucket público "platos").
CREATE TABLE IF NOT EXISTS platos (
  id            SERIAL       PRIMARY KEY,
  categoria_id  INTEGER      NOT NULL REFERENCES categorias(id) ON DELETE CASCADE,
  restaurant_id INTEGER      NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  nombre        VARCHAR(150) NOT NULL,
  descripcion   TEXT,
  precio        INTEGER      NOT NULL,
  disponible    BOOLEAN      NOT NULL DEFAULT true,
  orden         INTEGER      NOT NULL DEFAULT 0,
  imagen_url    TEXT,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
