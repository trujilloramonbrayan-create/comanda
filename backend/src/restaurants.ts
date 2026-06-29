// CRUD de restaurantes.
// Cada función tiene la firma Manejador del router.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { query, queryOne } from './db.ts';
import { leerCuerpo, responderJSON } from './utils.ts';

interface Restaurant {
  id: number;
  nombre: string;
  slug: string;
  activo: boolean;
  plan_hasta: Date | null;
  created_at: Date;
}

// Error de pg para violación de unicidad (UNIQUE constraint)
const PG_UNIQUE_VIOLATION = '23505';

function esIdValido(id: string): boolean {
  return /^\d+$/.test(id);
}

// GET /restaurants
export async function listar(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  const lista = await query<Restaurant>('SELECT * FROM restaurants ORDER BY id');
  responderJSON(res, 200, lista);
}

// GET /restaurants/:id
export async function obtener(
  _req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>
): Promise<void> {
  if (!esIdValido(params.id)) {
    return responderJSON(res, 400, { error: 'El id debe ser un entero positivo' });
  }
  const restaurant = await queryOne<Restaurant>(
    'SELECT * FROM restaurants WHERE id = $1',
    [params.id]
  );
  if (!restaurant) return responderJSON(res, 404, { error: 'Restaurante no encontrado' });
  responderJSON(res, 200, restaurant);
}

// POST /restaurants  — body: { nombre, slug }
export async function crear(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let body: { nombre?: unknown; slug?: unknown };
  try {
    body = await leerCuerpo(req);
  } catch {
    return responderJSON(res, 400, { error: 'Cuerpo JSON inválido' });
  }

  const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : '';
  const slug   = typeof body.slug   === 'string' ? body.slug.trim()   : '';

  if (!nombre) {
    return responderJSON(res, 400, { error: 'nombre es requerido' });
  }
  if (nombre.length > 255) {
    return responderJSON(res, 400, { error: 'nombre no puede superar 255 caracteres' });
  }
  if (!slug) {
    return responderJSON(res, 400, { error: 'slug es requerido' });
  }
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return responderJSON(res, 400, { error: 'slug solo puede contener minúsculas, números y guiones' });
  }
  if (slug.length > 100) {
    return responderJSON(res, 400, { error: 'slug no puede superar 100 caracteres' });
  }

  try {
    const nuevo = await queryOne<Restaurant>(
      `INSERT INTO restaurants (nombre, slug, activo, plan_hasta)
       VALUES ($1, $2, true, NOW() + INTERVAL '30 days')
       RETURNING *`,
      [nombre, slug]
    );
    responderJSON(res, 201, nuevo);
  } catch (err: unknown) {
    if ((err as { code?: string }).code === PG_UNIQUE_VIOLATION) {
      return responderJSON(res, 409, { error: 'El slug ya está en uso' });
    }
    throw err;
  }
}

// PUT /restaurants/:id  — body: { nombre?, slug? }  (campos opcionales: actualiza solo los enviados)
export async function actualizar(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>
): Promise<void> {
  if (!esIdValido(params.id)) {
    return responderJSON(res, 400, { error: 'El id debe ser un entero positivo' });
  }
  const existente = await queryOne<Restaurant>(
    'SELECT * FROM restaurants WHERE id = $1',
    [params.id]
  );
  if (!existente) return responderJSON(res, 404, { error: 'Restaurante no encontrado' });

  let body: { nombre?: unknown; slug?: unknown };
  try {
    body = await leerCuerpo(req);
  } catch {
    return responderJSON(res, 400, { error: 'Cuerpo JSON inválido' });
  }

  // Solo se reemplaza lo que viene en el body; el resto mantiene su valor actual
  const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : existente.nombre;
  const slug = typeof body.slug === 'string' ? body.slug.trim() : existente.slug;
  if (!nombre || !slug) {
    return responderJSON(res, 400, { error: 'nombre y slug no pueden quedar vacíos' });
  }

  try {
    const actualizado = await queryOne<Restaurant>(
      'UPDATE restaurants SET nombre = $1, slug = $2 WHERE id = $3 RETURNING *',
      [nombre, slug, params.id]
    );
    responderJSON(res, 200, actualizado);
  } catch (err: unknown) {
    if ((err as { code?: string }).code === PG_UNIQUE_VIOLATION) {
      return responderJSON(res, 409, { error: 'El slug ya está en uso' });
    }
    throw err;
  }
}

// DELETE /restaurants/:id
export async function eliminar(
  _req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>
): Promise<void> {
  if (!esIdValido(params.id)) {
    return responderJSON(res, 400, { error: 'El id debe ser un entero positivo' });
  }
  const eliminado = await queryOne<Restaurant>(
    'DELETE FROM restaurants WHERE id = $1 RETURNING *',
    [params.id]
  );
  if (!eliminado) return responderJSON(res, 404, { error: 'Restaurante no encontrado' });
  responderJSON(res, 200, eliminado);
}
