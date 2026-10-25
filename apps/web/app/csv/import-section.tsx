'use client';

import Link from 'next/link';
import { type ReactNode, useEffect, useId, useRef, useState, useTransition } from 'react';
import { MAX_FILE_BYTES, SEPARATOR_NAMES } from '../../lib/csv-separator';
import { NBSP } from '../../lib/format';
import { agree, countOf, ITEM_NOUN, type Noun, QUOTE_NOUN } from '../../lib/nouns';
import type { CsvSeparator, ImportAnalysis, ImportRow, ListType, QuoteImportRow } from '../../lib/types';
import {
  type ImportActionResult,
  importAction,
  type PreviewResult,
  previewImportAction,
  switchSeparatorAction,
} from './actions';

type AnyRow = ImportRow | QuoteImportRow;
type StatusFilter = 'all' | AnyRow['status'];

const STATUS_LABELS: Record<AnyRow['status'], string> = { new: 'À importer', duplicate: 'Doublon', error: 'Erreur' };
const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Toutes les lignes' },
  { value: 'new', label: 'À importer' },
  { value: 'duplicate', label: 'Doublons' },
  { value: 'error', label: 'Erreurs' },
];

const plural = (count: number, one: string, many = `${one}s`) => `${count}${NBSP}${count > 1 ? many : one}`;

/** What differs from one space to the other: the columns of the file, of the grid, the wording, the links. */
interface ImportKind<Row extends AnyRow> {
  noun: Noun;
  /** The format of the file, said above the drop zone. */
  format: ReactNode;
  /** The columns of the grid, after « Ligne » and before « Statut ». */
  headers: string[];
  cells: (row: Row) => ReactNode[];
  /** The class of the cells of each column. */
  cellClasses: (string | undefined)[];
  /** Why a duplicate line won't be imported. */
  duplicate: (row: Extract<Row, { status: 'duplicate' }>) => string;
  space: string;
}

const VOCABULARY: ImportKind<ImportRow> = {
  noun: ITEM_NOUN,
  format: (
    <>
      Un fichier CSV au format de l’export : expression française, expression anglaise, puis, facultatives, la
      thématique et les phrases d’exemple en français et en anglais.
    </>
  ),
  headers: ['Français', 'Anglais', 'Thématique'],
  cells: (row) => [
    <>
      {row.french}
      {row.frenchExample && (
        <span lang="fr" className="item-list__example">
          {row.frenchExample}
        </span>
      )}
    </>,
    <>
      <span lang="en">{row.english}</span>
      {row.example && (
        <span lang="en" className="item-list__example">
          {row.example}
        </span>
      )}
    </>,
    row.topic,
  ],
  cellClasses: [undefined, undefined, 'item-list__topic'],
  duplicate: (row) => {
    const languages =
      row.languages.length === 2 ? 'anglais et français' : row.languages[0] === 'en' ? 'anglais' : 'français';
    const of =
      'existing' in row.of
        ? `déjà dans le vocabulaire : «\u00a0${row.of.existing}\u00a0»`
        : `comme la ligne ${row.of.line}`;
    return `${languages}, ${of}`;
  },
  space: '/anglais',
};

const QUOTES: ImportKind<QuoteImportRow> = {
  noun: QUOTE_NOUN,
  format: (
    <>Un fichier CSV au format de l’export : le texte de la citation, puis, facultatifs, son auteur et sa source.</>
  ),
  headers: ['Texte', 'Auteur', 'Source'],
  cells: (row) => [row.text, row.author, row.source],
  cellClasses: ['import-preview__text', 'item-list__author', 'item-list__source'],
  duplicate: (row) =>
    'existing' in row.of
      ? `déjà dans les citations : «\u00a0${row.of.existing}\u00a0»`
      : `même texte que la ligne ${row.of.line}`,
  space: '/citations',
};

