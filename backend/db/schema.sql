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
