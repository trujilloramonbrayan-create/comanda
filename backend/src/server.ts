// Punto de entrada. Crea el servidor HTTP, registra rutas y empieza a escuchar.
// Las rutas de cada dominio (restaurantes, mesas, etc.) se registrarán en sus
// propios módulos e importarán aquí a medida que se agreguen.

import http from 'node:http';
import { config } from './config.ts';
import { despachar, registrar } from './router.ts';
import { listar, obtener, crear, actualizar, eliminar } from './restaurants.ts';

// Ruta de salud: permite verificar que el servidor está vivo
registrar('GET', '/health', (_req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true }));
});

// CRUD restaurants
registrar('GET',    '/restaurants',     listar);
registrar('GET',    '/restaurants/:id', obtener);
registrar('POST',   '/restaurants',     crear);
registrar('PUT',    '/restaurants/:id', actualizar);
registrar('DELETE', '/restaurants/:id', eliminar);

const servidor = http.createServer(async (req, res) => {
  try {
    await despachar(req, res);
  } catch (error) {
    console.error('Error no manejado:', error);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Error interno del servidor' }));
    }
  }
});

servidor.listen(config.port, () => {
  console.log(`Servidor escuchando en http://localhost:${config.port}`);
});
