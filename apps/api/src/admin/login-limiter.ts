/**
 * MEM-82: at most `max` failed logins per `windowMs` and per key (the
 * client's IP address): beyond, the logins of that key are refused without
 * checking the password, until the oldest failure leaves the window. In
 * memory: enough for one API (two, during a deployment).
 */
export class LoginLimiter {
  private readonly failures = new Map<string, number[]>();

  constructor(
    private readonly max = 5,
    private readonly windowMs = 15 * 60 * 1000,
  ) {}

  /** True when the key has used up its failures: no login, not even a right one. */
  blocked(key: string, now = Date.now()): boolean {
    return this.recent(key, now).length >= this.max;
  }

  fail(key: string, now = Date.now()): void {
    this.failures.set(key, [...this.recent(key, now), now]);
  }

  /** A successful login forgets the failures of the key. */
  succeed(key: string): void {
    this.failures.delete(key);
  }

  private recent(key: string, now: number): number[] {
    const recent = (this.failures.get(key) ?? []).filter((at) => now - at < this.windowMs);
    if (recent.length === 0) this.failures.delete(key);
    else this.failures.set(key, recent);
    return recent;
  }
}
