-- Migración: agregar soporte para Mercado Pago
-- Ejecutar en Supabase SQL Editor si la BD ya tiene las tablas base.
-- Es idempotente: usa IF NOT EXISTS y ADD COLUMN IF NOT EXISTS.

-- Columnas de pago en pedidos
ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS metodo_pago      TEXT NOT NULL DEFAULT 'efectivo'
    CHECK (metodo_pago IN ('efectivo','mp')),
  ADD COLUMN IF NOT EXISTS mp_preference_id TEXT,
  ADD COLUMN IF NOT EXISTS mp_payment_id    TEXT;

-- Tabla de credenciales OAuth de MP
CREATE TABLE IF NOT EXISTS mp_credentials (
  id            SERIAL      PRIMARY KEY,
  restaurant_id INTEGER     NOT NULL UNIQUE REFERENCES restaurants(id) ON DELETE CASCADE,
  access_token  TEXT        NOT NULL,
  refresh_token TEXT        NOT NULL,
  mp_user_id    TEXT        NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
