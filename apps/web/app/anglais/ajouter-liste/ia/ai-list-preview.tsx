'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { DAILY_LIMIT, duplicateKey, fewerText, type RowField } from '../../../../lib/ai-lists';
import { agree, countOf, ITEM_NOUN } from '../../../../lib/nouns';
import { QueueChoice } from '../../../lists/queue-choice';
import type { AddAiListResult } from './actions';
import { EditableCell } from './editable-cell';

/** A card proposed, as the user leaves it. */
export interface PreviewRow {
  id: number;
  english: string;
  french: string;
  example: string;
  frenchExample: string;
  checked: boolean;
  /** Corrected by the user: « modifié ». */
  edited: boolean;
}

export type Phase =
  /** The cards were added: nothing more to say about the generation. */
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'done'; proposed: number; skipped: number }
  | { kind: 'cancelled' }
  | { kind: 'failed'; message: string };

/**
 * MEM-141: the cards proposed by the AI, as the content of a predefined list
 * (MEM-118): a table Anglais · Français · Exemple, a box per row (all
 * checked), « Tout cocher », « Ajouter N cartes » and the choice of the
 * learning queue. The rows come one by one (« 6 / 10 », « Annuler »). A
 * click on the English or the French corrects it; the examples are in a
 * fold of each row. A row corrected into a word of « Ma liste » is off,
 * « Déjà dans ta liste ». « Retirer » takes a row away.
 */
