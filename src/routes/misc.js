// The smaller resources: my registrations, my clubs, the AI draft, health.
import express from 'express';

export function registrationRoutes({ services }) {
  const router = express.Router();
  router.get('/me', async (req, res) => {
    res.json({ items: await services.registrations.listMine(req.currentUser) });
  });
  return router;
}

export function clubRoutes({ services }) {
  const router = express.Router();
  router.post('/', async (req, res) => {
    res.status(201).json({ club: await services.clubs.createClub(req.currentUser, req.body ?? {}) });
  });
  router.get('/me', async (req, res) => {
    res.json({ items: await services.clubs.listMine(req.currentUser) });
  });
  return router;
}

/** The handler only passes the text on; the draft service owns the model call and its fallback. */
export function aiRoutes({ services }) {
  const router = express.Router();
  router.post('/event-draft', async (req, res) => {
    res.json(await services.drafts.createDraft(req.currentUser, req.body?.text));
  });
  return router;
}

export function healthHandler({ services }) {
  return async (req, res) => {
    const { ok, database } = await services.health.check();
    res.status(ok ? 200 : 503).json({ status: ok ? 'ok' : 'degraded', database });
  };
}
