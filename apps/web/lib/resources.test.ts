import { describe, expect, it } from 'vitest';
import { RESOURCES, siteOf } from './resources';

describe('Ressources', () => {
  it('lists the forgetting curve, then David Louapre, as https links', () => {
    expect(RESOURCES.map((resource) => resource.title)).toEqual([
      'La courbe de l’oubli',
      'Apprentissages (David Louapre)',
    ]);
    for (const { url } of RESOURCES) expect(new URL(url).protocol).toBe('https:');
  });

  it('shows the site of a link without « www. »', () => {
    expect(siteOf('https://www.mondelangues.fr/repetition-espacee-et-cartes-memoire')).toBe('mondelangues.fr');
    expect(siteOf(RESOURCES[1].url)).toBe('scienceetonnante.com');
  });
});
