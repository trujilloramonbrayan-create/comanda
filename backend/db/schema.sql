-- Esquema base. Todas las tablas del negocio llevarán restaurant_id -> restaurants.id
-- para aislar los datos de cada tenant.

CREATE TABLE IF NOT EXISTS restaurants (
  id         SERIAL       PRIMARY KEY,
  nombre     VARCHAR(255) NOT NULL,
  -- slug único por restaurante: se usa en URLs y como identificador legible
  slug       VARCHAR(100) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
