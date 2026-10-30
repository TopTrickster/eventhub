// Taking and giving back a seat. The HTTP route and the MCP tools call these exact
// functions, so the capacity rule has one implementation.
import { withTransaction } from '../data/db.js';
import { listUpcomingEventsRegisteredBy, lockEvent } from '../data/eventsRepo.js';
import { countRegistrations, deleteRegistration, hasRegistration, insertRegistration } from '../data/registrationsRepo.js';
import { requireUser, toPublicEvent } from './access.js';
import { conflict, eventNotFound, notFound } from './errors.js';
import { isUuid } from './validation.js';

export function createRegistrationService({ pool, clock }) {
  return {
    /**
     * Locks the event row with SELECT ... FOR UPDATE before counting. Two requests for the
     * last seat queue on that lock: the first inserts and commits, the second then counts
     * a full event and gets EVENT_FULL. Without the lock both could count one free seat.
     */
    async registerForEvent(currentUser, eventId) {
      requireUser(currentUser);
      if (!isUuid(eventId)) throw eventNotFound();
      return withTransaction(pool, async (client) => {
        const event = await lockEvent(client, eventId);
        if (!event) throw eventNotFound();
        if (event.startsAt <= clock()) {
          throw conflict('EVENT_NOT_UPCOMING', 'Събитието вече е започнало или е минало, записването е затворено.');
        }
        if (await hasRegistration(client, { eventId, userId: currentUser.id })) {
          throw conflict('ALREADY_REGISTERED', 'Вече сте записани за това събитие.');
        }
        const taken = await countRegistrations(client, eventId);
        if (taken >= event.capacity) throw conflict('EVENT_FULL', 'Няма свободни места за това събитие.');
        const registration = await insertRegistration(client, { eventId, userId: currentUser.id });
        return {
          eventId: registration.eventId,
          registeredAt: registration.createdAt.toISOString(),
          freeSeats: event.capacity - taken - 1,
        };
      });
    },

    /** Only ever the caller's own row: there is no argument that could name somebody else's. */
    async cancelMine(currentUser, eventId) {
      requireUser(currentUser);
      const removed = isUuid(eventId) ? await deleteRegistration(pool, { eventId, userId: currentUser.id }) : 0;
      if (removed === 0) throw notFound('REGISTRATION_NOT_FOUND', 'Не сте записани за това събитие.');
    },

    async listMine(currentUser) {
      requireUser(currentUser);
      const events = await listUpcomingEventsRegisteredBy(pool, { userId: currentUser.id, now: clock() });
      return events.map((event) => toPublicEvent(event, currentUser));
    },
  };
}
