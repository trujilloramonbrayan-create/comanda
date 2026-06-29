// Endpoints del menú del restaurante.
// Todos requieren JWT. El restaurant_id viene SIEMPRE del token, nunca del cliente.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { query, queryOne } from './db.ts';
import { leerCuerpo, leerCuerpoRaw, responderJSON } from './utils.ts';
import { verificarToken } from './auth.ts';
import { config } from './config.ts';

function esIdValido(id: string): boolean {
  return /^\d+$/.test(id);
}

// ── GET /mi-restaurante ───────────────────────────────────────────────────────
// Datos del restaurante del dueño logueado.

export async function miRestaurante(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const { restaurant_id } = verificarToken(req);
  const restaurante = await queryOne<{ id: number; nombre: string; slug: string; plan_hasta: Date | null }>(
    'SELECT id, nombre, slug, plan_hasta FROM restaurants WHERE id = $1',
    [restaurant_id]
  );
  if (!restaurante) return responderJSON(res, 404, { error: 'Restaurante no encontrado' });
  return responderJSON(res, 200, restaurante);
}

// ── GET /menu ─────────────────────────────────────────────────────────────────
// Todas las categorías con sus platos anidados, ordenadas por orden ASC, id ASC.

export async function obtenerMenu(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const { restaurant_id } = verificarToken(req);

  interface CatRow { id: number; nombre: string; orden: number }
  interface PlatoRow { id: number; categoria_id: number; nombre: string; descripcion: string | null; precio: number; disponible: boolean; orden: number; imagen_url: string | null }

  const categorias = await query<CatRow>(
    'SELECT id, nombre, orden FROM categorias WHERE restaurant_id = $1 ORDER BY orden, id',
    [restaurant_id]
  );
  const platos = await query<PlatoRow>(
    'SELECT id, categoria_id, nombre, descripcion, precio, disponible, orden, imagen_url FROM platos WHERE restaurant_id = $1 ORDER BY orden, id',
    [restaurant_id]
  );

  const resultado = categorias.map(cat => ({
    ...cat,
    platos: platos.filter(p => p.categoria_id === cat.id),
  }));

  return responderJSON(res, 200, resultado);
}

// ── POST /categorias ──────────────────────────────────────────────────────────

export async function crearCategoria(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const { restaurant_id } = verificarToken(req);

  let body: { nombre?: unknown };
  try { body = await leerCuerpo(req); } catch {
    return responderJSON(res, 400, { error: 'Cuerpo JSON inválido' });
  }

  const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : '';
  if (!nombre)            return responderJSON(res, 400, { error: 'El nombre de la categoría es requerido' });
  if (nombre.length > 100) return responderJSON(res, 400, { error: 'El nombre no puede superar 100 caracteres' });

  // orden = siguiente al máximo existente
  const max = await queryOne<{ v: number | null }>(
    'SELECT MAX(orden) AS v FROM categorias WHERE restaurant_id = $1',
    [restaurant_id]
  );
  const orden = (max?.v ?? -1) + 1;

  const nueva = await queryOne(
    'INSERT INTO categorias (restaurant_id, nombre, orden) VALUES ($1, $2, $3) RETURNING id, nombre, orden',
    [restaurant_id, nombre, orden]
  );
  return responderJSON(res, 201, { ...nueva, platos: [] });
}

// ── PUT /categorias/:id ───────────────────────────────────────────────────────

