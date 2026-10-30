// SQL for sessions. Only the SHA-256 hash of a session token is ever stored or looked up.

export async function insertSession(db, { userId, tokenHash, expiresAt }) {
  await db.query('INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)', [
    userId,
    tokenHash,
    expiresAt,
  ]);
}

/** The user behind a session that has not expired yet, or undefined. */
export async function findUserBySessionHash(db, tokenHash, now) {
  const { rows } = await db.query(
    `SELECT u.id, u.email, u.display_name, u.role
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > $2`,
    [tokenHash, now],
  );
  const row = rows[0];
  return row && { id: row.id, email: row.email, displayName: row.display_name, role: row.role };
}

export async function deleteSessionByHash(db, tokenHash) {
  await db.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
}
