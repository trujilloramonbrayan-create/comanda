// Utilidades HTTP compartidas por todos los módulos de rutas.

import type { IncomingMessage, ServerResponse } from 'node:http';

export function responderJSON(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

const LIMITE_CUERPO = 100 * 1024; // 100 KB — previene DoS por payloads gigantes

// Lee el body del request como Buffer binario puro (para recibir imágenes).
// Rechaza con { status: 413 } si supera el límite en bytes.
export function leerCuerpoRaw(req: IncomingMessage, limite: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let tamaño = 0;
    let terminado = false;

    req.on('data', (chunk: Buffer) => {
      if (terminado) return;
      tamaño += chunk.length;
      if (tamaño > limite) {
        terminado = true;
        reject(Object.assign(new Error('Imagen demasiado grande'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (terminado) return;
      terminado = true;
      resolve(Buffer.concat(chunks));
    });
    req.on('error', (err) => {
      if (!terminado) { terminado = true; reject(err); }
    });
  });
}

// Lee el body del request y lo parsea como JSON.
// Rechaza con { status: 413 } si supera el límite, o si el cuerpo no es JSON válido.
export function leerCuerpo<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let tamaño = 0;
    let terminado = false;

    req.on('data', (chunk: Buffer) => {
      if (terminado) return;
      tamaño += chunk.length;
      if (tamaño > LIMITE_CUERPO) {
        terminado = true;
        reject(Object.assign(new Error('El cuerpo de la petición supera el límite de 100 KB'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (terminado) return;
      terminado = true;
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as T);
      } catch {
        reject(new Error('JSON inválido'));
      }
    });
    req.on('error', (err) => {
      if (!terminado) {
        terminado = true;
        reject(err);
      }
    });
  });
}