export function AiListPreview({
  summary,
  count,
  rows,
  owned,
  phase,
  remaining,
  queue,
  onQueue,
  onRows,
  onCancel,
  onRegenerate,
  onEditSettings,
  onAdd,
  adding,
  result,
  learnHref,
  onMore,
}: {
  /** « B1 · Voyage et transports · 10 cartes ». */
  summary: string;
  count: number;
  rows: PreviewRow[];
  owned: Set<string>;
  phase: Phase;
  remaining: number;
  queue: boolean;
  onQueue: (queue: boolean) => void;
  onRows: (update: (rows: PreviewRow[]) => PreviewRow[]) => void;
  onCancel: () => void;
  onRegenerate: () => void;
  onEditSettings: () => void;
  onAdd: () => void;
  adding: boolean;
  result: AddAiListResult | null;
  learnHref: string;
  onMore: () => void;
}) {
  const all = useRef<HTMLInputElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const running = phase.kind === 'running';
  const isOwned = (row: PreviewRow) => owned.has(duplicateKey(row.english));
  const available = rows.filter((row) => !isOwned(row));
  const selected = available.filter((row) => row.checked);
  const allChecked = available.length > 0 && selected.length === available.length;

  useEffect(() => {
    if (all.current) all.current.indeterminate = selected.length > 0 && !allChecked;
  }, [selected.length, allChecked]);
  useEffect(() => title.current?.focus(), []);

  const update = (id: number, patch: Partial<PreviewRow>) =>
    onRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  const edit = (row: PreviewRow, field: RowField, value: string) => {
    const next = { ...row, [field]: value, edited: true };
    // Corrected into a word of « Ma liste »: unchecked, off.
    update(row.id, { [field]: value, edited: true, ...(isOwned(next) && { checked: false }) });
  };

  const added = result && 'added' in result ? result : null;

  return (
    <section className="ai-list ai-preview catalog-content" aria-labelledby="ai-preview-title">
      <header className="ai-preview__header">
        <h2 id="ai-preview-title" ref={title} tabIndex={-1} className="add-list__title">
          {summary}
        </h2>
        {!running && (
          <p className="ai-preview__links">
            <button type="button" className="link-button" onClick={onEditSettings}>
              Modifier les réglages
            </button>
            {!added && (
              <button
                type="button"
                className="link-button"
                onClick={onRegenerate}
                disabled={remaining <= 0}
                aria-describedby={remaining <= 0 ? 'ai-preview-limit' : undefined}
              >
                Regénérer tout
              </button>
            )}
          </p>
        )}
        {!running && !added && remaining <= 0 && (
          <p id="ai-preview-limit" className="ai-preview__limit">
            {DAILY_LIMIT}
          </p>
        )}
      </header>

      {added && <AddedAiMessage {...added} learnHref={learnHref} onMore={onMore} />}
      {result && 'error' in result && (
        <p className="form-error" role="alert">
          {result.error}
        </p>
      )}

      {running && (
        <p className="ai-preview__progress">
          <span className="ai-preview__spinner" aria-hidden="true" />
          <span>
            Génération en cours… <span className="ai-preview__counter">{`${rows.length} / ${count}`}</span>
          </span>
          <button type="button" className="button--secondary" onClick={onCancel}>
            Annuler
          </button>
        </p>
      )}
      <PhaseMessage phase={phase} count={count} empty={rows.length === 0} onEditSettings={onEditSettings} />

      {rows.length > 0 && (
        <>
          <p className="ai-preview__warning">L’IA peut se tromper : relis les traductions avant d’ajouter.</p>
          <table className="catalog-content__table ai-preview__table">
            <caption className="visually-hidden">Cartes proposées par l’IA : {summary}</caption>
            <thead>
              <tr>
                <th scope="col" className="catalog-content__check">
                  <input
                    ref={all}
                    type="checkbox"
                    aria-label={allChecked ? 'Tout décocher' : 'Tout cocher'}
                    checked={allChecked}
                    disabled={available.length === 0}
                    onChange={(event) =>
                      onRows((current) =>
                        current.map((row) => (isOwned(row) ? row : { ...row, checked: event.target.checked })),
                      )
                    }
                  />
                </th>
                <th scope="col">Anglais</th>
                <th scope="col">Français</th>
                <th scope="col">Exemple</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const owns = isOwned(row);
                const name = row.english;
                return (
                  <tr key={row.id} className={owns ? 'is-owned' : undefined}>
                    <td className="catalog-content__check">
                      <input
                        type="checkbox"
                        aria-label={name}
                        checked={!owns && row.checked}
                        disabled={owns}
                        onChange={(event) => update(row.id, { checked: event.target.checked })}
                        aria-describedby={owns ? `ai-row-${row.id}-owned` : undefined}
                      />
                    </td>
                    <td className="ai-preview__english">
                      <EditableCell
                        value={row.english}
                        field="english"
                        lang="en"
                        label={`Anglais de « ${name} »`}
                        onCommit={(value) => edit(row, 'english', value)}
                      />
                      {row.edited && <span className="ai-preview__edited">modifié</span>}
                      {owns && (
                        <span id={`ai-row-${row.id}-owned`} className="catalog-content__owned">
                          Déjà dans ta liste
                        </span>
                      )}
                    </td>
                    <td className="ai-preview__french">
                      <EditableCell
                        value={row.french}
                        field="french"
                        lang="fr"
                        label={`Français de « ${name} »`}
                        onCommit={(value) => edit(row, 'french', value)}
                      />
                    </td>
                    <td className="ai-preview__example">
                      <details>
                        <summary>{row.example || row.frenchExample ? 'Exemples' : 'Ajouter un exemple'}</summary>
                        <EditableCell
                          value={row.example}
                          field="example"
                          lang="en"
                          multiline
                          empty="Exemple en anglais"
                          label={`Exemple en anglais de « ${name} »`}
                          onCommit={(value) => edit(row, 'example', value)}
                        />
                        <EditableCell
                          value={row.frenchExample}
                          field="frenchExample"
                          lang="fr"
                          multiline
                          empty="Exemple en français"
                          label={`Exemple en français de « ${name} »`}
                          onCommit={(value) => edit(row, 'frenchExample', value)}
                        />
                      </details>
                    </td>
                    <td className="ai-preview__remove">
                      <button
                        type="button"
                        className="link-button"
                        aria-label={`Retirer « ${name} »`}
                        onClick={() => onRows((current) => current.filter((other) => other.id !== row.id))}
                      >
                        Retirer
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* On a computer, the button and the choice stay at the bottom of the screen; on a phone, the button only. */}
          <div className="catalog-content__actions">
            <div className="catalog-content__bar">
              <button type="button" disabled={selected.length === 0 || adding || running} onClick={onAdd}>
                {adding ? 'Ajout…' : `Ajouter ${countOf(selected.length, ITEM_NOUN)}`}
              </button>
            </div>
            <div
              onChange={(event) => {
                const target = event.target as HTMLInputElement;
                if (target.name === 'queue') onQueue(target.value === 'on');
              }}
            >
              <QueueChoice queue={queue} noun={ITEM_NOUN} idPrefix="ai-preview" many />
            </div>
          </div>
          <p className="visually-hidden" aria-live="polite">
            {running ? '' : `${countOf(selected.length, ITEM_NOUN)} ${agree('coché', ITEM_NOUN, selected.length)}`}
          </p>
        </>
      )}
    </section>
  );
}

