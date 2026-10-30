// Local sign-in and the one session mechanism both sign-in paths share.
// A session token is 32 random bytes; the browser (or MCP_TOKEN) holds it, the database
// holds only its SHA-256, so a leaked sessions table cannot be replayed.
import { createHash, randomBytes } from 'node:crypto';
import { isUniqueViolation } from '../data/db.js';
import { countOauthAccounts } from '../data/oauthRepo.js';
import { deleteSessionByHash, findUserBySessionHash, insertSession } from '../data/sessionsRepo.js';
import { findUserByEmail, findUserById, insertUser, setPasswordHash } from '../data/usersRepo.js';
import { requireUser } from './access.js';
import { AppError, conflict, forbidden } from './errors.js';
import { checkEmail, checkPassword, checkText, normalizeEmail, throwIfInvalid } from './validation.js';

export const hashToken = (token) => createHash('sha256').update(token).digest('hex');

export const publicUser = ({ id, email, displayName, role }) => ({ id, email, displayName, role });

// Same sentence for "no such email" and "wrong password": a failed sign-in must not
// tell anybody which addresses have an account.
const invalidCredentials = () => new AppError(401, 'INVALID_CREDENTIALS', 'Невалиден имейл или парола.');

export function createAuthService({ pool, hasher, clock, sessionTtlMs }) {
  // Verified against when the email is unknown, so both failures take as long.
  let dummyHash;

  return {
    async register(input) {
      const errors = {};
      const email = checkEmail(errors, input.email);
      const password = checkPassword(errors, input.password);
      const displayName = checkText(errors, 'displayName', input.displayName, { min: 1, max: 100, label: 'Името' });
      throwIfInvalid(errors);
      const passwordHash = await hasher.hash(password);
      try {
        return publicUser(await insertUser(pool, { email, displayName, passwordHash, role: 'member' }));
      } catch (error) {
        if (isUniqueViolation(error, 'users_email_unique')) {
          throw conflict('EMAIL_TAKEN', 'Вече има профил с този имейл. Влезте в него.');
        }
        throw error;
      }
    },

    async login(input) {
      const password = typeof input.password === 'string' ? input.password : '';
      const user = await findUserByEmail(pool, normalizeEmail(input.email));
      if (!user?.passwordHash) {
        dummyHash ??= await hasher.hash('timing-equaliser-not-a-real-password');
        await hasher.verify(dummyHash, password);
        throw invalidCredentials();
      }
      if (!(await hasher.verify(user.passwordHash, password))) throw invalidCredentials();
      return publicUser(user);
    },

    async createSession(userId) {
      const token = randomBytes(32).toString('base64url');
      const expiresAt = new Date(clock().getTime() + sessionTtlMs);
      await insertSession(pool, { userId, tokenHash: hashToken(token), expiresAt });
      return { token, expiresAt };
    },

    /** The same lookup for a browser cookie and for MCP_TOKEN. */
    async getUserBySessionToken(token) {
      if (typeof token !== 'string' || token.length === 0) return null;
      return (await findUserBySessionHash(pool, hashToken(token), clock())) ?? null;
    },

    async logout(token) {
      if (typeof token === 'string' && token.length > 0) await deleteSessionByHash(pool, hashToken(token));
    },

    /** A person who has only ever used Google adds a password to the same users row. */
    async addPassword(currentUser, password) {
      requireUser(currentUser);
      const errors = {};
      const checked = checkPassword(errors, password);
      throwIfInvalid(errors);
      const user = await findUserById(pool, currentUser.id);
      if (user.passwordHash) throw conflict('PASSWORD_ALREADY_SET', 'Профилът ви вече има парола.');
      if ((await countOauthAccounts(pool, user.id)) === 0) {
        throw forbidden('Парола може да се добави само към профил, влязъл с Google.');
      }
      await setPasswordHash(pool, user.id, await hasher.hash(checked));
    },
  };
}
