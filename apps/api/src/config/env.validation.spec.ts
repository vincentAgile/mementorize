import { describe, expect, it } from 'vitest';
import { validateEnv } from './env.validation.js';

const valid = { DATABASE_URL: 'postgresql://u:p@db:5432/x', JWT_SECRET: 'a-real-secret' };

describe('validateEnv', () => {
  it('accepts a complete configuration', () => {
    expect(validateEnv({ ...valid, ACCESS_TOKEN_TTL: '900', REFRESH_TOKEN_TTL: '2592000' })).toMatchObject(valid);
  });

  it('treats an empty JWT_SECRET as missing (docker compose passes "" when .env lacks it)', () => {
    expect(() => validateEnv({ ...valid, JWT_SECRET: '' })).toThrow(/JWT_SECRET is not set/);
  });

  it("refuses .env.example's placeholder secret in production only", () => {
    expect(() => validateEnv({ ...valid, JWT_SECRET: 'change-me', NODE_ENV: 'production' })).toThrow(/placeholder/);
    expect(() => validateEnv({ ...valid, JWT_SECRET: 'change-me' })).not.toThrow();
  });

  it('needs no e-mail settings, but checks them once SMTP_HOST is set', () => {
    expect(() => validateEnv(valid)).not.toThrow();
    expect(() => validateEnv({ ...valid, SMTP_HOST: 'smtp.example.fr' })).toThrow(/MAIL_FROM[\s\S]*APP_URL/);
    expect(() =>
      validateEnv({
        ...valid,
        SMTP_HOST: 'smtp.example.fr',
        SMTP_USER: 'me@example.fr',
        APP_URL: 'https://app.example.fr',
      }),
    ).not.toThrow();
    expect(() =>
      validateEnv({ ...valid, SMTP_HOST: 'h', SMTP_USER: 'u', APP_URL: 'https://a.fr', SMTP_PORT: 'tls' }),
    ).toThrow(/SMTP_PORT/);
  });

  it('needs no Kokoro, but checks its address once KOKORO_URL is set (MEM-39)', () => {
    expect(() => validateEnv({ ...valid, KOKORO_URL: '' })).not.toThrow();
    expect(() => validateEnv({ ...valid, KOKORO_URL: 'http://kokoro:8880' })).not.toThrow();
    expect(() => validateEnv({ ...valid, KOKORO_URL: 'kokoro:8880' })).toThrow(/KOKORO_URL/);
  });

  it('lists every problem at once', () => {
    expect(() => validateEnv({ ACCESS_TOKEN_TTL: 'soon' })).toThrow(
      /DATABASE_URL[\s\S]*JWT_SECRET[\s\S]*ACCESS_TOKEN_TTL/,
    );
  });

  it("accepts no administration console, but not one with the users' secret (MEM-82)", () => {
    expect(validateEnv(valid)).toMatchObject(valid);
    expect(validateEnv({ ...valid, ADMIN_JWT_SECRET: 'another-secret', ADMIN_SESSION_TTL: '7200' })).toBeTruthy();
    expect(() => validateEnv({ ...valid, ADMIN_JWT_SECRET: valid.JWT_SECRET })).toThrow(/must differ/);
    expect(() => validateEnv({ ...valid, ADMIN_SESSION_TTL: '0' })).toThrow(/ADMIN_SESSION_TTL/);
    expect(validateEnv({ ...valid, ADMIN_TOTP_ENCRYPTION_KEY: 'ab'.repeat(32) })).toBeTruthy(); // MEM-86
    expect(() => validateEnv({ ...valid, ADMIN_TOTP_ENCRYPTION_KEY: 'short' })).toThrow(/64 hexadecimal/);
  });
});
