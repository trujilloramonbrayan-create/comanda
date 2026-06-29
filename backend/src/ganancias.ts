// Módulo de ganancias — solo lectura, JWT protegido.
// Calcula ingresos basándose en pedidos con estado 'entregado'.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { queryOne, query } from './db.ts';
import { responderJSON } from './utils.ts';
import { verificarToken } from './auth.ts';

export async function obtenerGanancias(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const { restaurant_id } = verificarToken(req);

  // Totales de hoy
  const hoy = await queryOne<{ total: string; pedidos: string }>(
    `SELECT
       COALESCE(SUM(pi.precio_unitario * pi.cantidad), 0) AS total,
       COUNT(DISTINCT p.id)                               AS pedidos
     FROM pedidos p
     JOIN pedido_items pi ON pi.pedido_id = p.id
     WHERE p.restaurant_id = $1
       AND p.estado        = 'entregado'
       AND p.created_at   >= CURRENT_DATE
       AND p.created_at   <  CURRENT_DATE + INTERVAL '1 day'`,
    [restaurant_id]
  );

  // Totales del mes en curso
  const mes = await queryOne<{ total: string; pedidos: string }>(
    `SELECT
       COALESCE(SUM(pi.precio_unitario * pi.cantidad), 0) AS total,
       COUNT(DISTINCT p.id)                               AS pedidos
     FROM pedidos p
     JOIN pedido_items pi ON pi.pedido_id = p.id
     WHERE p.restaurant_id = $1
       AND p.estado        = 'entregado'
       AND DATE_TRUNC('month', p.created_at) = DATE_TRUNC('month', NOW())`,
    [restaurant_id]
  );

  // Desglose día a día del mes en curso
  const porDia = await query<{ fecha: string; pedidos: string; total: string }>(
    `SELECT
       DATE(p.created_at)                                 AS fecha,
       COUNT(DISTINCT p.id)                               AS pedidos,
       COALESCE(SUM(pi.precio_unitario * pi.cantidad), 0) AS total
     FROM pedidos p
     JOIN pedido_items pi ON pi.pedido_id = p.id
     WHERE p.restaurant_id = $1
       AND p.estado        = 'entregado'
       AND DATE_TRUNC('month', p.created_at) = DATE_TRUNC('month', NOW())
     GROUP BY DATE(p.created_at)
     ORDER BY fecha DESC`,
    [restaurant_id]
  );

  responderJSON(res, 200, {
    hoy: {
      total:   Number(hoy?.total   ?? 0),
      pedidos: Number(hoy?.pedidos ?? 0),
    },
    mes: {
      total:   Number(mes?.total   ?? 0),
      pedidos: Number(mes?.pedidos ?? 0),
    },
    por_dia: porDia.map(d => ({
      fecha:   d.fecha,
      pedidos: Number(d.pedidos),
      total:   Number(d.total),
    })),
  });
}
