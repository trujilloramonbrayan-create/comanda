// Router manual: registra rutas (método + patrón) y las despacha contra cada request.
// Soporta parámetros de ruta con la sintaxis /:nombre.

import type { IncomingMessage, ServerResponse } from 'node:http';

export type Manejador = (
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>
) => Promise<void> | void;

interface Ruta {
  metodo: string;
  patron: RegExp;
  llaves: string[];
  manejador: Manejador;
}

const rutas: Ruta[] = [];

// Convierte "/restaurantes/:slug/mesas/:id" en regex y extrae los nombres de los params.
function compilarRuta(ruta: string): { patron: RegExp; llaves: string[] } {
  const llaves: string[] = [];
  const patronStr = ruta.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, llave) => {
    llaves.push(llave);
    return '([^/]+)';
  });
  // Ancla inicio y fin para que "/foo" no coincida con "/foobar"
  return { patron: new RegExp(`^${patronStr}$`), llaves };
}

export function registrar(metodo: string, ruta: string, manejador: Manejador) {
  const { patron, llaves } = compilarRuta(ruta);
  rutas.push({ metodo: metodo.toUpperCase(), patron, llaves, manejador });
}

export async function despachar(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  const ruta = url.pathname;
  const metodo = req.method?.toUpperCase() ?? 'GET';

  for (const entrada of rutas) {
    if (entrada.metodo !== metodo) continue;
    const coincidencia = ruta.match(entrada.patron);
    if (!coincidencia) continue;

    // Mapea cada grupo capturado al nombre de parámetro correspondiente
    const params: Record<string, string> = {};
    entrada.llaves.forEach((llave, i) => {
      params[llave] = decodeURIComponent(coincidencia[i + 1]);
    });

    await entrada.manejador(req, res, params);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Ruta no encontrada' }));
}
