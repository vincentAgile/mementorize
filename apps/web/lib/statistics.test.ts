import { describe, expect, it } from 'vitest';
import { inStatistics, STATISTICS_TABS } from './statistics';

describe('Mes statistiques (MEM-113)', () => {
  it('a tab per space with a learning process, each at its own address, Anglais first', () => {
    expect(STATISTICS_TABS).toEqual([
      { href: '/statistiques/anglais', label: 'Anglais' },
      { href: '/statistiques/citations', label: 'Citations' },
    ]);
  });

  it('the page and its tabs, nothing else', () => {
    expect(inStatistics('/statistiques')).toBe(true);
    expect(inStatistics('/statistiques/citations')).toBe(true);
    expect(inStatistics('/statistiques-bis')).toBe(false);
    expect(inStatistics('/reglages')).toBe(false);
  });
});
