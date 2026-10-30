// Account linking for Google sign-in. The profile here has already been checked by the
// OAuth client (state, PKCE, issuer, audience, expiry, nonce); this file decides which
// users row it belongs to.
import { withTransaction } from '../data/db.js';
import { findOauthAccount, insertOauthAccount } from '../data/oauthRepo.js';
import { findUserByEmail, findUserById, insertUser } from '../data/usersRepo.js';
import { publicUser } from './authService.js';
import { AppError } from './errors.js';
import { normalizeEmail } from './validation.js';

const PROVIDER = 'google';

export function createOauthService({ pool }) {
  return {
    /**
     * 1. A Google identity seen before signs in as the user it was linked to.
     * 2. Otherwise the email must be verified by Google, or sign-in is refused: an
     *    unverified address is a claim anybody can make about somebody else's account.
     * 3. A verified email that matches a user links to that user; none creates one.
     */
    async signInWithGoogle(profile) {
      const linked = await findOauthAccount(pool, PROVIDER, profile.subject);
      if (linked) return publicUser(await findUserById(pool, linked.userId));

      if (profile.emailVerified !== true || typeof profile.email !== 'string') {
        throw new AppError(
          403,
          'EMAIL_NOT_VERIFIED',
          'Google не е потвърдил имейла на този профил, затова не можем да ви впишем с него.',
        );
      }
      const email = normalizeEmail(profile.email);
      return withTransaction(pool, async (client) => {
        const existing = await findUserByEmail(client, email);
        const user =
          existing ??
          (await insertUser(client, {
            email,
            displayName: (profile.name || email.split('@')[0]).slice(0, 100),
            passwordHash: null,
            role: 'member',
          }));
        await insertOauthAccount(client, { userId: user.id, provider: PROVIDER, providerUserId: profile.subject });
        return publicUser(user);
      });
    },
  };
}
