// Endpoints para gestión de mesas del restaurante.
// Todos protegidos con JWT. El restaurant_id siempre sale del token, nunca del cliente.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { query, queryOne } from './db.ts';
import { leerCuerpo, responderJSON } from './utils.ts';
import { verificarToken } from './auth.ts';

const PG_UNIQUE = '23505';

function esIdValido(id: string): boolean {
  return /^\d+$/.test(id);
}

// ── GET /mesas ─────────────────────────────────────────────────────────────────
// Lista todas las mesas del restaurante del token, ordenadas por número.

export async function listarMesas(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const { restaurant_id } = verificarToken(req);

  interface MesaRow { id: number; numero: number; activa: boolean }
  const mesas = await query<MesaRow>(
    'SELECT id, numero, activa FROM mesas WHERE restaurant_id = $1 ORDER BY numero',
    [restaurant_id]
  );
  return responderJSON(res, 200, mesas);
}

// ── POST /mesas ────────────────────────────────────────────────────────────────
// Crea una nueva mesa. Body: { numero: number }

export async function crearMesa(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const { restaurant_id } = verificarToken(req);

  let body: { numero?: unknown };
  try { body = await leerCuerpo(req); } catch {
    return responderJSON(res, 400, { error: 'Cuerpo JSON inválido' });
  }

  const numero = typeof body.numero === 'number' ? body.numero : NaN;
  if (!Number.isInteger(numero) || numero <= 0) {
    return responderJSON(res, 400, { error: 'El número de mesa debe ser un entero positivo' });
  }
  if (numero > 9999) {
    return responderJSON(res, 400, { error: 'El número de mesa no puede superar 9999' });
  }

  try {
    const nueva = await queryOne(
      'INSERT INTO mesas (restaurant_id, numero) VALUES ($1, $2) RETURNING id, numero, activa',
      [restaurant_id, numero]
    );
    return responderJSON(res, 201, nueva);
  } catch (err: unknown) {
    if ((err as { code?: string }).code === PG_UNIQUE) {
      return responderJSON(res, 409, { error: `Ya existe la mesa ${numero} en tu restaurante` });
    }
    throw err;
  }
}

// ── PATCH /mesas/:id ──────────────────────────────────────────────────────────
// Toggle activa/inactiva. Verifica ownership por token.

export async function toggleActivaMesa(
  req: IncomingMessage, res: ServerResponse, params: Record<string, string>
): Promise<void> {
  const { restaurant_id } = verificarToken(req);
  if (!esIdValido(params.id)) return responderJSON(res, 400, { error: 'ID inválido' });

  const existente = await queryOne<{ activa: boolean }>(
    'SELECT activa FROM mesas WHERE id = $1 AND restaurant_id = $2',
    [params.id, restaurant_id]
  );
  if (!existente) return responderJSON(res, 403, { error: 'No tenés permiso para modificar esta mesa' });

  const actualizada = await queryOne(
    'UPDATE mesas SET activa = $1 WHERE id = $2 RETURNING id, numero, activa',
    [!existente.activa, params.id]
  );
  return responderJSON(res, 200, actualizada);
}

// ── DELETE /mesas/:id ─────────────────────────────────────────────────────────
// Elimina la mesa. Verifica ownership por token.

export async function eliminarMesa(
  req: IncomingMessage, res: ServerResponse, params: Record<string, string>
): Promise<void> {
  const { restaurant_id } = verificarToken(req);
  if (!esIdValido(params.id)) return responderJSON(res, 400, { error: 'ID inválido' });

  const existente = await queryOne(
    'SELECT id FROM mesas WHERE id = $1 AND restaurant_id = $2',
    [params.id, restaurant_id]
  );
  if (!existente) return responderJSON(res, 403, { error: 'No tenés permiso para eliminar esta mesa' });

  await queryOne('DELETE FROM mesas WHERE id = $1', [params.id]);
  return responderJSON(res, 200, { ok: true });
}
