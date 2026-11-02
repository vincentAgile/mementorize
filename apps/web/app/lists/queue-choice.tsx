import type { Noun } from '../../lib/nouns';

/**
 * MEM-62, on the "Ajouter" tab: what becomes of the new item, two radio
 * buttons: into the learning queue, last (by default), or « En attente ».
 * The form sends `queue=on` or `queue=off`, as the checkbox it replaces.
 * Give it a key that follows `queue`: the choice comes back as it was
 * after the form is reset.
 */
export function QueueChoice({ queue, noun, idPrefix }: { queue: boolean; noun: Noun; idPrefix: string }) {
  const item = noun.feminine ? `la ${noun.one}` : `l’${noun.one}`;
  return (
    <fieldset className="queue-choice" aria-labelledby={`${idPrefix}-queue-legend`}>
      <legend id={`${idPrefix}-queue-legend`} className="visually-hidden">
        Après l’ajout
      </legend>
      <label>
        <input type="radio" name="queue" value="on" defaultChecked={queue} />
        Ajouter à la liste des {noun.many} à apprendre
      </label>
      <label>
        <input type="radio" name="queue" value="off" defaultChecked={!queue} />
        Mettre {item} en attente
      </label>
    </fieldset>
  );
}
