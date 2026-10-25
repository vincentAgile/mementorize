import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * MEM-86: the two-step login of the console, by TOTP (RFC 6238): 6 digits,
 * a new code every 30 seconds, HMAC-SHA1. What Google Authenticator,
 * Microsoft Authenticator, 1Password, Bitwarden… expect.
 */
export const TOTP_PERIOD_S = 30;
const DIGITS = 6;
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(text: string): Buffer {
  const clean = text.replace(/[\s=]/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index < 0) throw new Error('Invalid base32');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** A new secret: 160 bits, as the RFC recommends for HMAC-SHA1. */
export const newTotpSecret = () => base32Encode(randomBytes(20));

/** The time step of a moment: one every 30 seconds since 1970. */
export const timeStep = (now: Date) => Math.floor(now.getTime() / 1000 / TOTP_PERIOD_S);

/** The code of a time step (HOTP, RFC 4226). `digits`: 6, or 8 for the RFC's test vectors. */
export function totpCode(secret: string, step: number, digits = DIGITS): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = hmac.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** digits).padStart(digits, '0');
}

/**
 * The time step of a valid code, or null. One step before and after now is
 * accepted (a clock 30 s off), but never a step at or before `lastStep`:
 * a code already used is refused.
 */
export function verifyTotp(secret: string, code: string, now: Date, lastStep: number | null): number | null {
  const typed = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(typed)) return null;
  const current = timeStep(now);
  for (const step of [current - 1, current, current + 1]) {
    if (lastStep !== null && step <= lastStep) continue;
    if (timingSafeEqual(Buffer.from(totpCode(secret, step)), Buffer.from(typed))) return step;
  }
  return null;
}

/** The address an authenticator app reads from the QR code. */
export function otpauthUri(secret: string, email: string): string {
  const issuer = 'Mementorize Admin';
  const label = encodeURIComponent(`${issuer}:${email}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${TOTP_PERIOD_S}`;
}

// --- Recovery codes -----------------------------------------------------------

/** No 0/O, 1/I/L: a code copied by hand reads without doubt. */
const RECOVERY_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

/** « k7m2p-x9qzr »: 10 characters, about 50 bits. */
export function newRecoveryCode(): string {
  const bytes = randomBytes(10);
  const chars = [...bytes].map((byte) => RECOVERY_ALPHABET[byte % RECOVERY_ALPHABET.length]);
  return `${chars.slice(0, 5).join('')}-${chars.slice(5).join('')}`;
}

/** As typed: lower case, without spaces or dash. */
export const normalizeRecoveryCode = (code: string) => code.toLowerCase().replace(/[\s-]/g, '');

export const hashRecoveryCode = (code: string) =>
  createHash('sha256').update(normalizeRecoveryCode(code)).digest('hex');

// --- Encryption of the secrets (ADMIN_TOTP_ENCRYPTION_KEY) -----------------

/** The key: 32 bytes, written as 64 hexadecimal characters. Null if missing or malformed. */
export function encryptionKey(hex: string | undefined): Buffer | null {
  const value = hex?.trim() ?? '';
  return /^[0-9a-fA-F]{64}$/.test(value) ? Buffer.from(value, 'hex') : null;
}

/** AES-256-GCM: `v1.<iv>.<tag>.<ciphertext>`, in base64url. */
export function encrypt(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv, cipher.getAuthTag(), data]
    .map((part) => (typeof part === 'string' ? part : part.toString('base64url')))
    .join('.');
}

export function decrypt(sealed: string, key: Buffer): string {
  const [version, iv, tag, data] = sealed.split('.');
  if (version !== 'v1' || !iv || !tag || !data) throw new Error('Unknown encrypted format');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}
