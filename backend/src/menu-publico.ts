// Endpoint público del menú de un restaurante.
// GET /r/:slug — sin JWT, acceso libre para el cliente final que escanea el QR.
// Solo devuelve lo necesario para mostrar el menú: nada de owners, plan_hasta, etc.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { query, queryOne } from './db.ts';
import { responderJSON } from './utils.ts';
import { config } from './config.ts';

const REGEX_SLUG = /^[a-z0-9-]+$/;

interface RestauranteRow {
  id: number;
  nombre: string;
  slug: string;
  nequi: string | null;
  daviplata: string | null;
  plan_hasta: Date | null;
}

interface CatRow {
  id: number;
  nombre: string;
  orden: number;
}

interface PlatoRow {
  id: number;
  categoria_id: number;
  nombre: string;
  descripcion: string | null;
  precio: number;
  orden: number;
  imagen_url: string | null;
}

// GET /r/:slug
export async function menuPublico(
  _req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>
): Promise<void> {
  const { slug } = params;

  // Slug con caracteres inválidos → 404 (no revelar que la ruta existe)
  if (!REGEX_SLUG.test(slug)) {
    return responderJSON(res, 404, { error: 'Restaurante no encontrado' });
  }

  const restaurante = await queryOne<RestauranteRow>(
    'SELECT id, nombre, slug, nequi, daviplata, plan_hasta FROM restaurants WHERE slug = $1 AND activo = true',
    [slug]
  );

  if (!restaurante) {
    return responderJSON(res, 404, { error: 'Restaurante no encontrado' });
  }

  // Categorías del restaurante, ordenadas
  const categorias = await query<CatRow>(
    `SELECT id, nombre, orden
     FROM categorias
     WHERE restaurant_id = $1
     ORDER BY orden, id`,
    [restaurante.id]
  );

  // Solo platos disponibles (el cliente no debe ver lo agotado)
  const platos = await query<PlatoRow>(
    `SELECT id, categoria_id, nombre, descripcion, precio, orden, imagen_url
     FROM platos
     WHERE restaurant_id = $1 AND disponible = true
     ORDER BY orden, id`,
    [restaurante.id]
  );

  // Anidar platos en categorías y excluir categorías que quedaron sin platos disponibles
  const categoriasConPlatos = categorias
    .map(cat => ({
      id: cat.id,
      nombre: cat.nombre,
      orden: cat.orden,
      platos: platos.filter(p => p.categoria_id === cat.id),
    }))
    .filter(cat => cat.platos.length > 0);

  const plan_vencido = !!(restaurante.plan_hasta && new Date(restaurante.plan_hasta) < new Date());

  return responderJSON(res, 200, {
    restaurante: {
      nombre:       restaurante.nombre,
      slug:         restaurante.slug,
      tiene_mp:     !!config.mpAccessToken && !plan_vencido,
      nequi:        restaurante.nequi,
      daviplata:    restaurante.daviplata,
      plan_vencido,
    },
    categorias: categoriasConPlatos,
  });
}
