// Configuration and serving the built client: the start-up pieces outside src/server.js.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { loadConfig, loadDotEnv, LOCAL_DATABASE_URL } from '../../src/config/env.js';
import { staticFrontend } from '../../src/frontend.js';

describe('loadConfig', () => {
  it('defaults to the local database and localhost outside production', () => {
    const config = loadConfig({});
    expect(config).toMatchObject({
      isProduction: false,
      port: 3000,
      appBaseUrl: 'http://localhost:3000',
      databaseUrl: LOCAL_DATABASE_URL,
      google: { clientId: '', redirectUri: 'http://localhost:3000/api/auth/google/callback' },
      model: { apiKey: '', name: 'gemini-3.5-flash-lite', timeoutMs: 5000 },
    });
  });

  it('reads production settings and refuses to start without a database', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/DATABASE_URL is not set/);
    const config = loadConfig({
      NODE_ENV: 'production',
      PORT: '8080',
      APP_BASE_URL: 'https://eventhub.example/',
      DATABASE_URL: 'postgres://neon/db',
      GOOGLE_CLIENT_ID: 'id',
      GOOGLE_CLIENT_SECRET: 'secret',
      GOOGLE_REDIRECT_URI: 'https://eventhub.example/cb',
      GEMINI_API_KEY: 'key',
      MODEL_NAME: 'other-model',
    });
    expect(config).toMatchObject({
      isProduction: true,
      port: 8080,
      appBaseUrl: 'https://eventhub.example',
      databaseUrl: 'postgres://neon/db',
      google: { clientId: 'id', clientSecret: 'secret', redirectUri: 'https://eventhub.example/cb' },
      model: { apiKey: 'key', name: 'other-model' },
    });
  });

  it('loads a .env file when there is one, without overriding the real environment', () => {
    const dir = mkdtempSync(join(tmpdir(), 'eventhub-env-'));
    const file = join(dir, '.env');
    writeFileSync(file, 'EVENTHUB_TEST_ONLY=from-file\n');
    loadDotEnv(file);
    expect(process.env.EVENTHUB_TEST_ONLY).toBe('from-file');
    delete process.env.EVENTHUB_TEST_ONLY;
    loadDotEnv(join(dir, 'missing.env'));
    expect(process.env.EVENTHUB_TEST_ONLY).toBeUndefined();
  });
});

describe('staticFrontend', () => {
  it('serves the build and falls back to index.html for client-side routes', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'eventhub-dist-'));
    writeFileSync(join(dir, 'index.html'), '<title>EventHub</title>');
    writeFileSync(join(dir, 'app.js'), 'console.log(1)');
    const app = express();
    staticFrontend(dir)(app);
    expect((await request(app).get('/app.js')).text).toBe('console.log(1)');
    expect((await request(app).get('/events/123')).text).toContain('<title>EventHub</title>');
  });

  it('says plainly when the client has not been built', async () => {
    const app = express();
    staticFrontend(mkdtempSync(join(tmpdir(), 'eventhub-empty-')))(app);
    const res = await request(app).get('/');
    expect(res.status).toBe(503);
    expect(res.text).toMatch(/npm run build/);
  });
});
