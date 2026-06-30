// Módulo Mercado Pago.
// OAuth para conectar la cuenta del dueño, webhook para confirmar pagos,
// y helper para crear preferencias de pago desde pedidos.ts.

import type { IncomingMessage, ServerResponse } from 'node:http';
import jwt from 'jsonwebtoken';
import { config } from './config.ts';
import { query, queryOne } from './db.ts';
import { responderJSON, leerCuerpo } from './utils.ts';
import { verificarToken } from './auth.ts';

const MP_API = 'https://api.mercadopago.com';

// ── GET /auth/mp ──────────────────────────────────────────────────────────
// Devuelve la URL de autorización de MP. El panel redirige al dueño ahí.
// Requiere JWT del dueño para saber a qué restaurante vincular la cuenta.

export async function iniciarOAuthMP(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const { restaurant_id } = verificarToken(req);

  // state = JWT firmado con restaurant_id, válido 10 min (previene CSRF en el callback)
  const state = jwt.sign({ restaurant_id }, config.jwtSecret, { expiresIn: '10m' });

  const params = new URLSearchParams({
    client_id:     config.mpClientId,
    response_type: 'code',
    platform_id:   'mp',
    state,
    redirect_uri:  `${config.appUrl}/auth/mp/callback`,
  });

  responderJSON(res, 200, { url: `https://auth.mercadopago.com/authorization?${params}` });
}

// ── GET /auth/mp/callback ─────────────────────────────────────────────────
// MP redirige aquí después de que el dueño autoriza.
// No lleva JWT (viene del navegador desde MP), el restaurant_id está en el state.

export async function callbackOAuthMP(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url    = new URL(req.url ?? '/', 'http://localhost');
  const code   = url.searchParams.get('code');
  const state  = url.searchParams.get('state');

  const redirigir = (ok: boolean) => {
    res.writeHead(302, { Location: `${config.appUrl}/index.html?mp=${ok ? 'ok' : 'error'}` });
    res.end();
  };

  if (!code || !state) return redirigir(false);

  let payload: { restaurant_id: number };
  try {
    payload = jwt.verify(state, config.jwtSecret) as { restaurant_id: number };
  } catch {
    return redirigir(false);
  }

  // Intercambiar el code por los tokens de acceso
  const tokenRes = await fetch(`${MP_API}/oauth/token`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id:     config.mpClientId,
      client_secret: config.mpClientSecret,
      code,
      grant_type:   'authorization_code',
      redirect_uri:  `${config.appUrl}/auth/mp/callback`,
    }),
  });

  if (!tokenRes.ok) return redirigir(false);

  const datos = await tokenRes.json() as {
    access_token:  string;
    refresh_token: string;
    user_id:       number;
    expires_in:    number;
  };

  const expiresAt = new Date(Date.now() + datos.expires_in * 1000);

  // Guardar o actualizar credenciales
  await query(
    `INSERT INTO mp_credentials (restaurant_id, access_token, refresh_token, mp_user_id, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (restaurant_id) DO UPDATE
       SET access_token  = EXCLUDED.access_token,
           refresh_token = EXCLUDED.refresh_token,
           mp_user_id    = EXCLUDED.mp_user_id,
           expires_at    = EXCLUDED.expires_at`,
    [payload.restaurant_id, datos.access_token, datos.refresh_token, String(datos.user_id), expiresAt]
  );

  redirigir(true);
}

// ── GET /mp/estado ────────────────────────────────────────────────────────
// Informa si el restaurante del dueño logueado tiene MP conectado.

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

  // Verificar el pago consultando la API de MP con el token del restaurante
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

  // Marcar el pedido como pagado (idempotente: solo actualiza si aún no tiene payment_id)
  await query(
    `UPDATE pedidos
     SET mp_payment_id = $1
     WHERE id = $2 AND restaurant_id = $3 AND metodo_pago = 'mp' AND mp_payment_id IS NULL`,
    [String(pago.id), pedidoId, restaurantId]
  );
}

// ── Helper: crear preferencia de pago ─────────────────────────────────────
// Llamado desde pedidos.ts al crear un pedido con metodo_pago = 'mp'.

export interface ItemMP {
  title:      string;
  quantity:   number;
  unit_price: number;
}

export async function crearPreferenciaMP(opts: {
  accessToken:  string;
  restaurantNombre: string;
  restaurantId: number;
  pedidoId:     number;
  slug:         string;
  items:        ItemMP[];
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
