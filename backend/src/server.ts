// Punto de entrada. Crea el servidor HTTP, registra rutas y empieza a escuchar.

import http from 'node:http';
import { config } from './config.ts';
import { despachar, registrar } from './router.ts';
import { register, login } from './auth.ts';
import { menuPublico } from './menu-publico.ts';
import {
  miRestaurante,
  obtenerMenu,
  crearCategoria, actualizarCategoria, eliminarCategoria,
  crearPlato,     actualizarPlato,     eliminarPlato,    patchDisponible,
  subirImagenPlato,
} from './menu.ts';
import { crearPedido, listarPedidos, avanzarEstadoPedido } from './pedidos.ts';
import { obtenerGanancias } from './ganancias.ts';
import { iniciarOAuthMP, callbackOAuthMP, estadoMP, desconectarMP, webhookMP } from './mp.ts';

// Ruta de salud
registrar('GET', '/health', (_req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true }));
});

// Auth
registrar('POST', '/auth/register', register);
registrar('POST', '/auth/login',    login);

// Menú público — sin JWT, acceso libre para clientes del restaurante
registrar('GET',  '/r/:slug',         menuPublico);
registrar('POST', '/r/:slug/pedidos', crearPedido);

// Mercado Pago — OAuth callback sin JWT (viene del navegador desde MP)
registrar('GET',    '/auth/mp/callback', callbackOAuthMP);
// Webhook MP sin JWT (viene de los servidores de MP)
registrar('POST',   '/mp/webhook',       webhookMP);

// Panel del dueño — todos requieren JWT
registrar('GET',    '/mi-restaurante',    miRestaurante);
registrar('GET',    '/menu',              obtenerMenu);
registrar('POST',   '/categorias',        crearCategoria);
registrar('PUT',    '/categorias/:id',    actualizarCategoria);
registrar('DELETE', '/categorias/:id',    eliminarCategoria);
registrar('GET',    '/pedidos',           listarPedidos);
registrar('PATCH',  '/pedidos/:id',       avanzarEstadoPedido);
registrar('GET',    '/ganancias',         obtenerGanancias);
registrar('GET',    '/auth/mp',           iniciarOAuthMP);
registrar('GET',    '/mp/estado',         estadoMP);
registrar('DELETE', '/mp/desconectar',    desconectarMP);

registrar('POST',   '/platos',            crearPlato);
registrar('POST',   '/platos/:id/imagen', subirImagenPlato);
registrar('PUT',    '/platos/:id',        actualizarPlato);
registrar('PATCH',  '/platos/:id',        patchDisponible);
registrar('DELETE', '/platos/:id',        eliminarPlato);

const HEADERS_BASE = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  // Authorization incluido para que el frontend pueda enviar el JWT
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  // Cabeceras de seguridad HTTP estándar
  'X-Content-Type-Options':       'nosniff',
  'X-Frame-Options':              'DENY',
  'Referrer-Policy':              'strict-origin-when-cross-origin',
};

const servidor = http.createServer(async (req, res) => {
  Object.entries(HEADERS_BASE).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    await despachar(req, res);
  } catch (error) {
    if (!res.headersSent) {
      // Errores con { status } (ej. 401 de verificarToken) usan ese código.
      // El resto son errores inesperados → 500.
      const status = (error as { status?: number }).status;
      if (status === 401 || status === 403 || status === 413) {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: (error as Error).message }));
      } else {
        console.error('Error no manejado:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Error interno del servidor' }));
      }
    }
  }
});

servidor.listen(config.port, () => {
  console.log(`Servidor escuchando en http://localhost:${config.port}`);
});
