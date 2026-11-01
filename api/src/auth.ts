import { Auth, skipCSRFCheck } from '@auth/core';
import type { AuthConfig } from '@auth/core';
import { D1Adapter } from '@auth/d1-adapter';

export interface AuthEnv {
  DB: D1Database;
  AUTH_SECRET: string;
  AUTH_URL: string;
  WEB_ORIGIN: string;
}

/** https in prod (Secure + SameSite=None cookies), http for local dev. */
export const isSecureAuth = (env: AuthEnv): boolean => env.AUTH_URL.startsWith('https://');

/** Session lifetime, shared by Auth.js config and classic login. */
export const SESSION_MAX_AGE = 30 * 24 * 3600;

/** WEB_ORIGIN holds a comma-separated allow-list (dev ports shift around). Unset fails closed to []. */
export const webOrigins = (env: AuthEnv): string[] =>
  (env.WEB_ORIGIN ?? '').split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

/** Cookie name Auth.js uses for the session token (secure variant on https). */
export const sessionCookieName = (env: AuthEnv): string =>
  isSecureAuth(env) ? '__Secure-authjs.session-token' : 'authjs.session-token';

/**
 * Session cookie identical to Auth.js's, so its signout/session read ours.
 * maxAge 0 clears it (same attributes so it overwrites the login one).
 */
export function buildSessionCookie(env: AuthEnv, token: string, maxAge: number = SESSION_MAX_AGE): string {
  const secure = isSecureAuth(env);
  return (
    `${sessionCookieName(env)}=${token}; Path=/; HttpOnly; ` +
    `SameSite=${secure ? 'None' : 'Lax'}${secure ? '; Secure' : ''}; Max-Age=${maxAge}`
  );
}

export function authConfig(env: AuthEnv): AuthConfig {
  const secure = isSecureAuth(env);
  // No OAuth providers: classic credentials own the users table, and API-key
  // providers (intervals.icu) never touch Auth.js. Auth.js stays for the
  // session/signout machinery over the same D1 sessions.
  const providers: AuthConfig['providers'] = [];
  return {
    secret: env.AUTH_SECRET,
    // Workers sets the real Host (incl. preview deployments); the OAuth
    // redirect_uri must still match the provider registration exactly.
    trustHost: true,
    basePath: '/api/auth',
    session: { strategy: 'database', maxAge: SESSION_MAX_AGE },
    useSecureCookies: secure,
    cookies: {
      sessionToken: { options: { sameSite: secure ? 'none' : 'lax', secure } },
    },
    // The SPA lives on another origin and POSTs signout cross-site; the stock
    // origin check would 403 it. Worst case of skipping: forced logout.
    skipCSRFCheck,
    adapter: D1Adapter(env.DB),
    providers,
    callbacks: {
      // After login, Auth.js only allows same-origin callbackUrl by default;
      // let the flow return to the web app origin from our own env.
      async redirect({ url, baseUrl }) {
        if (url.startsWith('/')) return `${baseUrl}${url}`;
        try {
          const allowed = webOrigins(env).map((o) => new URL(o).origin);
          if (allowed.includes(new URL(url).origin)) return url;
        } catch {
          /* fall through to baseUrl */
        }
        return baseUrl;
      },
    },
  };
}

/** Handles GET/POST /api/auth/* (signin, callback, signout, session, csrf). */
export function handleAuth(request: Request, env: AuthEnv): Promise<Response> {
  return Auth(request, authConfig(env));
}

export interface SessionUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
}

function getCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === name) {
      try {
        return decodeURIComponent(part.slice(idx + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * Session token from the cookie first, else `Authorization: Bearer`. iOS
 * (Safari and Chrome) blocks the cross-site cookie, so the SPA stores the
 * token from login/register and sends it back as a bearer instead.
 */
export function getSessionToken(request: Request, env: AuthEnv): string | null {
  const cookie = getCookie(request.headers.get('cookie'), sessionCookieName(env));
  if (cookie) return cookie;
  const auth = request.headers.get('authorization');
  if (!auth) return null;
  const match = /^Bearer ([A-Za-z0-9_-]{1,128})$/.exec(auth.trim());
  return match ? match[1] : null;
}

/** Deletes the session row for the request token (cookie or bearer). */
export async function deleteSession(request: Request, env: AuthEnv): Promise<void> {
  const token = getSessionToken(request, env);
  if (!token) return;
  await env.DB.prepare('DELETE FROM sessions WHERE sessionToken = ?').bind(token).run();
}

/**
 * Session for our own endpoints, straight from the D1 adapter (no Auth.js
 * request cycle needed): reads the session token, returns the user or null.
 */
export async function getSessionUser(
  request: Request,
  env: AuthEnv,
): Promise<SessionUser | null> {
  const token = getSessionToken(request, env);
  if (!token) return null;
  const adapter = D1Adapter(env.DB);
  if (!adapter.getSessionAndUser) return null;
  const result = await adapter.getSessionAndUser(token);
  if (!result) return null;
  // D1 returns TEXT for datetime columns; the type claims Date.
  const raw = result.session.expires as unknown;
  const expires = raw instanceof Date ? raw : new Date(raw as string);
  if (Number.isNaN(expires.getTime()) || expires < new Date()) return null;
  return {
    id: result.user.id,
    name: result.user.name ?? null,
    email: result.user.email ?? null,
    image: result.user.image ?? null,
  };
}
