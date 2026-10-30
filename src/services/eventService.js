// Events: reading them, and the organizer's own create/edit/delete/attendee list.
// Ownership is decided here, against the row, for every caller: route, MCP tool or test.
import { findClubById } from '../data/clubsRepo.js';
import { withTransaction } from '../data/db.js';
import {
  deleteEventById,
  findEventById,
  insertEvent,
  listAttendees,
  listUpcomingEvents,
  lockEvent,
  updateEventFields,
} from '../data/eventsRepo.js';
import { countRegistrations } from '../data/registrationsRepo.js';
import { requireOrganizer, requireUser, toPublicEvent } from './access.js';
import { conflict, eventNotFound, forbidden } from './errors.js';
import { checkSchedule, isUuid, throwIfInvalid, validateEventFields } from './validation.js';

const NOT_YOURS = 'Можете да управлявате само собствените си събития.';

export function createEventService({ pool, clock }) {
  /** Locks the event and checks it is the caller's; the lock lasts until the transaction ends. */
  async function lockOwnEvent(client, currentUser, id) {
    const event = await lockEvent(client, id);
    if (!event) throw eventNotFound();
    if (event.organizerId !== currentUser.id) throw forbidden(NOT_YOURS);
    return event;
  }

  return {
    async listUpcomingEvents(currentUser) {
      requireUser(currentUser);
      const events = await listUpcomingEvents(pool, { viewerId: currentUser.id, now: clock() });
      return events.map((event) => toPublicEvent(event, currentUser));
    },

    async getEvent(currentUser, id) {
      requireUser(currentUser);
      const event = isUuid(id) ? await findEventById(pool, { id, viewerId: currentUser.id }) : undefined;
      if (!event) throw eventNotFound();
      return toPublicEvent(event, currentUser);
    },

    async createEvent(currentUser, input) {
      requireOrganizer(currentUser, 'Само организатори могат да създават събития.');
      const errors = {};
      if (!isUuid(input.clubId)) errors.clubId = 'Изберете клуб.';
      const values = validateEventFields(errors, { summary: '', ...input }, { partial: false });
      checkSchedule(errors, values, clock(), true);
      throwIfInvalid(errors);

      const club = await findClubById(pool, input.clubId);
      if (club?.ownerId !== currentUser.id) throw forbidden('Можете да създавате събития само в собствения си клуб.');

      const id = await insertEvent(pool, { ...values, clubId: club.id, organizerId: currentUser.id });
      return toPublicEvent(await findEventById(pool, { id, viewerId: currentUser.id }), currentUser);
    },

    async updateEvent(currentUser, id, input) {
      requireUser(currentUser);
      if (!isUuid(id)) throw eventNotFound();
      const errors = {};
      const values = validateEventFields(errors, input, { partial: true });

      return withTransaction(pool, async (client) => {
        // Ownership first: somebody else's event answers 403, whatever the body says.
        const event = await lockOwnEvent(client, currentUser, id);
        const schedule = { startsAt: values.startsAt ?? event.startsAt, endsAt: values.endsAt ?? event.endsAt };
        checkSchedule(errors, schedule, clock(), values.startsAt !== undefined);
        throwIfInvalid(errors);

        if (values.capacity !== undefined) {
          // The event row is locked, so no registration can slip in between this count and the update.
          const taken = await countRegistrations(client, id);
          if (values.capacity < taken) {
            throw conflict(
              'CAPACITY_BELOW_REGISTRATIONS',
              `Капацитетът не може да е по-малък от броя на записаните (${taken}).`,
            );
          }
        }
        await updateEventFields(client, id, values);
        return toPublicEvent(await findEventById(client, { id, viewerId: currentUser.id }), currentUser);
      });
    },

    /** Its registrations are removed by ON DELETE CASCADE in the same statement. */
    async deleteEvent(currentUser, id) {
      requireUser(currentUser);
      if (!isUuid(id)) throw eventNotFound();
      await withTransaction(pool, async (client) => {
        await lockOwnEvent(client, currentUser, id);
        await deleteEventById(client, id);
      });
    },

    /** Names and emails of attendees are personal data: only the event's organizer sees them. */
    async listAttendees(currentUser, id) {
      requireUser(currentUser);
      const event = isUuid(id) ? await findEventById(pool, { id, viewerId: currentUser.id }) : undefined;
      if (!event) throw eventNotFound();
      if (event.organizerId !== currentUser.id) throw forbidden('Само организаторът на събитието вижда кой е записан.');
      return listAttendees(pool, id);
    },
  };
}
