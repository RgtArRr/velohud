import { parseTemplateJson, type Template } from '@velohud/shared';

/**
 * Optional account, backed by the API (Auth.js, cookie session). Everything
 * degrades to null/false offline or logged-out: the app stays fully local.
 */
const API_URL =
  import.meta.env.VITE_API_URL ?? 'https://velohud-api.koga262.workers.dev';

export interface AccountUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
}

export type CredsError = 'email' | 'weak' | 'invalid' | 'net';

const KNOWN_CREDS_ERRORS: readonly string[] = ['email', 'weak', 'invalid'];

const API_TIMEOUT_MS = 15_000;
const RETRY_DELAY_MS = 800;

/**
 * Session token from login/register, first-party localStorage. iOS blocks
 * the cross-site session cookie, so the token rides back as a bearer header
 * instead (the cookie stays primary where the browser accepts it).
 */
const TOKEN_KEY = 'velohud.session';
const loadSessionToken = (): string | null => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};
const saveSessionToken = (token: string): void => {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* private mode: cookie-only session */
  }
};
const clearSessionToken = (): void => {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* noop */
  }
};

/** Credentialed fetch with a timeout; idempotent GETs may retry once on 502/429/timeout. */
async function apiFetch(
  path: string,
  init?: RequestInit,
  retries = 0,
  timeoutMs = API_TIMEOUT_MS,
): Promise<Response> {
  const attempt = (): Promise<Response> => {
    const headers = new Headers(init?.headers);
    const token = loadSessionToken();
    if (token && !headers.has('authorization')) headers.set('authorization', `Bearer ${token}`);
    return fetch(`${API_URL}${path}`, {
      ...init,
      headers,
      credentials: 'include',
      signal: AbortSignal.timeout(timeoutMs),
    });
  };
  try {
    const res = await attempt();
    if (retries > 0 && (res.status === 502 || res.status === 429)) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      return attempt();
    }
    return res;
  } catch (err) {
    if (retries > 0) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      return attempt();
    }
    throw err;
  }
}

const readErrorBody = async (res: Response): Promise<string | null> => {
  try {
    const data = (await res.json()) as { error?: unknown } | null;
    return typeof data?.error === 'string' ? data.error : null;
  } catch {
    return null;
  }
};

async function creds(
  path: '/api/login' | '/api/register',
  email: string,
  password: string,
): Promise<{ user: AccountUser } | { error: CredsError }> {
  try {
    const res = await apiFetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    // Error bodies matter here (email|weak|invalid): parse any status.
    let data: unknown = null;
    try {
      data = (await res.json()) as unknown;
    } catch {
      /* non-JSON: treated as net failure below */
    }
    if (res.ok && typeof data === 'object' && data !== null && 'user' in data) {
      const token = (data as { token?: unknown }).token;
      if (typeof token === 'string' && token) saveSessionToken(token);
      return { user: (data as { user: AccountUser }).user };
    }
    const err = (data as { error?: unknown } | null)?.error;
    if (typeof err === 'string' && KNOWN_CREDS_ERRORS.includes(err)) {
      return { error: err as CredsError };
    }
    return { error: 'net' };
  } catch {
    return { error: 'net' };
  }
}

/** Classic login with email + password. */
export const login = (email: string, password: string): Promise<{ user: AccountUser } | { error: CredsError }> =>
  creds('/api/login', email, password);

/** Classic registration (also logs in on success; existing email + right password logs in). */
export const register = (email: string, password: string): Promise<{ user: AccountUser } | { error: CredsError }> =>
  creds('/api/register', email, password);

/** Current session user, or null when logged out or unreachable. */
export async function fetchSession(): Promise<AccountUser | null> {
  try {
    const res = await apiFetch('/api/me', undefined, 1);
    if (res.status === 401) clearSessionToken();
    if (!res.ok) return null;
    const data: unknown = await res.json();
    if (typeof data !== 'object' || data === null) return null;
    const user = (data as { user?: unknown }).user;
    if (typeof user !== 'object' || user === null) return null;
    return user as AccountUser;
  } catch {
    return null;
  }
}

