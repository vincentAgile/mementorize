import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ITEM_NOUN, QUOTE_NOUN } from '../../lib/nouns';
import { QueueChoice } from './queue-choice';

const radios = (html: string) =>
  [...html.matchAll(/<input[^>]*type="radio"[^>]*>/g)].map((match) => ({
    value: match[0].match(/value="(\w+)"/)![1],
    checked: match[0].includes('checked'),
  }));

describe('QueueChoice (MEM-62)', () => {
  it('two radio buttons, « à apprendre » checked by default, sent as queue=on / queue=off', () => {
    const html = renderToStaticMarkup(<QueueChoice queue noun={ITEM_NOUN} idPrefix="t" />);
    expect(html).toContain('Ajouter à la liste des cartes à apprendre');
    expect(html).toContain('Mettre la carte en attente');
    expect(html.match(/name="queue"/g)).toHaveLength(2);
    expect(radios(html)).toEqual([
      { value: 'on', checked: true },
      { value: 'off', checked: false },
    ]);
  });

  it('keeps « en attente » when it was chosen; the quotes in the feminine', () => {
    const html = renderToStaticMarkup(<QueueChoice queue={false} noun={QUOTE_NOUN} idPrefix="t" />);
    expect(html).toContain('Ajouter à la liste des citations à apprendre');
    expect(html).toContain('Mettre la citation en attente');
    expect(radios(html)).toEqual([
      { value: 'on', checked: false },
      { value: 'off', checked: true },
    ]);
  });
});
