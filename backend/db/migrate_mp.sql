-- Migración: integración Mercado Pago
-- Ejecutar una sola vez contra la base de datos en Supabase.

-- Credenciales OAuth por restaurante (una cuenta MP por restaurante)
CREATE TABLE IF NOT EXISTS mp_credentials (
  id            SERIAL      PRIMARY KEY,
  restaurant_id INTEGER     NOT NULL UNIQUE REFERENCES restaurants(id) ON DELETE CASCADE,
  access_token  TEXT        NOT NULL,
  refresh_token TEXT,
  mp_user_id    TEXT        NOT NULL,
  expires_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Columnas nuevas en pedidos para soporte de pagos online
ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS metodo_pago     TEXT NOT NULL DEFAULT 'efectivo'
    CHECK (metodo_pago IN ('efectivo', 'mp')),
  ADD COLUMN IF NOT EXISTS mp_preference_id TEXT,
  ADD COLUMN IF NOT EXISTS mp_payment_id    TEXT;