const KINDS: Record<ListType, ImportKind<AnyRow>> = {
  Vocabulary: VOCABULARY as unknown as ImportKind<AnyRow>,
  Quote: QUOTES as unknown as ImportKind<AnyRow>,
};

/**
 * The "Importer" section of the Import / export tab, in the Anglais space
 * (MEM-53, MEM-54) and the Citations space (MEM-72): a CSV file, chosen or
 * dropped, is read on the server and shown as a grid, each line with its
 * status (to import, duplicate, error). Nothing is saved until the import
 * is confirmed; the items imported are "En attente".
 */
export function ImportSection({ type, separator }: { type: ListType; separator: CsvSeparator }) {
  const kind = KINDS[type];
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [dragging, setDragging] = useState(false);
  const [done, setDone] = useState<ImportActionResult | null>(null); // MEM-54
  const [pending, startTransition] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const other: CsvSeparator = separator === 'Semicolon' ? 'Comma' : 'Semicolon';

  function analyze(chosen: File, action = previewImportAction.bind(null, type)) {
    setFile(chosen);
    setFilter('all');
    if (chosen.size > MAX_FILE_BYTES) {
      setResult({ error: 'Ce fichier dépasse 1 Mo : découpe-le en plusieurs fichiers.' });
      return;
    }
    const data = new FormData();
    data.set('file', chosen);
    startTransition(async () => setResult(await action(data)));
  }

  // "Choisir un autre fichier": back to the file field, ready for another one.
  const [resetCount, setResetCount] = useState(0);
  useEffect(() => {
    if (resetCount > 0) input.current?.focus();
  }, [resetCount]);

  function reset() {
    setFile(null);
    setResult(null);
    setDone(null);
    setResetCount((n) => n + 1);
  }

  /** MEM-54, after the confirmation: the file is sent again, and imported. */
  function confirmImport() {
    if (!file) return;
    const data = new FormData();
    data.set('file', file);
    startTransition(async () => {
      const outcome = await importAction(type, data);
      setDone(outcome);
      if ('result' in outcome && outcome.result.ok) {
        setResult(null);
        setFile(null);
      }
    });
  }

  return (
    <section className="import-export__section" aria-labelledby="import-title">
      <h2 id="import-title">Importer</h2>
      <p>
        {kind.format} Séparateur : {SEPARATOR_NAMES[separator]}. La première ligne, celle des en-têtes, est ignorée. Les{' '}
        {kind.noun.many} {agree('importé', kind.noun, 2)} seront « En attente » : vous les ajouterez à la file
        d’apprentissage depuis la Liste.
      </p>

      {done && 'result' in done && done.result.ok && <Imported kind={kind} result={done.result} onAgain={reset} />}
      {done && !('result' in done && done.result.ok) && (
        <p className="form-error" role="alert">
          {'error' in done
            ? done.error
            : 'L’import a échoué : le fichier n’a pas pu être relu. Rien n’a été enregistré.'}
        </p>
      )}

      {!result && !(done && 'result' in done && done.result.ok) && (
        <label
          htmlFor={inputId}
          className={dragging ? 'drop-zone is-dragging' : 'drop-zone'}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            const dropped = event.dataTransfer.files[0];
            if (dropped) analyze(dropped);
          }}
        >
          <span className="drop-zone__text">{pending ? 'Analyse du fichier…' : 'Glisse un fichier CSV ici, ou'}</span>
          {!pending && <span className="button-link drop-zone__button">Choisir un fichier</span>}
          <input
            ref={input}
            id={inputId}
            type="file"
            accept=".csv,text/csv"
            className="visually-hidden"
            disabled={pending}
            onChange={(event) => {
              const chosen = event.target.files?.[0];
              if (chosen) analyze(chosen);
            }}
          />
          <span className="drop-zone__hint">
            1{NBSP}Mo et 2{NBSP}000 lignes au plus, encodé en UTF-8.
          </span>
        </label>
      )}

      {result && 'error' in result && (
        <Problem file={file} onReset={reset}>
          {result.error}
        </Problem>
      )}

      {result && 'analysis' in result && !result.analysis.ok && (
        <Problem file={file} onReset={reset}>
          {problemText(result.analysis, separator, other)}
          {result.analysis.problem === 'wrongSeparator' && file && (
            <>
              {' '}
              <button
                type="button"
                className="link-button"
                disabled={pending}
                onClick={() => analyze(file, switchSeparatorAction.bind(null, type, other))}
              >
                Passer à la {SEPARATOR_NAMES[other]} et relire le fichier
              </button>{' '}
              (ou <Link href="/reglages/saisie#csv">changer dans les Réglages</Link>).
            </>
          )}
        </Problem>
      )}

      {result && 'analysis' in result && result.analysis.ok && (
        <Preview
          kind={kind}
          analysis={result.analysis}
          fileName={file?.name}
          filter={filter}
          onFilter={setFilter}
          onReset={reset}
          onImport={confirmImport}
          importing={pending}
        />
      )}
    </section>
  );
}

