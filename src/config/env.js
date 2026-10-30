// Reads configuration once, so a missing variable fails at start-up with a readable
// message instead of halfway through a request. Secrets are read here and passed down;
// nothing else in src/ touches process.env.
import { existsSync } from 'node:fs';

// The database `npm run db:local` starts. Only ever a default outside production.
export const LOCAL_DATABASE_URL = 'postgres://postgres:postgres@localhost:5433/eventhub';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/** Loads .env into process.env for local runs; real values never live in git. */
export function loadDotEnv(path = '.env') {
  if (existsSync(path)) process.loadEnvFile(path);
}

export function loadConfig(env = process.env) {
  const isProduction = env.NODE_ENV === 'production';
  const port = Number.parseInt(env.PORT || '3000', 10);
  const appBaseUrl = (env.APP_BASE_URL || `http://localhost:${port}`).replace(/\/$/, '');

  if (isProduction && !env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set. Production needs a persistent PostgreSQL database (Neon).');
  }

  return {
    isProduction,
    port,
    appBaseUrl,
    databaseUrl: env.DATABASE_URL || LOCAL_DATABASE_URL,
    sessionTtlMs: SEVEN_DAYS_MS,
    google: {
      clientId: env.GOOGLE_CLIENT_ID || '',
      clientSecret: env.GOOGLE_CLIENT_SECRET || '',
      redirectUri: env.GOOGLE_REDIRECT_URI || `${appBaseUrl}/api/auth/google/callback`,
    },
    model: {
      apiKey: env.GEMINI_API_KEY || '',
      name: env.MODEL_NAME || 'gemini-3.5-flash-lite',
      timeoutMs: 5000,
    },
  };
}
