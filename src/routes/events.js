// /api/events: parse, call the service with the current user, map the result to a status.
// No rule lives here; the services decide what this user may see and change.
import express from 'express';

export function eventRoutes({ services }) {
  const router = express.Router();
  const { events, registrations } = services;

  router.get('/', async (req, res) => {
    res.json({ items: await events.listUpcomingEvents(req.currentUser) });
  });

  router.post('/', async (req, res) => {
    res.status(201).json({ event: await events.createEvent(req.currentUser, req.body ?? {}) });
  });

  router.get('/:id', async (req, res) => {
    res.json({ event: await events.getEvent(req.currentUser, req.params.id) });
  });

  router.patch('/:id', async (req, res) => {
    res.json({ event: await events.updateEvent(req.currentUser, req.params.id, req.body ?? {}) });
  });

  router.delete('/:id', async (req, res) => {
    await events.deleteEvent(req.currentUser, req.params.id);
    res.status(204).end();
  });

  router.get('/:id/attendees', async (req, res) => {
    res.json({ items: await events.listAttendees(req.currentUser, req.params.id) });
  });

  router.post('/:id/registrations', async (req, res) => {
    res.status(201).json({ registration: await registrations.registerForEvent(req.currentUser, req.params.id) });
  });

  router.delete('/:id/registrations/me', async (req, res) => {
    await registrations.cancelMine(req.currentUser, req.params.id);
    res.status(204).end();
  });

  return router;
}
