import { describe, expect, it } from 'vitest';
import { quoteFaces } from './quote-faces';

const DE_GAULLE = {
  text: 'La culture générale est la véritable école du commandement.',
  author: 'Général de Gaulle',
  source: 'Vers l’armée de métier',
  hint: 'Citation relative à l’importance de la culture générale',
};

describe('quoteFaces (MEM-108)', () => {
  it('asks with the recall hint alone, under a neutral heading, without prompt', () => {
    const { front } = quoteFaces(DE_GAULLE);
    expect(front).toMatchObject({ heading: 'Citation', main: DE_GAULLE.hint });
    expect(front.subheading).toBeUndefined();
    expect(front.prompt).toBeUndefined();
    expect(JSON.stringify({ ...front, reveals: undefined })).not.toMatch(/Gaulle|armée|culture générale est/);
  });

  it('offers the author with the source, and the first words, on request', () => {
    expect(quoteFaces(DE_GAULLE).front.reveals).toEqual([
      {
        key: 'author',
        label: 'Auteur',
        button: 'Afficher l’auteur',
        value: 'Général de Gaulle · Vers l’armée de métier',
      },
      { key: 'start', label: 'Début de la citation', button: 'Afficher le début', value: 'La culture générale…' },
    ]);
  });

  it('says « Auteur inconnu » without author, with nothing to show unless there is a source', () => {
    const [author] = quoteFaces({ ...DE_GAULLE, author: null, source: null }).front.reveals!;
    expect(author).toMatchObject({ value: null, missing: 'Auteur inconnu' });
    const [withSource] = quoteFaces({ ...DE_GAULLE, author: null }).front.reveals!;
    expect(withSource).toMatchObject({
      button: 'Afficher la source',
      value: 'Auteur inconnu · Vers l’armée de métier',
    });
  });

  it('shows the whole quote on the back, with its author and source, without the hint', () => {
    expect(quoteFaces(DE_GAULLE).back).toEqual({
      heading: 'Général de Gaulle',
      subheading: 'Vers l’armée de métier',
      main: DE_GAULLE.text,
    });
    expect(quoteFaces({ ...DE_GAULLE, author: null }).back.heading).toBe('Auteur inconnu');
  });
});