export async function actualizarCategoria(
  req: IncomingMessage, res: ServerResponse, params: Record<string, string>
): Promise<void> {
  const { restaurant_id } = verificarToken(req);
  if (!esIdValido(params.id)) return responderJSON(res, 400, { error: 'ID inválido' });

  // Ownership: la categoría debe pertenecer al restaurante del token
  const existente = await queryOne('SELECT id FROM categorias WHERE id = $1 AND restaurant_id = $2', [params.id, restaurant_id]);
  if (!existente) return responderJSON(res, 403, { error: 'No tenés permiso para modificar esta categoría' });

  let body: { nombre?: unknown };
  try { body = await leerCuerpo(req); } catch {
    return responderJSON(res, 400, { error: 'Cuerpo JSON inválido' });
  }

  const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : '';
  if (!nombre)            return responderJSON(res, 400, { error: 'El nombre de la categoría es requerido' });
  if (nombre.length > 100) return responderJSON(res, 400, { error: 'El nombre no puede superar 100 caracteres' });

  const actualizada = await queryOne(
    'UPDATE categorias SET nombre = $1 WHERE id = $2 RETURNING id, nombre, orden',
    [nombre, params.id]
  );
  return responderJSON(res, 200, actualizada);
}

// ── DELETE /categorias/:id ────────────────────────────────────────────────────

export async function eliminarCategoria(
  req: IncomingMessage, res: ServerResponse, params: Record<string, string>
): Promise<void> {
  const { restaurant_id } = verificarToken(req);
  if (!esIdValido(params.id)) return responderJSON(res, 400, { error: 'ID inválido' });

  const existente = await queryOne('SELECT id FROM categorias WHERE id = $1 AND restaurant_id = $2', [params.id, restaurant_id]);
  if (!existente) return responderJSON(res, 403, { error: 'No tenés permiso para eliminar esta categoría' });

  await queryOne('DELETE FROM categorias WHERE id = $1', [params.id]);
  return responderJSON(res, 200, { ok: true });
}

// ── POST /platos ──────────────────────────────────────────────────────────────

export async function crearPlato(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const { restaurant_id } = verificarToken(req);

  let body: { nombre?: unknown; descripcion?: unknown; precio?: unknown; disponible?: unknown; categoria_id?: unknown };
  try { body = await leerCuerpo(req); } catch {
    return responderJSON(res, 400, { error: 'Cuerpo JSON inválido' });
  }

  const nombre      = typeof body.nombre      === 'string'  ? body.nombre.trim()       : '';
  const descripcion = typeof body.descripcion === 'string'  ? body.descripcion.trim()  : null;
  const precio      = typeof body.precio      === 'number'  ? body.precio              : NaN;
  const disponible  = body.disponible !== false;
  const categoriaId = typeof body.categoria_id === 'number' ? body.categoria_id        : NaN;

  if (!nombre)                                    return responderJSON(res, 400, { error: 'El nombre del plato es requerido' });
  if (nombre.length > 150)                        return responderJSON(res, 400, { error: 'El nombre no puede superar 150 caracteres' });
  if (!Number.isInteger(precio) || precio < 0)    return responderJSON(res, 400, { error: 'El precio debe ser un entero positivo' });
  if (!Number.isInteger(categoriaId) || categoriaId <= 0) return responderJSON(res, 400, { error: 'categoria_id es requerido' });

  // Verificar que la categoría pertenezca al restaurante del token
  const cat = await queryOne('SELECT id FROM categorias WHERE id = $1 AND restaurant_id = $2', [categoriaId, restaurant_id]);
  if (!cat) return responderJSON(res, 403, { error: 'La categoría no pertenece a tu restaurante' });

  const maxOrden = await queryOne<{ v: number | null }>(
    'SELECT MAX(orden) AS v FROM platos WHERE categoria_id = $1',
    [categoriaId]
  );
  const orden = (maxOrden?.v ?? -1) + 1;

  const nuevo = await queryOne(
    `INSERT INTO platos (categoria_id, restaurant_id, nombre, descripcion, precio, disponible, orden)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, categoria_id, nombre, descripcion, precio, disponible, orden`,
    [categoriaId, restaurant_id, nombre, descripcion, precio, disponible, orden]
  );
  return responderJSON(res, 201, nuevo);
}

// ── PUT /platos/:id ───────────────────────────────────────────────────────────

