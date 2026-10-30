// Who is asking. A role says what kind of thing a person may do; ownership, checked in
// each service against the row itself, says which rows they may do it to.
import { forbidden, unauthenticated } from './errors.js';

export function requireUser(currentUser) {
  if (!currentUser) throw unauthenticated();
  return currentUser;
}

export function requireOrganizer(currentUser, message) {
  requireUser(currentUser);
  if (currentUser.role !== 'organizer') throw forbidden(message);
  return currentUser;
}

/** The safe public shape of an event: seat counts, never who took the seats. */
export const toPublicEvent = (event, viewer) => ({
  id: event.id,
  club: { id: event.clubId, name: event.clubName },
  title: event.title,
  description: event.description,
  summary: event.summary,
  category: event.category,
  location: event.location,
  startsAt: event.startsAt.toISOString(),
  endsAt: event.endsAt.toISOString(),
  capacity: event.capacity,
  registeredCount: event.registeredCount,
  freeSeats: Math.max(0, event.capacity - event.registeredCount),
  isRegistered: event.isRegistered,
  isOwner: event.organizerId === viewer.id,
});
