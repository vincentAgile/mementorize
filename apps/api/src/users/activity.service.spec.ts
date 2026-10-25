import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { ActivityService } from './activity.service.js';

describe('ActivityService (MEM-83)', () => {
  const prisma = { user: { updateMany: vi.fn() } };
  let activity: ActivityService;
  const T0 = new Date('2026-10-25T18:00:00Z');
  const minutes = (n: number) => new Date(T0.getTime() + n * 60_000);

  beforeEach(() => {
    prisma.user.updateMany.mockReset().mockResolvedValue({ count: 1 });
    activity = new ActivityService(prisma as unknown as PrismaService);
  });

  it('records the activity only when the last one is more than an hour old', async () => {
    await activity.touch('user-1', T0);

    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'user-1', OR: [{ lastActiveAt: null }, { lastActiveAt: { lt: minutes(-60) } }] },
      data: { lastActiveAt: T0 },
    });
  });

  it("doesn't go to the database again within the hour, for the same user", async () => {
    await activity.touch('user-1', T0);
    await activity.touch('user-1', minutes(30));
    await activity.touch('user-1', minutes(59));
    expect(prisma.user.updateMany).toHaveBeenCalledTimes(1);

    await activity.touch('user-2', minutes(59)); // another user
    await activity.touch('user-1', minutes(61)); // an hour later
    expect(prisma.user.updateMany).toHaveBeenCalledTimes(3);
    expect(prisma.user.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: { lastActiveAt: minutes(61) } }),
    );
  });

  it('never fails the request: a database error is logged, and retried at the next call', async () => {
    prisma.user.updateMany.mockRejectedValueOnce(new Error('database down'));

    await expect(activity.touch('user-1', T0)).resolves.toBeUndefined();
    await activity.touch('user-1', minutes(1));
    expect(prisma.user.updateMany).toHaveBeenCalledTimes(2);
  });
});
