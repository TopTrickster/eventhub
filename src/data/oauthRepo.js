// SQL for provider identities attached to a user.

export async function findOauthAccount(db, provider, providerUserId) {
  const { rows } = await db.query(
    'SELECT user_id FROM oauth_accounts WHERE provider = $1 AND provider_user_id = $2',
    [provider, providerUserId],
  );
  return rows[0] && { userId: rows[0].user_id };
}

export async function insertOauthAccount(db, { userId, provider, providerUserId }) {
  await db.query('INSERT INTO oauth_accounts (user_id, provider, provider_user_id) VALUES ($1, $2, $3)', [
    userId,
    provider,
    providerUserId,
  ]);
}

export async function countOauthAccounts(db, userId) {
  const { rows } = await db.query('SELECT count(*) AS n FROM oauth_accounts WHERE user_id = $1', [userId]);
  return rows[0].n;
}