export async function actualizarPlato(
  req: IncomingMessage, res: ServerResponse, params: Record<string, string>
): Promise<void> {
  const { restaurant_id } = verificarToken(req);
  if (!esIdValido(params.id)) return responderJSON(res, 400, { error: 'ID inválido' });

  interface PlatoActual { nombre: string; descripcion: string | null; precio: number; disponible: boolean }
  const existente = await queryOne<PlatoActual>(
    'SELECT nombre, descripcion, precio, disponible FROM platos WHERE id = $1 AND restaurant_id = $2',
    [params.id, restaurant_id]
  );
  if (!existente) return responderJSON(res, 403, { error: 'No tenés permiso para modificar este plato' });

  let body: { nombre?: unknown; descripcion?: unknown; precio?: unknown; disponible?: unknown };
  try { body = await leerCuerpo(req); } catch {
    return responderJSON(res, 400, { error: 'Cuerpo JSON inválido' });
  }

  const nombre      = typeof body.nombre      === 'string'  ? body.nombre.trim()      : existente.nombre;
  const descripcion = typeof body.descripcion === 'string'  ? body.descripcion.trim() : existente.descripcion;
  const precio      = typeof body.precio      === 'number'  ? body.precio             : existente.precio;
  const disponible  = typeof body.disponible  === 'boolean' ? body.disponible         : existente.disponible;

  if (!nombre)                                 return responderJSON(res, 400, { error: 'El nombre no puede quedar vacío' });
  if (!Number.isInteger(precio) || precio < 0) return responderJSON(res, 400, { error: 'El precio debe ser un entero positivo' });

  const actualizado = await queryOne(
    `UPDATE platos SET nombre = $1, descripcion = $2, precio = $3, disponible = $4
     WHERE id = $5
     RETURNING id, categoria_id, nombre, descripcion, precio, disponible, orden`,
    [nombre, descripcion, precio, disponible, params.id]
  );
  return responderJSON(res, 200, actualizado);
}

// ── PATCH /platos/:id ─────────────────────────────────────────────────────────
// Cambia solo el campo disponible. Body: { disponible: boolean }

export async function patchDisponible(
  req: IncomingMessage, res: ServerResponse, params: Record<string, string>
): Promise<void> {
  const { restaurant_id } = verificarToken(req);
  if (!esIdValido(params.id)) return responderJSON(res, 400, { error: 'ID inválido' });

  const existente = await queryOne<{ disponible: boolean }>(
    'SELECT disponible FROM platos WHERE id = $1 AND restaurant_id = $2',
    [params.id, restaurant_id]
  );
  if (!existente) return responderJSON(res, 403, { error: 'No tenés permiso para modificar este plato' });

  let body: { disponible?: unknown } = {};
  try { body = await leerCuerpo(req); } catch { /* sin body → toggle */ }

  const nuevoValor = typeof body.disponible === 'boolean' ? body.disponible : !existente.disponible;

  const actualizado = await queryOne(
    'UPDATE platos SET disponible = $1 WHERE id = $2 RETURNING id, categoria_id, nombre, precio, disponible',
    [nuevoValor, params.id]
  );
  return responderJSON(res, 200, actualizado);
}

// ── DELETE /platos/:id ────────────────────────────────────────────────────────

export async function eliminarPlato(
  req: IncomingMessage, res: ServerResponse, params: Record<string, string>
): Promise<void> {
  const { restaurant_id } = verificarToken(req);
  if (!esIdValido(params.id)) return responderJSON(res, 400, { error: 'ID inválido' });

  const existente = await queryOne('SELECT id FROM platos WHERE id = $1 AND restaurant_id = $2', [params.id, restaurant_id]);
  if (!existente) return responderJSON(res, 403, { error: 'No tenés permiso para eliminar este plato' });

  await queryOne('DELETE FROM platos WHERE id = $1', [params.id]);
  return responderJSON(res, 200, { ok: true });
}

