import { describe, expect, it } from 'vitest';
import { LoginLimiter } from './login-limiter.js';

describe('LoginLimiter (MEM-82)', () => {
  const MINUTE = 60_000;

  it('blocks an address after 5 failures in 15 minutes, until the oldest leaves the window', () => {
    const limiter = new LoginLimiter();
    for (let minute = 0; minute < 5; minute++) {
      expect(limiter.blocked('1.2.3.4', minute * MINUTE)).toBe(false);
      limiter.fail('1.2.3.4', minute * MINUTE);
    }
    expect(limiter.blocked('1.2.3.4', 5 * MINUTE)).toBe(true);
    expect(limiter.blocked('5.6.7.8', 5 * MINUTE)).toBe(false); // another address
    expect(limiter.blocked('1.2.3.4', 15 * MINUTE)).toBe(false); // the first failure is 15 minutes old
  });

  it('forgets the failures of an address after a successful login', () => {
    const limiter = new LoginLimiter();
    for (let i = 0; i < 4; i++) limiter.fail('1.2.3.4', 0);
    limiter.succeed('1.2.3.4');
    limiter.fail('1.2.3.4', 0);
    expect(limiter.blocked('1.2.3.4', 0)).toBe(false);
  });
});
