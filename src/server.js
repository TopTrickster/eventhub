// Start-up: configuration, services, the frontend (Vite in development, the build in
// production), then listen. Everything with a rule in it is elsewhere and tested there.
import { createApp } from './app.js';
import { loadConfig, loadDotEnv } from './config/env.js';
import { CLIENT_DIST, staticFrontend } from './frontend.js';
import { createGoogleOAuthClient } from './integrations/googleOAuthClient.js';
import { createServicesFromConfig } from './services/index.js';

const dev = process.argv.includes('--dev');

loadDotEnv();
const config = loadConfig();
const { services } = createServicesFromConfig(config);
const googleClient = createGoogleOAuthClient(config.google);

async function viteFrontend() {
  // Imported only here: vite is a devDependency and is not installed in the production image.
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
  return (app) => app.use(vite.middlewares);
}

const frontend = dev ? await viteFrontend() : staticFrontend(CLIENT_DIST);
const app = createApp({ services, config, googleClient, logger: console, frontend });

app.listen(config.port, () => {
  console.log(`EventHub listening on ${config.appBaseUrl} (${dev ? 'development, Vite' : 'built client'})`);
  if (!config.model.apiKey) console.log('GEMINI_API_KEY is not set: AI drafts will use the fallback.');
  if (!googleClient.configured) console.log('GOOGLE_CLIENT_ID/SECRET are not set: Google sign-in is disabled.');
  // The server keeps running here; say so, or the waiting terminal looks like a hang.
  console.log(`\nOpen ${config.appBaseUrl} in your browser. Leave this terminal open; Ctrl+C stops the server.`);
});
