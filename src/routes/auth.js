// /api/auth: reading the request, calling the auth services, setting the cookie.
// Both sign-in paths end in startSession, so they produce the identical session.
import { timingSafeEqual } from 'node:crypto';
import express from 'express';
import { OAuthError } from '../integrations/googleOAuthClient.js';
import { AppError } from '../services/errors.js';
import { requireAuth, SESSION_COOKIE, sessionCookieOptions } from '../middleware/session.js';

const OAUTH_COOKIE = 'eh_oauth';
const OAUTH_COOKIE_PATH = '/api/auth/google';

const sameString = (a, b) =>
  typeof a === 'string' && typeof b === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export function authRoutes({ services, config, googleClient, signInLimiter, logger }) {
  const router = express.Router();

  async function startSession(res, user) {
    const { token, expiresAt } = await services.auth.createSession(user.id);
    res.cookie(SESSION_COOKIE, token, sessionCookieOptions(config, expiresAt));
  }

  router.post('/register', signInLimiter, async (req, res) => {
    const user = await services.auth.register(req.body ?? {});
    await startSession(res, user);
    res.status(201).json({ user });
  });

  router.post('/login', signInLimiter, async (req, res) => {
    const user = await services.auth.login(req.body ?? {});
    await startSession(res, user);
    res.json({ user });
  });

  router.post('/logout', requireAuth, async (req, res) => {
    await services.auth.logout(req.sessionToken);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.status(204).end();
  });

  router.get('/me', requireAuth, (req, res) => {
    res.json({ user: req.currentUser });
  });

  router.post('/password', requireAuth, async (req, res) => {
    await services.auth.addPassword(req.currentUser, req.body?.password);
    res.status(204).end();
  });

  // Step 1: remember state, PKCE verifier and nonce in a short-lived HttpOnly cookie, go to Google.
  router.get('/google', (req, res) => {
    if (!googleClient.configured) return res.redirect('/login?error=google_unavailable');
    const { url, state, codeVerifier, nonce } = googleClient.createAuthorizationRequest();
    res.cookie(OAUTH_COOKIE, { state, codeVerifier, nonce }, {
      httpOnly: true,
      sameSite: 'lax', // sent on Google's top-level redirect back to us
      secure: config.isProduction,
      path: OAUTH_COOKIE_PATH,
      maxAge: 10 * 60 * 1000,
    });
    res.redirect(url);
  });

  // Step 2: the state must match this browser's cookie, then the code is exchanged server-side.
  router.get('/google/callback', async (req, res) => {
    const pending = req.cookies[OAUTH_COOKIE];
    res.clearCookie(OAUTH_COOKIE, { path: OAUTH_COOKIE_PATH });
    if (!sameString(req.query.state, pending?.state) || typeof req.query.code !== 'string') {
      return res.redirect('/login?error=google_failed');
    }
    try {
      const profile = await googleClient.exchangeCode({
        code: req.query.code,
        codeVerifier: pending.codeVerifier,
        nonce: pending.nonce,
      });
      const user = await services.oauth.signInWithGoogle(profile);
      await startSession(res, user);
      res.redirect('/events');
    } catch (error) {
      if (error instanceof AppError && error.code === 'EMAIL_NOT_VERIFIED') {
        return res.redirect('/login?error=google_unverified');
      }
      if (error instanceof OAuthError) {
        logger.warn(`[oauth] ${error.reason}`);
        return res.redirect('/login?error=google_failed');
      }
      throw error;
    }
  });

  return router;
}