function problemText(analysis: Extract<ImportAnalysis, { ok: false }>, separator: CsvSeparator, other: CsvSeparator) {
  switch (analysis.problem) {
    case 'empty':
      return 'Ce fichier ne contient aucune ligne à importer : sa première ligne, celle des en-têtes, est ignorée.';
    case 'tooManyLines':
      return 'Ce fichier dépasse 2 000 lignes : découpe-le en plusieurs fichiers.';
    case 'syntax':
      return `Fichier illisible : le guillemet ouvert ligne ${analysis.line} n’est jamais refermé.`;
    case 'wrongSeparator':
      return `Ce fichier semble utiliser la ${SEPARATOR_NAMES[other]} comme séparateur, et non le ${SEPARATOR_NAMES[separator]} choisi dans les Réglages.`;
  }
}

function Problem({ file, onReset, children }: { file: File | null; onReset: () => void; children: ReactNode }) {
  return (
    <div className="import-problem" role="alert">
      <p>
        {file && <strong>{file.name} : </strong>}
        {children}
      </p>
      <button type="button" className="button--secondary" onClick={onReset}>
        Choisir un autre fichier
      </button>
    </div>
  );
}

interface PreviewProps {
  kind: ImportKind<AnyRow>;
  analysis: Extract<ImportAnalysis, { ok: true }>;
  fileName?: string;
  filter: StatusFilter;
  onFilter: (filter: StatusFilter) => void;
  onReset: () => void;
  /** MEM-54: import the lines "to import", once confirmed. */
  onImport: () => void;
  importing: boolean;
}

