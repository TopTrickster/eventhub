// SQL for registrations, the many-to-many between users and events.

export async function countRegistrations(db, eventId) {
  const { rows } = await db.query('SELECT count(*) AS n FROM registrations WHERE event_id = $1', [eventId]);
  return rows[0].n;
}

export async function hasRegistration(db, { eventId, userId }) {
  const { rows } = await db.query('SELECT 1 FROM registrations WHERE event_id = $1 AND user_id = $2', [eventId, userId]);
  return rows.length > 0;
}

export async function insertRegistration(db, { eventId, userId }) {
  const { rows } = await db.query(
    'INSERT INTO registrations (event_id, user_id) VALUES ($1, $2) RETURNING id, event_id, user_id, created_at',
    [eventId, userId],
  );
  const row = rows[0];
  return { id: row.id, eventId: row.event_id, userId: row.user_id, createdAt: row.created_at };
}

/** Deletes only the row of this user for this event; returns how many rows went. */
export async function deleteRegistration(db, { eventId, userId }) {
  const { rowCount } = await db.query('DELETE FROM registrations WHERE event_id = $1 AND user_id = $2', [eventId, userId]);
  return rowCount;
}