/** Ends the API session (cookie and/or bearer) and forgets the local token. */
export async function logout(): Promise<boolean> {
  clearSessionToken();
  try {
    const res = await apiFetch('/api/logout', { method: 'POST' });
    return res.ok;
  } catch {
    return false;
  }
}

export interface CloudTemplate {
  id: string;
  name: string;
  definition: Template;
  updatedAt: string;
}

const okJson = async (res: Response): Promise<unknown | null> => {
  if (!res.ok) return null;
  try {
    return (await res.json()) as unknown;
  } catch {
    return null;
  }
};

const isCloudTemplate = (value: unknown): value is CloudTemplate => {
  if (typeof value !== 'object' || value === null) return false;
  const rec = value as Record<string, unknown>;
  return (
    typeof rec['id'] === 'string' &&
    typeof rec['name'] === 'string' &&
    typeof rec['definition'] === 'object' &&
    rec['definition'] !== null &&
    typeof rec['updatedAt'] === 'string'
  );
};

/** Account templates, newest first; null when logged out or unreachable. */
export async function listCloudTemplates(): Promise<CloudTemplate[] | null> {
  try {
    const res = await apiFetch('/api/my/templates', undefined, 1);
    const data = await okJson(res);
    const list = (data as { templates?: unknown } | null)?.templates;
    return Array.isArray(list) ? list.filter(isCloudTemplate) : null;
  } catch {
    return null;
  }
}

export interface IntervalsActivity {
  id: string;
  name: string;
  type: string;
  start_date_local: string;
  timezone: string | null;
  elapsed_time: number;
  distance: number;
}

export type IntervalsFailure = 'reconnect' | 'intervals' | 'login';

export type IntervalsStatus = 'connected' | 'disconnected' | 'login' | 'net';

/** Whether the account has an intervals.icu key, the session state, or a network failure. */
export async function intervalsStatus(): Promise<IntervalsStatus> {
  try {
    const res = await apiFetch('/api/intervals/status', undefined, 1);
    if (res.status === 401) return 'login';
    if (!res.ok) return 'net';
    const data = await okJson(res);
    const connected = (data as { connected?: unknown } | null)?.connected;
    if (typeof connected !== 'boolean') return 'net';
    return connected ? 'connected' : 'disconnected';
  } catch {
    return 'net';
  }
}

