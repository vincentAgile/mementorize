import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  base32Decode,
  base32Encode,
  decrypt,
  encrypt,
  encryptionKey,
  hashRecoveryCode,
  newRecoveryCode,
  newTotpSecret,
  otpauthUri,
  timeStep,
  totpCode,
  verifyTotp,
} from './totp.js';

describe('TOTP (MEM-86)', () => {
  // RFC 6238, appendix B: the SHA-1 secret is "12345678901234567890".
  const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));

  it('gives the codes of the RFC 6238 test vectors', () => {
    expect(totpCode(RFC_SECRET, timeStep(new Date(59_000)), 8)).toBe('94287082');
    expect(totpCode(RFC_SECRET, timeStep(new Date(1_111_111_109_000)), 8)).toBe('07081804');
    expect(totpCode(RFC_SECRET, timeStep(new Date(1_234_567_890_000)), 8)).toBe('89005924');
    expect(totpCode(RFC_SECRET, timeStep(new Date(2_000_000_000_000)), 8)).toBe('69279037');
    expect(totpCode(RFC_SECRET, timeStep(new Date(59_000)))).toBe('287082'); // 6 digits
  });

  it('encodes and decodes base32', () => {
    const bytes = randomBytes(20);
    expect(base32Decode(base32Encode(bytes))).toEqual(bytes);
    expect(newTotpSecret()).toMatch(/^[A-Z2-7]{32}$/);
  });

  it('accepts the code of now, and of one step before or after; never an older step, never twice', () => {
    const secret = newTotpSecret();
    const now = new Date('2026-10-25T20:00:10Z');
    const step = timeStep(now);
    expect(verifyTotp(secret, totpCode(secret, step), now, null)).toBe(step);
    expect(verifyTotp(secret, totpCode(secret, step - 1), now, null)).toBe(step - 1);
    expect(verifyTotp(secret, totpCode(secret, step + 1), now, null)).toBe(step + 1);
    expect(verifyTotp(secret, totpCode(secret, step - 2), now, null)).toBeNull();
    expect(verifyTotp(secret, totpCode(secret, step + 2), now, null)).toBeNull();
    // Replay: the step used last time, or an earlier one, is refused.
    expect(verifyTotp(secret, totpCode(secret, step), now, step)).toBeNull();
    expect(verifyTotp(secret, totpCode(secret, step - 1), now, step)).toBeNull();
    expect(
      verifyTotp(secret, ` ${totpCode(secret, step).slice(0, 3)} ${totpCode(secret, step).slice(3)}`, now, null),
    ).toBe(step);
    expect(verifyTotp(secret, 'abcdef', now, null)).toBeNull();
    expect(verifyTotp(secret, '12345', now, null)).toBeNull();
  });

  it('builds the otpauth address read by the authenticator apps', () => {
    expect(otpauthUri('ABC', 'admin@example.fr')).toBe(
      'otpauth://totp/Mementorize%20Admin%3Aadmin%40example.fr?secret=ABC&issuer=Mementorize%20Admin&algorithm=SHA1&digits=6&period=30',
    );
  });

  it('makes recovery codes easy to copy, compared however they are typed', () => {
    const code = newRecoveryCode();
    expect(code).toMatch(/^[a-km-np-z2-9]{5}-[a-km-np-z2-9]{5}$/);
    expect(hashRecoveryCode(code.toUpperCase().replace('-', ' '))).toBe(hashRecoveryCode(code));
    expect(hashRecoveryCode(code)).not.toContain(code.replace('-', ''));
  });

  it('encrypts the secrets with the key, and refuses a wrong key or a changed text', () => {
    const key = encryptionKey('a'.repeat(64))!;
    const sealed = encrypt('JBSWY3DPEHPK3PXP', key);
    expect(sealed).not.toContain('JBSWY3DPEHPK3PXP');
    expect(encrypt('JBSWY3DPEHPK3PXP', key)).not.toBe(sealed); // a new IV each time
    expect(decrypt(sealed, key)).toBe('JBSWY3DPEHPK3PXP');
    expect(() => decrypt(sealed, encryptionKey('b'.repeat(64))!)).toThrow();
    expect(() => decrypt(`${sealed.slice(0, -2)}AA`, key)).toThrow();
    expect(encryptionKey('too-short')).toBeNull();
    expect(encryptionKey(undefined)).toBeNull();
  });
});
