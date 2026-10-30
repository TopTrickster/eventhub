// Sign in with Google: OpenID Connect authorization-code flow with PKCE, run by the server.
// The client secret never reaches the browser. The ID token arrives straight from Google's
// token endpoint over TLS, which OpenID Connect Core 3.1.3.7 accepts in place of checking
// its signature; its claims (issuer, audience, expiry, nonce) are still checked here.
import { createHash, randomBytes } from 'node:crypto';

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

export class OAuthError extends Error {
  constructor(reason) {
    super(`google sign-in failed: ${reason}`);
    this.name = 'OAuthError';
    this.reason = reason;
  }
}

const random = () => randomBytes(32).toString('base64url');
const challengeOf = (verifier) => createHash('sha256').update(verifier).digest('base64url');

function decodeJwtPayload(jwt) {
  const [, payload] = String(jwt).split('.');
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    throw new OAuthError('malformed_id_token');
  }
}

/** The checks that make an ID token mean "Google says this is that person, for this app, now". */
export function verifyIdTokenClaims(claims, { clientId, nonce, now }) {
  const audiences = [claims.aud].flat();
  if (!ISSUERS.includes(claims.iss)) throw new OAuthError('wrong_issuer');
  if (!audiences.includes(clientId)) throw new OAuthError('wrong_audience');
  if (!(claims.exp * 1000 > now)) throw new OAuthError('expired_id_token');
  if (claims.nonce !== nonce) throw new OAuthError('wrong_nonce');
  if (typeof claims.sub !== 'string' || claims.sub.length === 0) throw new OAuthError('missing_subject');
  return {
    subject: claims.sub,
    email: claims.email,
    // Google sends a boolean; only the literal true counts as verified.
    emailVerified: claims.email_verified === true,
    name: claims.name,
  };
}

export function createGoogleOAuthClient({ clientId, clientSecret, redirectUri, fetchImpl = fetch, now = Date.now }) {
  const configured = Boolean(clientId && clientSecret);

  return {
    configured,

    /** state ties the callback to this browser; the verifier proves the code is ours (PKCE). */
    createAuthorizationRequest() {
      const state = random();
      const codeVerifier = random();
      const nonce = random();
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        state,
        nonce,
        code_challenge: challengeOf(codeVerifier),
        code_challenge_method: 'S256',
        prompt: 'select_account',
      });
      return { url: `${AUTHORIZE_URL}?${params}`, state, codeVerifier, nonce };
    },

    async exchangeCode({ code, codeVerifier, nonce }) {
      let response;
      try {
        response = await fetchImpl(TOKEN_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
            code_verifier: codeVerifier,
          }),
          signal: AbortSignal.timeout(10_000),
        });
      } catch {
        throw new OAuthError('token_endpoint_unreachable');
      }
      if (!response.ok) throw new OAuthError('code_rejected');
      const body = await response.json().catch(() => ({}));
      if (typeof body.id_token !== 'string') throw new OAuthError('missing_id_token');
      return verifyIdTokenClaims(decodeJwtPayload(body.id_token), { clientId, nonce, now: now() });
    },
  };
}
