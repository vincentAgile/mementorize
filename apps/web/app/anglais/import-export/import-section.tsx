'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { MAX_FILE_BYTES, SEPARATOR_NAMES } from '../../../lib/csv-separator';
import { NBSP } from '../../../lib/format';
import type { CsvSeparator, ImportAnalysis, ImportRow } from '../../../lib/types';
import {
  type ImportActionResult,
  importAction,
  type PreviewResult,
  previewImportAction,
  switchSeparatorAction,
} from './actions';

type StatusFilter = 'all' | ImportRow['status'];

const STATUS_LABELS: Record<ImportRow['status'], string> = { new: 'À importer', duplicate: 'Doublon', error: 'Erreur' };
const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Toutes les lignes' },
  { value: 'new', label: 'À importer' },
  { value: 'duplicate', label: 'Doublons' },
  { value: 'error', label: 'Erreurs' },
];

const plural = (count: number, one: string, many = `${one}s`) => `${count}${NBSP}${count > 1 ? many : one}`;

/**
 * The "Importer" section of the tab (MEM-53): a CSV file, chosen or dropped,
 * is read on the server and shown as a grid, each line with its status (to
 * import, duplicate, error). Nothing is saved at this stage.
 */
export function ImportSection({ separator }: { separator: CsvSeparator }) {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [dragging, setDragging] = useState(false);
  const [done, setDone] = useState<ImportActionResult | null>(null); // MEM-54
  const [pending, startTransition] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const other: CsvSeparator = separator === 'Semicolon' ? 'Comma' : 'Semicolon';

  function analyze(chosen: File, action = previewImportAction) {
    setFile(chosen);
    setFilter('all');
    if (chosen.size > MAX_FILE_BYTES) {
      setResult({ error: 'Ce fichier dépasse 1 Mo : découpe-le en plusieurs fichiers.' });
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
      const outcome = await importAction(data);
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
        Un fichier CSV au format de l’export : expression française, expression anglaise, puis, facultatives, la
        thématique et les phrases d’exemple en français et en anglais. Séparateur : {SEPARATOR_NAMES[separator]}. La
        première ligne, celle des en-têtes, est ignorée. Les éléments importés seront « À apprendre ».
      </p>

      {done && 'result' in done && done.result.ok && <Imported result={done.result} onAgain={reset} />}
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
                onClick={() => analyze(file, switchSeparatorAction.bind(null, other))}
              >
                Passer à la {SEPARATOR_NAMES[other]} et relire le fichier
              </button>{' '}
              (ou <Link href="/reglages#csv">changer dans les Réglages</Link>).
            </>
          )}
        </Problem>
      )}

      {result && 'analysis' in result && result.analysis.ok && (
        <Preview
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
      return 'Ce fichier dépasse 2 000 lignes : découpe-le en plusieurs fichiers.';
    case 'syntax':
      return `Fichier illisible : le guillemet ouvert ligne ${analysis.line} n’est jamais refermé.`;
    case 'wrongSeparator':
      return `Ce fichier semble utiliser la ${SEPARATOR_NAMES[other]} comme séparateur, et non le ${SEPARATOR_NAMES[separator]} choisi dans les Réglages.`;
  }
}

function Problem({ file, onReset, children }: { file: File | null; onReset: () => void; children: React.ReactNode }) {
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
function Preview({ analysis, fileName, filter, onFilter, onReset, onImport, importing }: PreviewProps) {
  const { rows, summary } = analysis;
  const shown = filter === 'all' ? rows : rows.filter((row) => row.status === filter);
  const confirm = useRef<HTMLDialogElement>(null);
  const left = [
    summary.duplicate > 0 && (summary.duplicate > 1 ? `les ${summary.duplicate}\u00a0doublons` : 'le doublon'),
    summary.error > 0 && (summary.error > 1 ? `les ${summary.error}\u00a0lignes en erreur` : 'la ligne en erreur'),
  ].filter(Boolean);

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

      <div className="vocabulary__scroll">
        <table className="vocabulary__table import-preview__table">
          <thead>
            <tr>
              <th scope="col">Ligne</th>
              <th scope="col">Français</th>
              <th scope="col">Anglais</th>
              <th scope="col">Thématique</th>
              <th scope="col">Statut</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr key={row.line} className={`import-row--${row.status}`}>
                <td className="import-preview__line">{row.line}</td>
                <td>
                  {row.french}
                  {row.frenchExample && (
                    <span lang="fr" className="vocabulary__example">
                      {row.frenchExample}
                    </span>
                  )}
                </td>
                <td>
                  <span lang="en">{row.english}</span>
                  {row.example && (
                    <span lang="en" className="vocabulary__example">
                      {row.example}
                    </span>
                  )}
                </td>
                <td className="vocabulary__topic">{row.topic}</td>
                <td>
                  <span className={`import-status import-status--${row.status}`}>{STATUS_LABELS[row.status]}</span>
                  {row.status !== 'new' && <span className="import-preview__why">{why(row)}</span>}
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
          {importing ? 'Import…' : `Importer ${plural(summary.new, 'élément')}`}
        </button>
        {summary.new === 0 && <span className="import-preview__none">Aucune ligne à importer dans ce fichier.</span>}
      </div>

      <dialog ref={confirm} className="dialog" aria-labelledby="import-confirm-title">
        <h3 id="import-confirm-title">Importer {plural(summary.new, 'élément')} ?</h3>
        <p>
          {summary.new > 1 ? `${summary.new}\u00a0éléments seront importés` : '1\u00a0élément sera importé'}, « À
          apprendre ».
          {left.length > 0 &&
            ` ${capitalize(left.join(' et '))} ne ${summary.duplicate + summary.error > 1 ? 'seront' : 'sera'} pas intégré${summary.duplicate + summary.error > 1 ? 's' : ''}.`}
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
  result,
  onAgain,
}: {
  result: { imported: number; duplicate: number; error: number };
  onAgain: () => void;
}) {
  return (
    <div className="import-done" role="status">
      <p>
        <strong>
          {result.imported > 1
            ? `${result.imported}\u00a0éléments importés`
            : result.imported === 1
              ? '1\u00a0élément importé'
              : 'Aucun élément importé'}
        </strong>
        {result.imported > 0 && ', « À apprendre »'}.
        {result.duplicate + result.error > 0 &&
          ` ${plural(result.duplicate, 'doublon')} et ${plural(result.error, 'ligne')} en erreur laissés de côté.`}
      </p>
      <p className="import-done__links">
        <Link href="/anglais/liste">Voir la liste</Link>
        <Link href="/anglais">Apprendre · Réviser</Link>
        <button type="button" className="link-button" onClick={onAgain}>
          Importer un autre fichier
        </button>
      </p>
    </div>
  );
}

/** Why a line won't be imported: the expression already there, or the error. */
function why(row: ImportRow): string {
  if (row.status === 'error') return row.error;
  if (row.status !== 'duplicate') return '';
  const languages =
    row.languages.length === 2 ? 'anglais et français' : row.languages[0] === 'en' ? 'anglais' : 'français';
  const of =
    'existing' in row.of ? `déjà dans le vocabulaire : « ${row.of.existing} »` : `comme la ligne ${row.of.line}`;
  return `${languages}, ${of}`;
}
