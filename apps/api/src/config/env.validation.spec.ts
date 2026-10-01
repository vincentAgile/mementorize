import { describe, expect, it } from 'vitest';
import { validateEnv } from './env.validation.js';

const valid = { DATABASE_URL: 'postgresql://u:p@db:5432/x', JWT_SECRET: 'a-real-secret' };

describe('validateEnv', () => {
  it('accepts a complete configuration', () => {
    expect(validateEnv({ ...valid, JWT_EXPIRES_IN: '3600' })).toMatchObject(valid);
  });

  it('treats an empty JWT_SECRET as missing (docker compose passes "" when .env lacks it)', () => {
    expect(() => validateEnv({ ...valid, JWT_SECRET: '' })).toThrow(/JWT_SECRET is not set/);
  });

  it("refuses .env.example's placeholder secret in production only", () => {
    expect(() => validateEnv({ ...valid, JWT_SECRET: 'change-me', NODE_ENV: 'production' })).toThrow(/placeholder/);
    expect(() => validateEnv({ ...valid, JWT_SECRET: 'change-me' })).not.toThrow();
  });

  it('lists every problem at once', () => {
    expect(() => validateEnv({ JWT_EXPIRES_IN: 'soon' })).toThrow(/DATABASE_URL[\s\S]*JWT_SECRET[\s\S]*JWT_EXPIRES_IN/);
  });
});