// ── POST /platos/:id/imagen ───────────────────────────────────────────────────
// Recibe el archivo como raw binary (Content-Type: image/jpeg|png|webp).
// Lo sube a Supabase Storage con la service_role key (nunca sale del backend)
// y guarda la URL pública resultante en imagen_url del plato.

const TIPOS_IMAGEN: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png':  'png',
  'image/webp': 'webp',
};

export async function subirImagenPlato(
  req: IncomingMessage, res: ServerResponse, params: Record<string, string>
): Promise<void> {
  const { restaurant_id } = verificarToken(req);
  if (!esIdValido(params.id)) return responderJSON(res, 400, { error: 'ID inválido' });

  // Ownership check: el plato debe pertenecer al restaurante del token
  const plato = await queryOne(
    'SELECT id FROM platos WHERE id = $1 AND restaurant_id = $2',
    [params.id, restaurant_id]
  );
  if (!plato) return responderJSON(res, 403, { error: 'No tenés permiso para modificar este plato' });

  // Validar tipo de imagen
  const contentType = (req.headers['content-type'] ?? '').split(';')[0].trim();
  if (!TIPOS_IMAGEN[contentType]) {
    return responderJSON(res, 400, { error: 'Solo se permiten imágenes JPG, PNG o WebP' });
  }

  // Leer body como binario — límite 5 MB
  let buffer: Buffer;
  try {
    buffer = await leerCuerpoRaw(req, 5 * 1024 * 1024);
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 413) return responderJSON(res, 413, { error: 'La imagen no puede superar 5 MB' });
    return responderJSON(res, 400, { error: 'Error al leer la imagen' });
  }

  if (buffer.length === 0) {
    return responderJSON(res, 400, { error: 'El archivo de imagen está vacío' });
  }

  // Nombre de archivo determinista: restaurante-N/plato-N (sin extensión para que el upsert
  // siempre pise el mismo objeto sin importar si cambia el formato)
  const rutaArchivo = `restaurante-${restaurant_id}/plato-${params.id}`;
  const uploadUrl   = `${config.supabaseUrl}/storage/v1/object/platos/${rutaArchivo}`;

  // Supabase Storage REST API:
  // - Authorization: Bearer <key> + apikey: <key> (requerido con el formato nuevo sb_secret_...)
  // - x-upsert: true → sobreescribe si ya existe el mismo archivo (upsert seguro)
  const supabaseRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${config.supabaseServiceKey}`,
      apikey:         config.supabaseServiceKey,
      'Content-Type': contentType,
      'x-upsert':     'true',
    },
    body: buffer as unknown as BodyInit,
  });

  if (!supabaseRes.ok) {
    let mensajeError = `HTTP ${supabaseRes.status}`;
    try {
      const detalle = await supabaseRes.json() as Record<string, unknown>;
      // Extraer mensaje sin loguear la key ni datos sensibles
      mensajeError = String(detalle.message ?? detalle.error ?? mensajeError);
    } catch { /* body no es JSON */ }
    console.error(`Error Supabase Storage [${supabaseRes.status}]: ${mensajeError}`);

    if (supabaseRes.status === 404) {
      return responderJSON(res, 502, { error: 'El bucket de imágenes no existe. Crealo en Supabase Storage.' });
    }
    if (supabaseRes.status === 403) {
      return responderJSON(res, 502, { error: 'Sin permiso para subir imágenes. Verificá la llave secreta en .env.' });
    }
    return responderJSON(res, 502, { error: `No se pudo subir la imagen: ${mensajeError}` });
  }

  // URL pública (requiere que el bucket "platos" sea público en Supabase)
  const imagenUrl = `${config.supabaseUrl}/storage/v1/object/public/platos/${rutaArchivo}`;

  const actualizado = await queryOne<{ id: number; imagen_url: string }>(
    'UPDATE platos SET imagen_url = $1 WHERE id = $2 RETURNING id, imagen_url',
    [imagenUrl, params.id]
  );

  return responderJSON(res, 200, actualizado);
}
