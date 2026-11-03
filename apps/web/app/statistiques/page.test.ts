import { describe, expect, it, vi } from 'vitest';

const redirect = vi.fn(() => {
  throw new Error('NEXT_REDIRECT');
});
vi.mock('next/navigation', () => ({ redirect }));
const { default: StatisticsPage } = await import('./page');

describe('/statistiques (MEM-113)', () => {
  it('opens on its first tab, Anglais', () => {
    expect(() => StatisticsPage()).toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenCalledWith('/statistiques/anglais');
  });
});
