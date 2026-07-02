// Módulo Mercado Pago.
// clik usa su propio token de producción para todos los pagos.
// Los restaurantes no necesitan configurar nada de MP.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { config } from './config.ts';
import { query, queryOne } from './db.ts';
import { leerCuerpo } from './utils.ts';

const MP_API = 'https://api.mercadopago.com';

// ── POST /mp/webhook ──────────────────────────────────────────────────────
// MP notifica aquí cuando un pago cambia de estado.
// Sin JWT. La URL incluye ?restaurant_id=N para identificar el pedido.
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

  if (!config.mpAccessToken) return;

  const paymentId = String(body.data.id);

  const pagoRes = await fetch(`${MP_API}/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${config.mpAccessToken}` },
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
  restaurantNombre: string;
  restaurantId:     number;
  pedidoId:         number;
  slug:             string;
  items:            ItemMP[];
}): Promise<{ preference_id: string; checkout_url: string }> {
  if (!config.mpAccessToken) {
    throw new Error('Pago con tarjeta no disponible por el momento');
  }

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
      Authorization:  `Bearer ${config.mpAccessToken}`,
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
