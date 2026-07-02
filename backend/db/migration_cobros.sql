-- Migración: métodos de pago por restaurante (Nequi, Daviplata)
-- Ejecutar en Supabase → SQL Editor

-- 1. Columnas de pago estático en restaurants
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS nequi     TEXT,
  ADD COLUMN IF NOT EXISTS daviplata TEXT;

-- 2. Columnas de pedidos (si aún no existen de la migración anterior)
ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS metodo_pago      TEXT NOT NULL DEFAULT 'efectivo',
  ADD COLUMN IF NOT EXISTS mp_preference_id TEXT,
  ADD COLUMN IF NOT EXISTS mp_payment_id    TEXT;

-- 3. Actualizar check constraint para incluir nequi y daviplata
ALTER TABLE pedidos DROP CONSTRAINT IF EXISTS pedidos_metodo_pago_check;
ALTER TABLE pedidos ADD CONSTRAINT pedidos_metodo_pago_check
  CHECK (metodo_pago IN ('efectivo', 'mp', 'nequi', 'daviplata'));

-- 4. Tabla mp_credentials (por si no fue creada antes)
CREATE TABLE IF NOT EXISTS mp_credentials (
  id            SERIAL      PRIMARY KEY,
  restaurant_id INTEGER     NOT NULL UNIQUE REFERENCES restaurants(id) ON DELETE CASCADE,
  access_token  TEXT        NOT NULL,
  refresh_token TEXT,
  mp_user_id    TEXT        NOT NULL,
  expires_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
