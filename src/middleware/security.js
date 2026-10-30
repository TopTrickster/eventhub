// Request-level protections that are about HTTP, not about business rules.
import { AppError, forbidden } from '../services/errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// "null" (a sandboxed page) or anything unparsable is treated as a foreign origin.
const hostOf = (origin) => {
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
};

/**
 * CSRF defence in depth on top of SameSite=Lax: a state-changing request whose Origin is
 * some other site is refused. Requests without an Origin (curl, tests) carry no cookie
 * from a victim's browser, so they are allowed.
 */
export function checkOrigin(appBaseUrl) {
  const appHost = new URL(appBaseUrl).host;
  return (req, res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();
    const origin = req.get('origin');
    const ownHosts = [appHost, req.get('x-forwarded-host'), req.get('host')];
    const foreignOrigin = origin !== undefined && !ownHosts.includes(hostOf(origin));
    if (foreignOrigin || req.get('sec-fetch-site') === 'cross-site') {
      return next(forbidden('Заявката идва от друг сайт и беше отказана.'));
    }
    next();
  };
}

/** Fixed-window limit per client address, for sign-in and registration. In memory: one process. */
export function rateLimit({ windowMs, max }) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    if (hits.size > 10_000) for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);
    const entry = hits.get(req.ip);
    if (!entry || entry.resetAt <= now) {
      hits.set(req.ip, { count: 1, resetAt: now + windowMs });
      return next();
    }
    entry.count += 1;
    if (entry.count > max) {
      return next(new AppError(429, 'TOO_MANY_ATTEMPTS', 'Твърде много опити. Опитайте отново след няколко минути.'));
    }
    next();
  };
}

export function securityHeaders(isProduction) {
  return (req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'same-origin');
    res.set('X-Frame-Options', 'DENY');
    // The Vite dev server injects inline scripts for hot reload, so the policy is production-only.
    if (isProduction) {
      res.set(
        'Content-Security-Policy',
        "default-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
      );
    }
    next();
  };
}
