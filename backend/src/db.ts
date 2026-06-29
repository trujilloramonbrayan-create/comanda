// Pool de conexiones PostgreSQL y helpers tipados para ejecutar queries.
// Un único pool compartido por toda la app; pg lo gestiona internamente.

import { Pool, type PoolClient } from 'pg';
import { config } from './config.ts';

const pool = new Pool({ connectionString: config.databaseUrl });

// Devuelve todas las filas. T debe coincidir con las columnas del SELECT.
// Sin constraint QueryResultRow para que interfaces concretas funcionen directamente.
export async function query<T>(sql: string, params?: unknown[]): Promise<T[]> {
  const resultado = await pool.query(sql, params);
  return resultado.rows as T[];
}

// Devuelve la primera fila o null. Útil para buscar por id/slug.
export async function queryOne<T>(sql: string, params?: unknown[]): Promise<T | null> {
  const filas = await query<T>(sql, params);
  return filas[0] ?? null;
}

// Ejecuta un callback dentro de una transacción.
// Si el callback lanza, hace ROLLBACK automático y re-lanza el error.
export async function transaccion<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const resultado = await callback(client);
    await client.query('COMMIT');
    return resultado;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
