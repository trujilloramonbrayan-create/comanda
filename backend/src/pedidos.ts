// Módulo de pedidos.
// Rutas públicas (sin JWT): POST /r/:slug/pedidos  — el cliente crea su pedido.
// Rutas protegidas (JWT):   GET  /pedidos           — el dueño lista los pedidos.
//                           PATCH /pedidos/:id       — avanza el estado del pedido.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { query, queryOne } from './db.ts';
import { responderJSON, leerCuerpo } from './utils.ts';
import { verificarToken, verificarPlan } from './auth.ts';
import { crearPreferenciaMP } from './mp.ts';

// ── Tipos internos ────────────────────────────────────────────────────────────

interface ItemBody {
  plato_id: unknown;
  cantidad:  unknown;
}

interface PedidoBody {
  mesa_numero:  unknown;
  items:        unknown;
  metodo_pago?: unknown;
}

// ── Crear pedido (público) ────────────────────────────────────────────────────

export async function crearPedido(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>
): Promise<void> {
  const restaurante = await queryOne<{ id: number; plan_hasta: Date | null }>(
    `SELECT id, plan_hasta FROM restaurants WHERE slug = $1 AND activo = true`,
    [params.slug]
  );
  if (!restaurante) {
    responderJSON(res, 404, { error: 'Restaurante no encontrado' });
    return;
  }
  if (restaurante.plan_hasta && new Date(restaurante.plan_hasta) < new Date()) {
    responderJSON(res, 402, { error: 'Este restaurante no está recibiendo pedidos en línea por el momento' });
    return;
  }

  const body = await leerCuerpo<PedidoBody>(req);

  const mesaNumero = Number(body.mesa_numero);
  if (!Number.isInteger(mesaNumero) || mesaNumero < 1 || mesaNumero > 9999) {
    responderJSON(res, 400, { error: 'Número de mesa inválido' });
    return;
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    responderJSON(res, 400, { error: 'El pedido debe tener al menos un ítem' });
    return;
  }

  const items = body.items as ItemBody[];

  for (const item of items) {
    const platoId  = Number(item.plato_id);
    const cantidad = Number(item.cantidad);
    if (!Number.isInteger(platoId)  || platoId  < 1)        { responderJSON(res, 400, { error: 'plato_id inválido' }); return; }
    if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 99) { responderJSON(res, 400, { error: 'Cantidad inválida' }); return; }
  }

  // Verificar que todos los platos pertenecen al restaurante y están disponibles
  const platoIds    = items.map(i => Number(i.plato_id));
  const placeholders = platoIds.map((_, i) => `$${i + 2}`).join(',');
  const platos = await query<{ id: number; nombre: string; precio: number }>(
    `SELECT id, nombre, precio FROM platos
     WHERE id IN (${placeholders}) AND restaurant_id = $1 AND disponible = true`,
    [restaurante.id, ...platoIds]
  );

  if (platos.length !== new Set(platoIds).size) {
    responderJSON(res, 400, { error: 'Uno o más platos no están disponibles' });
    return;
  }

  const metodoRaw = String(body.metodo_pago ?? 'efectivo');
  const metodoPago = ['efectivo', 'mp', 'nequi', 'daviplata'].includes(metodoRaw) ? metodoRaw : 'efectivo';

  const pedido = await queryOne<{ id: number; estado: string; created_at: string }>(
    `INSERT INTO pedidos (restaurant_id, mesa_numero, metodo_pago)
     VALUES ($1, $2, $3)
     RETURNING id, estado, created_at`,
    [restaurante.id, mesaNumero, metodoPago]
  );

  const platoMap = new Map(platos.map(p => [p.id, p]));

  for (const item of items) {
    const plato = platoMap.get(Number(item.plato_id))!;
    await query(
      `INSERT INTO pedido_items (pedido_id, plato_id, nombre_plato, precio_unitario, cantidad)
       VALUES ($1, $2, $3, $4, $5)`,
      [pedido!.id, plato.id, plato.nombre, plato.precio, Number(item.cantidad)]
    );
  }

  // Pedido en efectivo, Nequi o Daviplata → devolver número de contacto si aplica
  if (metodoPago !== 'mp') {
    let numero: string | null = null;
    if (metodoPago === 'nequi' || metodoPago === 'daviplata') {
      const r = await queryOne<{ nequi: string | null; daviplata: string | null }>(
        'SELECT nequi, daviplata FROM restaurants WHERE id = $1',
        [restaurante.id]
      );
      numero = metodoPago === 'nequi' ? (r?.nequi ?? null) : (r?.daviplata ?? null);
    }
    responderJSON(res, 201, { ...pedido, metodo_pago: metodoPago, numero_pago: numero });
    return;
  }

  // Pedido con MP → crear preferencia de pago y devolver URL de checkout
  const rest = await queryOne<{ nombre: string; slug: string }>(
    'SELECT nombre, slug FROM restaurants WHERE id = $1',
    [restaurante.id]
  );

  try {
    const mpItems = items.map(item => {
      const plato = platoMap.get(Number(item.plato_id))!;
      return { title: plato.nombre, quantity: Number(item.cantidad), unit_price: plato.precio };
    });

    const { preference_id, checkout_url } = await crearPreferenciaMP({
      restaurantNombre: rest!.nombre,
      restaurantId:     restaurante.id,
      pedidoId:         pedido!.id,
      slug:             rest!.slug,
      items:            mpItems,
    });

    await query(
      'UPDATE pedidos SET mp_preference_id = $1 WHERE id = $2',
      [preference_id, pedido!.id]
    );

    responderJSON(res, 201, { ...pedido, metodo_pago: 'mp', checkout_url });
  } catch (err: unknown) {
    // Si falla la creación de la preferencia, eliminar el pedido huérfano
    await query('DELETE FROM pedidos WHERE id = $1', [pedido!.id]);
    console.error('Error creando preferencia MP:', err);
    responderJSON(res, 502, { error: 'No se pudo iniciar el pago con Mercado Pago' });
  }
}

