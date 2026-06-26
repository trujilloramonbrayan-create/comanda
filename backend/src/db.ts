// Pool de conexiones PostgreSQL y helpers tipados para ejecutar queries.
// Un único pool compartido por toda la app; pg lo gestiona internamente.

import { Pool } from 'pg';
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
