// SQL for users. Rows come back in camelCase; password_hash only leaves this file
// for the auth service, which never returns it to a caller.

const mapUser = (row) =>
  row && {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    passwordHash: row.password_hash,
    role: row.role,
    createdAt: row.created_at,
  };

const COLUMNS = 'id, email, display_name, password_hash, role, created_at';

export async function insertUser(db, { email, displayName, passwordHash, role }) {
  const { rows } = await db.query(
    `INSERT INTO users (email, display_name, password_hash, role)
     VALUES ($1, $2, $3, $4)
     RETURNING ${COLUMNS}`,
    [email, displayName, passwordHash, role],
  );
  return mapUser(rows[0]);
}

export async function findUserByEmail(db, email) {
  const { rows } = await db.query(`SELECT ${COLUMNS} FROM users WHERE email = $1`, [email]);
  return mapUser(rows[0]);
}

export async function findUserById(db, id) {
  const { rows } = await db.query(`SELECT ${COLUMNS} FROM users WHERE id = $1`, [id]);
  return mapUser(rows[0]);
}

export async function setPasswordHash(db, userId, passwordHash) {
  await db.query('UPDATE users SET password_hash = $2 WHERE id = $1', [userId, passwordHash]);
}
