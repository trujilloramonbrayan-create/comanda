// Carga y valida todas las variables de entorno al arrancar.
// Importar este módulo es suficiente; el resto de módulos importa desde aquí.

// Carga .env si existe. En producción las vars llegan del entorno del proceso.
try {
  process.loadEnvFile('.env');
} catch {
  // .env no existe: se asume que las vars ya están en el entorno
}

function requerirEnv(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) throw new Error(`Variable de entorno faltante: ${nombre}`);
  return valor;
}

export const config = {
  port:               parseInt(process.env.PORT ?? '3000', 10),
  databaseUrl:        requerirEnv('DATABASE_URL'),
  jwtSecret:          requerirEnv('JWT_SECRET'),
  supabaseUrl:        requerirEnv('SUPABASE_URL'),
  supabaseServiceKey: requerirEnv('SUPABASE_SERVICE_ROLE_KEY'),
  // APP_URL se usa para los back_urls del checkout y la URL del webhook de MP
  appUrl:             process.env.APP_URL ?? 'https://clik.work',
};