/** The grid of the lines of the file, with their status, the summary above it, and the import below. */
function Preview({ kind, analysis, fileName, filter, onFilter, onReset, onImport, importing }: PreviewProps) {
  const { rows, summary } = analysis;
  const { noun } = kind;
  const shown = filter === 'all' ? rows : rows.filter((row) => row.status === filter);
  const confirm = useRef<HTMLDialogElement>(null);
  const left = [
    summary.duplicate > 0 && (summary.duplicate > 1 ? `les ${summary.duplicate} doublons` : 'le doublon'),
    summary.error > 0 && (summary.error > 1 ? `les ${summary.error} lignes en erreur` : 'la ligne en erreur'),
  ].filter(Boolean);
  const leftOut = summary.duplicate + summary.error;

  return (
    <div className="import-preview">
      <p className="import-preview__summary" role="status">
        {fileName && <strong>{fileName} : </strong>}
        {plural(summary.total, 'ligne')} : {summary.new} à importer, {plural(summary.duplicate, 'doublon')},{' '}
        {plural(summary.error, 'erreur')}.
      </p>
      <div className="import-preview__tools">
        <select
          aria-label="Filtrer par statut"
          value={filter}
          onChange={(e) => onFilter(e.target.value as StatusFilter)}
        >
          {FILTERS.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button type="button" className="button--secondary" onClick={onReset}>
          Annuler, choisir un autre fichier
        </button>
      </div>

      <div className="item-list__scroll">
        <table className="item-list__table import-preview__table">
          <thead>
            <tr>
              <th scope="col">Ligne</th>
              {kind.headers.map((header) => (
                <th key={header} scope="col">
                  {header}
                </th>
              ))}
              <th scope="col">Statut</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr key={row.line} className={`import-row--${row.status}`}>
                <td className="import-preview__line">{row.line}</td>
                {kind.cells(row).map((cell, index) => (
                  <td key={kind.headers[index]} className={kind.cellClasses[index]}>
                    {cell}
                  </td>
                ))}
                <td>
                  <span className={`import-status import-status--${row.status}`}>{STATUS_LABELS[row.status]}</span>
                  {row.status !== 'new' && (
                    <span className="import-preview__why">
                      {row.status === 'error'
                        ? row.error
                        : kind.duplicate(row as Extract<AnyRow, { status: 'duplicate' }>)}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="import-preview__actions">
        <button
          type="button"
          className="button--primary"
          disabled={summary.new === 0 || importing}
          onClick={() => confirm.current?.showModal()}
        >
          {importing ? 'Import…' : `Importer ${countOf(summary.new, noun)}`}
        </button>
        {summary.new === 0 && <span className="import-preview__none">Aucune ligne à importer dans ce fichier.</span>}
      </div>

      <dialog ref={confirm} className="dialog" aria-labelledby="import-confirm-title">
        <h3 id="import-confirm-title">
          Importer {countOf(summary.new, noun)}
          {' '}?
        </h3>
        <p>
          {countOf(summary.new, noun)} {summary.new > 1 ? 'seront' : 'sera'} {agree('importé', noun, summary.new)}, en
          attente, à ajouter ensuite à la file d’apprentissage depuis la Liste.
          {left.length > 0 &&
            ` ${capitalize(left.join(' et '))} ne ${leftOut > 1 ? 'seront' : 'sera'} pas intégré${leftOut > 1 ? 's' : ''}.`}
        </p>
        <div className="dialog__buttons">
          <button type="button" className="button--secondary" onClick={() => confirm.current?.close()}>
            Annuler
          </button>
          <button
            type="button"
            className="button--primary"
            onClick={() => {
              confirm.current?.close();
              onImport();
            }}
          >
            Importer
          </button>
        </div>
      </dialog>
    </div>
  );
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** MEM-54: the result, with where to go next. */
function Imported({
  kind: { noun, space },
  result,
  onAgain,
}: {
  kind: ImportKind<AnyRow>;
  result: { imported: number; duplicate: number; error: number };
  onAgain: () => void;
}) {
  return (
    <div className="import-done" role="status">
      <p>
        <strong>
          {result.imported > 0
            ? `${countOf(result.imported, noun)} ${agree('importé', noun, result.imported)}`
            : `${noun.feminine ? 'Aucune' : 'Aucun'} ${noun.one} ${agree('importé', noun, 1)}`}
        </strong>
        {result.imported > 0 && ', en attente. Ajoutez-les à la file d’apprentissage depuis la Liste'}.
        {result.duplicate + result.error > 0 &&
          ` ${plural(result.duplicate, 'doublon')} et ${plural(result.error, 'ligne')} en erreur laissés de côté.`}
      </p>
      <p className="import-done__links">
        {/* MEM-62: the list filtered on the items "En attente", where they join the queue. */}
        <Link href={`${space}/liste?etat=Waiting`}>Voir les {noun.many} en attente</Link>
        <Link href={space}>Apprendre · Réviser</Link>
        <button type="button" className="link-button" onClick={onAgain}>
          Importer un autre fichier
        </button>
      </p>
    </div>
  );
}
