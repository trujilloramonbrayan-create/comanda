// Módulo Mercado Pago.
// Cada restaurante conecta su cuenta pegando su Access Token de producción.
// El token se valida contra la API de MP y se guarda en mp_credentials.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { config } from './config.ts';
import { query, queryOne } from './db.ts';
import { responderJSON, leerCuerpo } from './utils.ts';
import { verificarToken } from './auth.ts';

const MP_API = 'https://api.mercadopago.com';

// ── PUT /mp/token ─────────────────────────────────────────────────────────
// El dueño pega su Access Token de producción de MP.
// Lo validamos consultando /users/me y guardamos las credenciales.

export async function guardarTokenMP(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const { restaurant_id } = verificarToken(req);
  const { access_token } = await leerCuerpo(req) as { access_token?: string };

  if (!access_token || typeof access_token !== 'string' || !access_token.trim()) {
    return responderJSON(res, 400, { error: 'access_token requerido' });
  }

  // Validar el token consultando la API de MP
  const mpRes = await fetch(`${MP_API}/users/me`, {
    headers: { Authorization: `Bearer ${access_token.trim()}` },
  });

  if (!mpRes.ok) {
    return responderJSON(res, 400, { error: 'Token inválido o sin acceso a Mercado Pago' });
  }

  const usuario = await mpRes.json() as { id: number; email?: string };

  await query(
    `INSERT INTO mp_credentials (restaurant_id, access_token, mp_user_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (restaurant_id) DO UPDATE
       SET access_token = EXCLUDED.access_token,
           mp_user_id   = EXCLUDED.mp_user_id`,
    [restaurant_id, access_token.trim(), String(usuario.id)]
  );

  responderJSON(res, 200, { ok: true, mp_user_id: String(usuario.id) });
}

// ── GET /mp/estado ────────────────────────────────────────────────────────

export async function estadoMP(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const { restaurant_id } = verificarToken(req);

  const creds = await queryOne<{ mp_user_id: string }>(
    'SELECT mp_user_id FROM mp_credentials WHERE restaurant_id = $1',
    [restaurant_id]
  );

  responderJSON(res, 200, { conectado: !!creds, mp_user_id: creds?.mp_user_id ?? null });
}

// ── DELETE /mp/desconectar ────────────────────────────────────────────────

export async function desconectarMP(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const { restaurant_id } = verificarToken(req);
  await query('DELETE FROM mp_credentials WHERE restaurant_id = $1', [restaurant_id]);
  responderJSON(res, 200, { ok: true });
}

// ── POST /mp/webhook ──────────────────────────────────────────────────────
// MP notifica aquí cuando un pago cambia de estado.
// Sin JWT. La URL incluye ?restaurant_id=N para saber qué restaurante verificar.
// Responde 200 de inmediato — MP exige respuesta rápida (< 500 ms).

export async function webhookMP(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  res.writeHead(200);
  res.end();

  let body: { type?: string; data?: { id?: string | number } };
  try { body = await leerCuerpo(req); } catch { return; }

  if (body.type !== 'payment' || !body.data?.id) return;

  const urlParams    = new URL(req.url ?? '/', 'http://localhost').searchParams;
  const restaurantId = parseInt(urlParams.get('restaurant_id') ?? '', 10);
  if (!restaurantId) return;

  const paymentId = String(body.data.id);

  const creds = await queryOne<{ access_token: string }>(
    'SELECT access_token FROM mp_credentials WHERE restaurant_id = $1',
    [restaurantId]
  );
  if (!creds) return;

  const pagoRes = await fetch(`${MP_API}/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${creds.access_token}` },
  });
  if (!pagoRes.ok) return;

  const pago = await pagoRes.json() as {
    status:             string;
    external_reference: string;
    id:                 number;
  };

  if (pago.status !== 'approved') return;

  const pedidoId = parseInt(pago.external_reference, 10);
  if (!pedidoId) return;

  await query(
    `UPDATE pedidos
     SET mp_payment_id = $1
     WHERE id = $2 AND restaurant_id = $3 AND metodo_pago = 'mp' AND mp_payment_id IS NULL`,
    [String(pago.id), pedidoId, restaurantId]
  );
}

// ── Helper: crear preferencia de pago ─────────────────────────────────────

export interface ItemMP {
  title:      string;
  quantity:   number;
  unit_price: number;
}

export async function crearPreferenciaMP(opts: {
  accessToken:      string;
  restaurantNombre: string;
  restaurantId:     number;
  pedidoId:         number;
  slug:             string;
  items:            ItemMP[];
}): Promise<{ preference_id: string; checkout_url: string }> {
  const body = {
    items: opts.items.map(i => ({ ...i, currency_id: 'COP' })),
    external_reference: String(opts.pedidoId),
    back_urls: {
      success: `${config.appUrl}/menu.html?slug=${opts.slug}&pago=ok`,
      failure: `${config.appUrl}/menu.html?slug=${opts.slug}&pago=error`,
      pending: `${config.appUrl}/menu.html?slug=${opts.slug}&pago=pendiente`,
    },
    auto_return:          'approved',
    notification_url:     `${config.appUrl}/mp/webhook?restaurant_id=${opts.restaurantId}`,
    statement_descriptor: `CLIK ${opts.restaurantNombre}`.slice(0, 22),
  };

  const res = await fetch(`${MP_API}/checkout/preferences`, {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${opts.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(err.message ?? `Error MP ${res.status}`);
  }

  const datos = await res.json() as { id: string; init_point: string };
  return { preference_id: datos.id, checkout_url: datos.init_point };
}
