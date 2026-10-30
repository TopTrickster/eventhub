// What /health reports: is the app up, and can it reach its database. No user data, no config.
import { pingDatabase } from '../data/db.js';

export function createHealthService({ pool }) {
  return {
    async check() {
      try {
        await pingDatabase(pool);
        return { ok: true, database: 'ok' };
      } catch {
        return { ok: false, database: 'unavailable' };
      }
    },
  };
}
