// Autenticación de dueños de restaurantes.
// POST /auth/register — crea restaurant + owner en una transacción, devuelve JWT.
// POST /auth/login    — verifica credenciales, devuelve JWT.
// verificarToken      — middleware para proteger rutas.

import type { IncomingMessage, ServerResponse } from 'node:http';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { config } from './config.ts';
import { queryOne, transaccion } from './db.ts';
import { leerCuerpo, responderJSON } from './utils.ts';

const REGEX_EMAIL       = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PG_UNIQUE_VIOLATION = '23505';
const BCRYPT_ROUNDS     = 12;

interface TokenPayload {
  owner_id:      number;
  restaurant_id: number;
  email:         string;
}

// ── POST /auth/register ────────────────────────────────────────

export async function register(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let body: { nombre_restaurante?: unknown; slug?: unknown; email?: unknown; password?: unknown };
  try {
    body = await leerCuerpo(req);
  } catch {
    return responderJSON(res, 400, { error: 'Cuerpo JSON inválido' });
  }

  const nombre   = typeof body.nombre_restaurante === 'string' ? body.nombre_restaurante.trim() : '';
  const slug     = typeof body.slug     === 'string' ? body.slug.trim()                    : '';
  const email    = typeof body.email    === 'string' ? body.email.trim().toLowerCase()      : '';
  const password = typeof body.password === 'string' ? body.password                        : '';

  if (!nombre)                           return responderJSON(res, 400, { error: 'El nombre del restaurante es requerido' });
  if (nombre.length > 255)               return responderJSON(res, 400, { error: 'El nombre no puede superar 255 caracteres' });
  if (!slug)                             return responderJSON(res, 400, { error: 'El slug es requerido' });
  if (!/^[a-z0-9-]+$/.test(slug))       return responderJSON(res, 400, { error: 'El slug solo puede tener minúsculas, números y guiones' });
  if (slug.length > 100)                 return responderJSON(res, 400, { error: 'El slug no puede superar 100 caracteres' });
  if (!email || !REGEX_EMAIL.test(email)) return responderJSON(res, 400, { error: 'El email no tiene un formato válido' });
  if (password.length < 8)               return responderJSON(res, 400, { error: 'La contraseña debe tener al menos 8 caracteres' });
  // bcrypt trunca en 72 bytes → dos contraseñas distintas podrían coincidir si comparten los primeros 72 bytes
  if (password.length > 128)             return responderJSON(res, 400, { error: 'La contraseña no puede superar 128 caracteres' });

  // Verificar duplicados antes de la transacción para dar mensajes claros
  const emailExistente = await queryOne('SELECT id FROM owners WHERE email = $1', [email]);
  if (emailExistente) return responderJSON(res, 409, { error: 'Ese email ya está registrado' });

  const slugExistente = await queryOne('SELECT id FROM restaurants WHERE slug = $1', [slug]);
  if (slugExistente) return responderJSON(res, 409, { error: 'Ese slug ya está en uso' });

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  try {
    const resultado = await transaccion(async (client) => {
      // 1. Crear el restaurante con 30 días de prueba
      const { rows: restRows } = await client.query(
        `INSERT INTO restaurants (nombre, slug, activo, plan_hasta)
         VALUES ($1, $2, true, NOW() + INTERVAL '30 days')
         RETURNING id, nombre, slug, plan_hasta`,
        [nombre, slug]
      );
      const restaurante = restRows[0] as { id: number; nombre: string; slug: string; plan_hasta: Date };

      // 2. Crear el owner vinculado
      const { rows: ownerRows } = await client.query(
        `INSERT INTO owners (restaurant_id, email, password_hash)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [restaurante.id, email, passwordHash]
      );
      const ownerId = (ownerRows[0] as { id: number }).id;

      return { restaurante, ownerId };
    });

    const payload: TokenPayload = {
      owner_id:      resultado.ownerId,
      restaurant_id: resultado.restaurante.id,
      email,
    };
    const token = jwt.sign(payload, config.jwtSecret, { expiresIn: '7d' });

    return responderJSON(res, 201, {
      token,
      restaurant: {
        id:        resultado.restaurante.id,
        nombre:    resultado.restaurante.nombre,
        slug:      resultado.restaurante.slug,
        plan_hasta: resultado.restaurante.plan_hasta,
      },
    });
  } catch (err: unknown) {
    // Race condition: otro request ganó el UNIQUE justo entre la verificación y el INSERT
    if ((err as { code?: string }).code === PG_UNIQUE_VIOLATION) {
      return responderJSON(res, 409, { error: 'Email o slug ya en uso' });
    }
    console.error('Error en registro:', err);
    return responderJSON(res, 500, { error: 'Error interno del servidor' });
  }
}

// ── POST /auth/login ───────────────────────────────────────────

export async function login(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let body: { email?: unknown; password?: unknown };
  try {
    body = await leerCuerpo(req);
  } catch {
    return responderJSON(res, 400, { error: 'Cuerpo JSON inválido' });
  }

  const email    = typeof body.email    === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password                   : '';

  if (!email || !password) {
    return responderJSON(res, 400, { error: 'Email y contraseña son requeridos' });
  }

  interface OwnerRow {
    owner_id:          number;
    password_hash:     string;
    restaurant_id:     number;
    restaurant_nombre: string;
    restaurant_slug:   string;
  }

  const fila = await queryOne<OwnerRow>(
    `SELECT o.id             AS owner_id,
            o.password_hash,
            o.restaurant_id,
            r.nombre         AS restaurant_nombre,
            r.slug           AS restaurant_slug
     FROM   owners       o
     JOIN   restaurants  r ON r.id = o.restaurant_id
     WHERE  o.email = $1`,
    [email]
  );

  // Mismo mensaje para email inexistente y password incorrecto (no revelar cuál falló)
  const CREDENCIALES_INVALIDAS = 'Email o contraseña incorrectos';

  if (!fila) return responderJSON(res, 401, { error: CREDENCIALES_INVALIDAS });

  const coincide = await bcrypt.compare(password, fila.password_hash);
  if (!coincide) return responderJSON(res, 401, { error: CREDENCIALES_INVALIDAS });

  const payload: TokenPayload = {
    owner_id:      fila.owner_id,
    restaurant_id: fila.restaurant_id,
    email,
  };
  const token = jwt.sign(payload, config.jwtSecret, { expiresIn: '7d' });

  return responderJSON(res, 200, {
    token,
    restaurant: {
      id:     fila.restaurant_id,
      nombre: fila.restaurant_nombre,
      slug:   fila.restaurant_slug,
    },
  });
}

// ── verificarToken ─────────────────────────────────────────────
// Valida el JWT del header Authorization: Bearer <token>.
// Lanza un error con { status: 401 } si falta o es inválido;
// el manejador de errores global de server.ts lo convierte en 401.

export function verificarToken(req: IncomingMessage): TokenPayload {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw Object.assign(new Error('Token de autorización requerido'), { status: 401 });
  }
  const token = authHeader.slice(7);
  try {
    return jwt.verify(token, config.jwtSecret) as TokenPayload;
  } catch {
    throw Object.assign(new Error('Token inválido o expirado'), { status: 401 });
  }
}