/** Stores the intervals.icu API key (server validates it first). */
export async function saveIntervalsKey(apiKey: string): Promise<boolean> {
  try {
    const res = await apiFetch('/api/intervals/key', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function deleteIntervalsKey(): Promise<boolean> {
  try {
    const res = await apiFetch('/api/intervals/key', { method: 'DELETE' });
    return res.ok;
  } catch {
    return false;
  }
}

const isIntervalsActivity = (value: unknown): value is IntervalsActivity => {
  if (typeof value !== 'object' || value === null) return false;
  const rec = value as Record<string, unknown>;
  return typeof rec['id'] === 'string' && typeof rec['start_date_local'] === 'string';
};

/** Newest-first activities page (30-day windows), or why it failed. */
export async function listIntervalsActivities(
  page: number,
): Promise<{ activities: IntervalsActivity[] } | { error: IntervalsFailure }> {
  try {
    const res = await apiFetch(`/api/intervals/activities?page=${page}`, undefined, 1);
    // The server distinguishes an expired login (unauthorized) from a dead ICU key.
    if (res.status === 401) {
      return { error: (await readErrorBody(res)) === 'unauthorized' ? 'login' : 'reconnect' };
    }
    const data = await okJson(res);
    const list = (data as { activities?: unknown } | null)?.activities;
    if (!Array.isArray(list)) return { error: 'intervals' };
    return { activities: list.filter(isIntervalsActivity) };
  } catch {
    return { error: 'intervals' };
  }
}

/** Per-second streams (type -> data) for one activity, or why it failed. */
export async function getIntervalsStreams(
  id: string,
): Promise<{ streams: Record<string, unknown> } | { error: IntervalsFailure }> {
  try {
    const res = await apiFetch(
      `/api/intervals/activities/${encodeURIComponent(id)}/streams`,
      undefined,
      1,
    );
    if (res.status === 401) {
      return { error: (await readErrorBody(res)) === 'unauthorized' ? 'login' : 'reconnect' };
    }
    const data = await okJson(res);
    const streams = (data as { streams?: unknown } | null)?.streams;
    if (typeof streams !== 'object' || streams === null) return { error: 'intervals' };
    return { streams: streams as Record<string, unknown> };
  } catch {
    return { error: 'intervals' };
  }
}

/**
 * Creates or replaces the account template with this id (server upserts).
 * Returns the stored id, or null on failure.
 */
export async function saveCloudTemplate(
  id: string,
  name: string,
  definition: Template,
): Promise<string | null> {
  try {
    const res = await apiFetch('/api/my/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name, definition }),
    });
    if (!res.ok) return null;
    const data = await okJson(res);
    const savedId = (data as { id?: unknown } | null)?.id;
    return typeof savedId === 'string' && savedId ? savedId : id;
  } catch {
    return null;
  }
}

export type AiFailure = 'login' | 'invalid' | 'net';

/** Data-availability hint: metric ids with data, plus GPS presence. Names only, no values. */
export interface AiDataAvailability {
  metrics: string[];
  hasGps: boolean;
}

/** Generate a template from a prompt; the model may also name it. No retries. */
export async function generateAiTemplate(
  prompt: string,
  aspect: string,
  available?: AiDataAvailability,
): Promise<Template | AiFailure> {
  try {
    const res = await apiFetch(
      '/api/ai/template',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, aspect, available }),
      },
      0,
      150_000,
    );
    if (res.status === 401) return 'login';
    const data = await okJson(res);
    const tpl = (data as { template?: unknown } | null)?.template;
    if (!tpl) return 'invalid';
    try {
      return parseTemplateJson(JSON.stringify(tpl));
    } catch {
      return 'invalid';
    }
  } catch {
    return 'net';
  }
}

/** Adjust an existing template from an instruction. No retries. */
export async function adjustAiTemplate(
  template: Template,
  instruction: string,
  aspect: string,
  available?: AiDataAvailability,
): Promise<Template | AiFailure> {
  try {
    const res = await apiFetch(
      '/api/ai/adjust',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template, instruction, aspect, available }),
      },
      0,
      150_000,
    );
    if (res.status === 401) return 'login';
    const data = await okJson(res);
    const tpl = (data as { template?: unknown } | null)?.template;
    if (!tpl) return 'invalid';
    try {
      return parseTemplateJson(JSON.stringify(tpl));
    } catch {
      return 'invalid';
    }
  } catch {
    return 'net';
  }
}

/** Automatic template from a video frame (black/white, no prompt). No retries. */
export async function autoAiTemplate(
  image: string,
  aspect: string,
  available?: AiDataAvailability,
): Promise<Template | AiFailure> {
  try {
    const res = await apiFetch(
      '/api/ai/auto',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image, aspect, available }),
      },
      0,
      150_000,
    );
    if (res.status === 401) return 'login';
    const data = await okJson(res);
    const tpl = (data as { template?: unknown } | null)?.template;
    if (!tpl) return 'invalid';
    try {
      return parseTemplateJson(JSON.stringify(tpl));
    } catch {
      return 'invalid';
    }
  } catch {
    return 'net';
  }
}

/** Deletes one account template by id. */
export async function deleteCloudTemplate(id: string): Promise<boolean> {
  try {
    const res = await apiFetch(`/api/my/templates/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    return res.ok;
  } catch {
    return false;
  }
}
