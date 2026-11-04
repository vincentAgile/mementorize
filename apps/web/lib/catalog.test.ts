import { describe, expect, it } from 'vitest';
import { API_MESSAGES, catalogErrors, LEVELS, levelLabel } from './catalog';

describe('catalogue (MEM-116)', () => {
  it('the six levels, A1 to C2, with their name', () => {
    expect(LEVELS.map((level) => level.label)).toEqual([
      'A1 · Débutant',
      'A2 · Élémentaire',
      'B1 · Intermédiaire',
      'B2 · Intermédiaire supérieur',
      'C1 · Autonome',
      'C2 · Maîtrise',
    ]);
    expect(levelLabel('B2')).toBe('B2 · Intermédiaire supérieur');
  });

  it('checks the form before sending it: title, level, description', () => {
    const ok = { title: 'Voyage', level: 'A2', description: '', published: false };
    expect(catalogErrors(ok)).toEqual({});
    expect(catalogErrors({ ...ok, title: '   ' })).toEqual({ title: 'Saisissez le titre de la liste.' });
    expect(catalogErrors({ ...ok, title: 'x'.repeat(201) }).title).toContain('200 caractères');
    expect(catalogErrors({ ...ok, level: '' })).toEqual({ level: 'Choisissez le niveau de la liste.' });
    expect(catalogErrors({ ...ok, level: 'D1' }).level).toBeDefined();
    expect(catalogErrors({ ...ok, description: 'y'.repeat(501) }).description).toContain('500 caractères');
  });

  it('puts the refusals of the API under their field', () => {
    expect(API_MESSAGES['Une liste de ce niveau porte déjà ce titre'].field).toBe('title');
    expect(API_MESSAGES['Une liste vide ne peut pas être publiée'].field).toBe('published');
  });
});