// ── Listar pedidos (protegido) ────────────────────────────────────────────────

export async function listarPedidos(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const { restaurant_id } = verificarToken(req);
  await verificarPlan(restaurant_id);

  const urlParams = new URL(req.url!, 'http://localhost').searchParams;
  const estado    = urlParams.get('estado');

  let condicion = '';
  const valores: unknown[] = [restaurant_id];

  if (estado === 'activos') {
    condicion = `AND p.estado IN ('pendiente','en_preparacion')`;
  } else if (estado === 'listo') {
    condicion = `AND p.estado = 'listo'`;
  }
  // Excluir pedidos MP sin confirmar; nequi/daviplata/efectivo entran directo (verificación manual)
  condicion += ` AND (p.metodo_pago IN ('efectivo','nequi','daviplata') OR p.mp_payment_id IS NOT NULL)`;

  const pedidos = await query(
    `SELECT
       p.id, p.mesa_numero, p.estado, p.created_at,
       json_agg(
         json_build_object(
           'id',              pi.id,
           'nombre_plato',    pi.nombre_plato,
           'precio_unitario', pi.precio_unitario,
           'cantidad',        pi.cantidad
         ) ORDER BY pi.id
       ) AS items
     FROM pedidos p
     JOIN pedido_items pi ON pi.pedido_id = p.id
     WHERE p.restaurant_id = $1 ${condicion}
     GROUP BY p.id
     ORDER BY p.created_at DESC
     LIMIT 200`,
    valores
  );

  responderJSON(res, 200, pedidos);
}

// ── Avanzar estado (protegido) ────────────────────────────────────────────────

const FLUJO: Record<string, string> = {
  pendiente:      'en_preparacion',
  en_preparacion: 'listo',
  listo:          'entregado',
};

export async function avanzarEstadoPedido(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>
): Promise<void> {
  const { restaurant_id } = verificarToken(req);
  await verificarPlan(restaurant_id);

  const pedido = await queryOne<{ id: number; estado: string }>(
    `SELECT id, estado FROM pedidos WHERE id = $1 AND restaurant_id = $2`,
    [params.id, restaurant_id]
  );

  if (!pedido) {
    responderJSON(res, 404, { error: 'Pedido no encontrado' });
    return;
  }

  const nuevoEstado = FLUJO[pedido.estado];
  if (!nuevoEstado) {
    responderJSON(res, 400, { error: 'El pedido ya fue entregado' });
    return;
  }

  const actualizado = await queryOne<{ id: number; estado: string }>(
    `UPDATE pedidos SET estado = $1 WHERE id = $2 RETURNING id, estado`,
    [nuevoEstado, pedido.id]
  );

  responderJSON(res, 200, actualizado);
}
