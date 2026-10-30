// SQL for events. Seats taken are counted from registrations in the same query
// (one aggregate, no stored counter that can drift out of sync).

// $1 is always the viewer, so every read can say whether that person is registered.
const EVENT_SELECT = `
  SELECT e.id, e.club_id, c.name AS club_name, e.organizer_id, e.title, e.description, e.summary,
         e.category, e.location, e.starts_at, e.ends_at, e.capacity, e.created_at, e.updated_at,
         count(r.id) AS registered_count,
         coalesce(bool_or(r.user_id = $1), false) AS is_registered
    FROM events e
    JOIN clubs c ON c.id = e.club_id
    LEFT JOIN registrations r ON r.event_id = e.id`;

const mapEvent = (row) =>
  row && {
    id: row.id,
    clubId: row.club_id,
    clubName: row.club_name,
    organizerId: row.organizer_id,
    title: row.title,
    description: row.description,
    summary: row.summary,
    category: row.category,
    location: row.location,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    capacity: row.capacity,
    registeredCount: row.registered_count,
    isRegistered: row.is_registered,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

export async function listUpcomingEvents(db, { viewerId, now }) {
  const { rows } = await db.query(
    `${EVENT_SELECT}
      WHERE e.starts_at > $2
      GROUP BY e.id, c.id
      ORDER BY e.starts_at ASC, e.id ASC`,
    [viewerId, now],
  );
  return rows.map(mapEvent);
}

export async function listUpcomingEventsRegisteredBy(db, { userId, now }) {
  const { rows } = await db.query(
    `${EVENT_SELECT}
      WHERE e.starts_at > $2
        AND EXISTS (SELECT 1 FROM registrations mine WHERE mine.event_id = e.id AND mine.user_id = $1)
      GROUP BY e.id, c.id
      ORDER BY e.starts_at ASC, e.id ASC`,
    [userId, now],
  );
  return rows.map(mapEvent);
}

export async function findEventById(db, { id, viewerId }) {
  const { rows } = await db.query(
    `${EVENT_SELECT}
      WHERE e.id = $2
      GROUP BY e.id, c.id`,
    [viewerId, id],
  );
  return mapEvent(rows[0]);
}

/**
 * Locks the event row until the surrounding transaction ends. Two registrations for the
 * last seat both wait here, so the second one counts the first one's row.
 */
export async function lockEvent(client, id) {
  const { rows } = await client.query(
    'SELECT id, organizer_id, starts_at, ends_at, capacity FROM events WHERE id = $1 FOR UPDATE',
    [id],
  );
  const row = rows[0];
  return (
    row && { id: row.id, organizerId: row.organizer_id, startsAt: row.starts_at, endsAt: row.ends_at, capacity: row.capacity }
  );
}

export async function insertEvent(db, event) {
  const { rows } = await db.query(
    `INSERT INTO events (club_id, organizer_id, title, description, summary, category, location, starts_at, ends_at, capacity)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [
      event.clubId,
      event.organizerId,
      event.title,
      event.description,
      event.summary,
      event.category,
      event.location,
      event.startsAt,
      event.endsAt,
      event.capacity,
    ],
  );
  return rows[0].id;
}

// The only columns a PATCH may touch. Column names never come from the request.
const COLUMN_OF = {
  title: 'title',
  description: 'description',
  summary: 'summary',
  category: 'category',
  location: 'location',
  startsAt: 'starts_at',
  endsAt: 'ends_at',
  capacity: 'capacity',
};

export async function updateEventFields(db, id, fields) {
  const keys = Object.keys(fields).filter((key) => key in COLUMN_OF);
  const sets = keys.map((key, index) => `${COLUMN_OF[key]} = $${index + 2}`);
  await db.query(`UPDATE events SET ${[...sets, 'updated_at = now()'].join(', ')} WHERE id = $1`, [
    id,
    ...keys.map((key) => fields[key]),
  ]);
}

/** Registrations go with it through ON DELETE CASCADE, in the same statement. */
export async function deleteEventById(db, id) {
  const { rowCount } = await db.query('DELETE FROM events WHERE id = $1', [id]);
  return rowCount;
}

export async function listAttendees(db, eventId) {
  const { rows } = await db.query(
    `SELECT u.id, u.display_name, u.email, r.created_at
       FROM registrations r
       JOIN users u ON u.id = r.user_id
      WHERE r.event_id = $1
      ORDER BY r.created_at ASC, u.id ASC`,
    [eventId],
  );
  return rows.map((row) => ({ userId: row.id, displayName: row.display_name, email: row.email, registeredAt: row.created_at }));
}
