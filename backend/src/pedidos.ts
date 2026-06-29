// Módulo de pedidos.
// Rutas públicas (sin JWT): POST /r/:slug/pedidos  — el cliente crea su pedido.
// Rutas protegidas (JWT):   GET  /pedidos           — el dueño lista los pedidos.
//                           PATCH /pedidos/:id       — avanza el estado del pedido.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { query, queryOne } from './db.ts';
import { responderJSON, leerCuerpo } from './utils.ts';
import { verificarToken } from './auth.ts';

// ── Tipos internos ────────────────────────────────────────────────────────────

interface ItemBody {
  plato_id: unknown;
  cantidad:  unknown;
}

interface PedidoBody {
  mesa_numero: unknown;
  items:       unknown;
}

// ── Crear pedido (público) ────────────────────────────────────────────────────

export async function crearPedido(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>
): Promise<void> {
  const restaurante = await queryOne<{ id: number }>(
    `SELECT id FROM restaurants WHERE slug = $1 AND activo = true`,
    [params.slug]
  );
  if (!restaurante) {
    responderJSON(res, 404, { error: 'Restaurante no encontrado' });
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

  const pedido = await queryOne<{ id: number; estado: string; created_at: string }>(
    `INSERT INTO pedidos (restaurant_id, mesa_numero)
     VALUES ($1, $2)
     RETURNING id, estado, created_at`,
    [restaurante.id, mesaNumero]
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

  responderJSON(res, 201, pedido);
}

// ── Listar pedidos (protegido) ────────────────────────────────────────────────

export async function listarPedidos(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const { restaurant_id } = verificarToken(req);

  const urlParams = new URL(req.url!, 'http://localhost').searchParams;
  const estado    = urlParams.get('estado');

  let condicion = '';
  const valores: unknown[] = [restaurant_id];

  if (estado === 'activos') {
    condicion = `AND p.estado IN ('pendiente','en_preparacion')`;
  } else if (estado === 'listo') {
    condicion = `AND p.estado = 'listo'`;
  }
  // sin filtro → devuelve todos (limit 200, últimos primero)

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
