/**
 * Classic credentials: PBKDF2-HMAC-SHA256 via WebCrypto (Workers-safe).
 * Stored shape: `pbkdf2$<iterations>$<base64 salt>$<base64 hash>`.
 */

// Workers WebCrypto caps PBKDF2 at 100k iterations (NotSupportedError above;
// local workerd does NOT enforce this, so never raise without a prod probe).
const ITERATIONS = 100_000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_LENGTH = 10;
const MAX_LENGTH = 128;

export type PasswordError = 'email' | 'weak';

export function normalizeEmail(email: unknown): string | null {
  if (typeof email !== 'string') return null;
  const clean = email.trim().toLowerCase();
  return EMAIL_RE.test(clean) ? clean : null;
}

/** Policy: 10..128 chars with a letter and a digit. */
export function validatePassword(password: unknown): PasswordError | null {
  if (typeof password !== 'string') return 'weak';
  if (password.length < MIN_LENGTH || password.length > MAX_LENGTH) return 'weak';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'weak';
  return null;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

export function base64ToBytes(raw: string): Uint8Array {
  const bin = atob(raw);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt.buffer as ArrayBuffer, iterations },
    key,
    HASH_BYTES * 8,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await pbkdf2(password, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${bytesToBase64(salt)}$${bytesToBase64(hash)}`;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function storedIterations(stored: string): number | null {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return null;
  const n = Number(parts[1]);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** True when a successful login should re-hash with current parameters. */
export const needsRehash = (stored: string): boolean =>
  storedIterations(stored) !== ITERATIONS;

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const iterations = storedIterations(stored);
  if (iterations !== ITERATIONS) {
    return false;
  }
  try {
    const salt = base64ToBytes(stored.split('$')[2]);
    const expected = base64ToBytes(stored.split('$')[3]);
    const actual = await pbkdf2(password, salt, iterations);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** Burns the same work as a real check so unknown emails take as long. */
export async function dummyVerify(): Promise<void> {
  await pbkdf2('dummy-password', new Uint8Array(SALT_BYTES), ITERATIONS);
}