/** How the generation ended, when the user has to know: fewer cards, none, cancelled, failed. */
function PhaseMessage({
  phase,
  count,
  empty,
  onEditSettings,
}: {
  phase: Phase;
  count: number;
  empty: boolean;
  onEditSettings: () => void;
}) {
  if (phase.kind === 'done' && phase.proposed === 0) {
    return (
      <p className="notice" role="status">
        L’IA n’a rien proposé de nouveau pour ce thème.{' '}
        <button type="button" className="link-button" onClick={onEditSettings}>
          Modifier les réglages
        </button>
      </p>
    );
  }
  if (phase.kind === 'done' && phase.proposed < count) {
    return (
      <p className="notice" role="status">
        {fewerText(phase.proposed, phase.skipped)}
      </p>
    );
  }
  if (phase.kind === 'done') {
    return (
      <p className="visually-hidden" role="status">
        {`${phase.proposed} cartes proposées.`}
      </p>
    );
  }
  if (phase.kind === 'cancelled') {
    return (
      <p className="notice" role="status">
        {empty ? 'Génération annulée : aucune carte reçue.' : 'Génération annulée : les cartes reçues sont gardées.'}
      </p>
    );
  }
  if (phase.kind === 'failed') {
    return (
      <p className="form-error" role="alert">
        {phase.message}
      </p>
    );
  }
  return null;
}

/**
 * « 8 cartes ajoutées, 2 déjà présentes ignorées. », with where to go next:
 * « Ma liste » (on the cards « En attente » when they didn't join the queue),
 * the learning (as the tab « Apprendre · Réviser »), or more cards.
 */
function AddedAiMessage({
  added,
  skipped,
  queue,
  learnHref,
  onMore,
}: {
  added: number;
  skipped: number;
  queue: boolean;
  learnHref: string;
  onMore: () => void;
}) {
  return (
    <p className="notice catalog-added" role="status">
      <strong>
        {added > 0 ? `${countOf(added, ITEM_NOUN)} ${agree('ajouté', ITEM_NOUN, added)}` : 'Aucune carte ajoutée'}
      </strong>
      {added > 0 && !queue && ', en attente'}
      {skipped > 0 &&
        `, ${skipped} déjà ${agree('présent', ITEM_NOUN, skipped)} ${agree('ignoré', ITEM_NOUN, skipped)}`}
      .{' '}
      <span className="catalog-added__links">
        <Link href={queue ? '/anglais/liste' : '/anglais/liste?etat=Waiting'}>Voir dans ma liste</Link>
        <Link href={learnHref}>Apprendre</Link>
        <button type="button" className="link-button" onClick={onMore}>
          Générer d’autres cartes
        </button>
      </span>
    </p>
  );
}
