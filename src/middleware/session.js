// Turns the session cookie into req.currentUser. The cookie is the same whether the person
// signed in with a password or with Google: one session mechanism, one users row.
import { unauthenticated } from '../services/errors.js';

export const SESSION_COOKIE = 'eh_session';

export const sessionCookieOptions = (config, expires) => ({
  httpOnly: true, // page scripts cannot read it, so an XSS cannot steal it
  sameSite: 'lax', // not sent on cross-site POSTs
  secure: config.isProduction, // https only once deployed
  path: '/',
  expires,
});

export function loadSession(auth) {
  return async (req, res, next) => {
    req.sessionToken = req.cookies[SESSION_COOKIE];
    req.currentUser = await auth.getUserBySessionToken(req.sessionToken);
    next();
  };
}

export function requireAuth(req, res, next) {
  next(req.currentUser ? undefined : unauthenticated());
}
