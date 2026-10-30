// SQL for clubs.

const mapClub = (row) =>
  row && { id: row.id, ownerId: row.owner_id, name: row.name, description: row.description, createdAt: row.created_at };

export async function insertClub(db, { ownerId, name, description }) {
  const { rows } = await db.query(
    `INSERT INTO clubs (owner_id, name, description) VALUES ($1, $2, $3)
     RETURNING id, owner_id, name, description, created_at`,
    [ownerId, name, description],
  );
  return mapClub(rows[0]);
}

export async function findClubById(db, id) {
  const { rows } = await db.query('SELECT id, owner_id, name, description, created_at FROM clubs WHERE id = $1', [id]);
  return mapClub(rows[0]);
}

export async function listClubsByOwner(db, ownerId) {
  const { rows } = await db.query(
    'SELECT id, owner_id, name, description, created_at FROM clubs WHERE owner_id = $1 ORDER BY created_at, id',
    [ownerId],
  );
  return rows.map(mapClub);
}
