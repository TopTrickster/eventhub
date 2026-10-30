// Serving the React build from the same Express process, so the API and the pages share
// one origin and the session cookie needs no CORS.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import express from 'express';

export const CLIENT_DIST = join(import.meta.dirname, '..', 'dist', 'client');

/** Static files from `dir`, and index.html for any other GET so client-side routes load. */
export function staticFrontend(dir) {
  return (app) => {
    const index = join(dir, 'index.html');
    if (!existsSync(index)) {
      app.get(/.*/, (req, res) => res.status(503).type('text').send('The client is not built yet: run npm run build.'));
      return;
    }
    app.use(express.static(dir, { index: false }));
    app.get(/.*/, (req, res) => res.sendFile(index));
  };
}
