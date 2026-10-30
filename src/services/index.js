// Builds the service layer once. The Express app and the MCP tools both receive the
// object this returns, so there is exactly one implementation of every rule.
import { join } from 'node:path';
import { createPool } from '../data/db.js';
import { createGeminiClient } from '../integrations/geminiClient.js';
import { createAuthService } from './authService.js';
import { createClubService } from './clubService.js';
import { createEventDraftService } from './eventDraftService.js';
import { createEventService } from './eventService.js';
import { createHealthService } from './healthService.js';
import { argon2Hasher } from './passwords.js';
import { createOauthService } from './oauthService.js';
import { createRegistrationService } from './registrationService.js';

export const MIGRATIONS_DIR = join(import.meta.dirname, '..', '..', 'migrations');

export function createServices({ pool, modelClient, clock, hasher, sessionTtlMs, logger, draftTimeoutMs }) {
  return {
    auth: createAuthService({ pool, hasher, clock, sessionTtlMs }),
    oauth: createOauthService({ pool }),
    clubs: createClubService({ pool }),
    events: createEventService({ pool, clock }),
    registrations: createRegistrationService({ pool, clock }),
    drafts: createEventDraftService({ modelClient, timeoutMs: draftTimeoutMs, logger }),
    health: createHealthService({ pool }),
  };
}

/** Production wiring: the real pool, the real model adapter, the real clock. */
export function createServicesFromConfig(config) {
  const pool = createPool(config.databaseUrl);
  const modelClient = createGeminiClient({
    apiKey: config.model.apiKey,
    model: config.model.name,
    timeoutMs: config.model.timeoutMs,
  });
  const services = createServices({
    pool,
    modelClient,
    clock: () => new Date(),
    hasher: argon2Hasher,
    sessionTtlMs: config.sessionTtlMs,
    logger: console,
    draftTimeoutMs: config.model.timeoutMs,
  });
  return { pool, services };
}
