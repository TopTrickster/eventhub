// The Express app, built from already-constructed services so tests can hand in their own.
// Order matters: security headers, body and cookie parsing, then /api (Origin check,
// session, routes, API 404), then the frontend, then the single error handler.
import cookieParser from 'cookie-parser';
import express from 'express';
import { errorHandler, notFoundApi } from './middleware/errors.js';
import { checkOrigin, rateLimit, securityHeaders } from './middleware/security.js';
import { loadSession, requireAuth } from './middleware/session.js';
import { authRoutes } from './routes/auth.js';
import { eventRoutes } from './routes/events.js';
import { aiRoutes, clubRoutes, healthHandler, registrationRoutes } from './routes/misc.js';

export function createApp({ services, config, googleClient, logger, signInLimit = { windowMs: 15 * 60 * 1000, max: 20 }, frontend }) {
  const app = express();
  app.disable('x-powered-by');
  // Render terminates TLS in front of us; trust its one proxy hop for req.ip and req.protocol.
  if (config.isProduction) app.set('trust proxy', 1);

  app.use(securityHeaders(config.isProduction));
  app.use(express.json({ limit: '20kb' }));
  app.use(cookieParser());

  const health = healthHandler({ services });
  app.get('/health', health);

  const api = express.Router();
  api.get('/health', health);
  api.use(checkOrigin(config.appBaseUrl));
  api.use(loadSession(services.auth));
  api.use('/auth', authRoutes({ services, config, googleClient, signInLimiter: rateLimit(signInLimit), logger }));
  api.use('/events', requireAuth, eventRoutes({ services }));
  api.use('/registrations', requireAuth, registrationRoutes({ services }));
  api.use('/clubs', requireAuth, clubRoutes({ services }));
  api.use('/ai', requireAuth, aiRoutes({ services }));
  api.use(notFoundApi);
  app.use('/api', api);

  if (frontend) frontend(app);
  app.use(errorHandler(logger));
  return app;
}
