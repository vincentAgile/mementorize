'use client';

import { type ReactNode, useEffect, useId, useRef, useState, useTransition } from 'react';
import type { CatalogImportAnalysis } from '../../../../../lib/admin-api';
import { wordCount } from '../../../../../lib/catalog';
import { MAX_FILE_BYTES, theSeparator } from '../../../../../lib/csv-separator';
import { NBSP } from '../../../../../lib/format';
import type { ImportRow } from '../../../../../lib/types';
import { FILTERS, STATUS_LABELS, type StatusFilter } from '../../../../../lib/import-status';
import {
  type CatalogImportActionResult,
  type CatalogPreviewResult,
  importCatalogAction,
  previewCatalogImportAction,
} from './actions';

const SEPARATOR = ';';
const plural = (count: number, one: string, many = `${one}s`) => `${count}${NBSP}${count > 1 ? many : one}`;
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * MEM-117: « Importer un fichier », in the page of a predefined list: a CSV
 * file in the format of the vocabulary of the users (MEM-50), read by the
 * API with the same analyser, shown as a grid of its lines, each with its
 * status (À importer, Doublon, Erreur), a summary and a filter, as the import
 * of the users (MEM-53, MEM-54). Nothing is saved until the import is
 * confirmed; then all the lines « À importer » at once, at the end of the
 * list in the order of the file, or none when the list would go over 500.
 */
export function CatalogImport({ listId }: { listId: string }) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<CatalogPreviewResult | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [done, setDone] = useState<CatalogImportActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [resetCount, setResetCount] = useState(0);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open, resetCount]);

  function analyze(chosen: File) {
    setFile(chosen);
    setFilter('all');
    setDone(null);
    if (chosen.size > MAX_FILE_BYTES) {
      setResult({ error: 'Ce fichier dépasse 1 Mo : découpe-le en plusieurs fichiers.' });
      return;
    }
    const data = new FormData();
    data.set('file', chosen);
    startTransition(async () => setResult(await previewCatalogImportAction(listId, data)));
  }

  function reset() {
    setFile(null);
    setResult(null);
    setDone(null);
    setResetCount((n) => n + 1);
  }

  function confirmImport() {
    if (!file) return;
    const data = new FormData();
    data.set('file', file);
    startTransition(async () => {
      const outcome = await importCatalogAction(listId, data);
      setDone(outcome);
      if ('result' in outcome && outcome.result.ok) {
        setResult(null);
        setFile(null);
      }
    });
  }

  if (!open) {
    return (
      <button type="button" className="button--secondary" onClick={() => setOpen(true)}>
        Importer un fichier
      </button>
    );
  }

  const imported = done && 'result' in done && done.result.ok ? done.result : null;
  return (
    <section className="catalog-import" aria-labelledby="catalog-import-title">
      <div className="catalog-import__bar">
        <h2 id="catalog-import-title">Importer un fichier</h2>
        <button
          type="button"
          className="link-button"
          onClick={() => {
            reset();
            setOpen(false);
          }}
        >
          Fermer
        </button>
      </div>
      <p>
        Un fichier CSV au format de l’import du vocabulaire des utilisateurs : expression française, expression
        anglaise, puis, facultatives, la thématique et les phrases d’exemple en français et en anglais. Séparateur :
        point-virgule. La première ligne, celle des en-têtes, est ignorée. Les mots sont ajoutés à la fin de la liste,
        dans l’ordre du fichier.
      </p>

      {imported && (
        <div className="import-done" role="status">
          <p>
            <strong>
              {imported.imported > 0
                ? `${wordCount(imported.imported)} ajouté${imported.imported > 1 ? 's' : ''} à la fin de la liste`
                : 'Aucun mot ajouté'}
            </strong>
            .
            {imported.duplicate + imported.error > 0 &&
              ` ${plural(imported.duplicate, 'doublon')} et ${plural(imported.error, 'ligne')} en erreur laissés de côté.`}{' '}
            <button type="button" className="link-button" onClick={reset}>
              Importer un autre fichier
            </button>
          </p>
        </div>
      )}
      {done && !imported && (
        <Problem file={file} onReset={reset}>
          {'error' in done
            ? done.error
            : done.result.ok
              ? null
              : done.result.problem === 'tooManyWords'
                ? tooMany(done.result.new, done.result.room)
                : 'L’import a échoué : le fichier n’a pas pu être relu. Rien n’a été enregistré.'}
        </Problem>
      )}

      {!result && !imported && !(done && !imported) && (
        <label htmlFor={inputId} className="drop-zone">
          <span className="drop-zone__text">{pending ? 'Analyse du fichier…' : 'Choisis un fichier CSV'}</span>
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

      {!done && result && 'error' in result && (
        <Problem file={file} onReset={reset}>
          {result.error}
        </Problem>
      )}
      {!done && result && 'analysis' in result && !result.analysis.ok && (
        <Problem file={file} onReset={reset}>
          {problemText(result.analysis)}
        </Problem>
      )}
      {!done && result && 'analysis' in result && result.analysis.ok && (
        <ImportPreview
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

const tooMany = (count: number, room: number) =>
  `Import impossible : ce fichier ajouterait ${wordCount(count)}, ${
    room === 0 ? 'et la liste n’a plus aucune place' : `et il ne reste que ${plural(room, 'place')} dans la liste`
  } (500${NBSP}mots au plus). Retire des lignes du fichier, ou supprime des mots de la liste.`;

function problemText(analysis: Extract<CatalogImportAnalysis, { ok: false }>) {
  switch (analysis.problem) {
    case 'empty':
      return 'Ce fichier ne contient aucune ligne à importer : sa première ligne, celle des en-têtes, est ignorée.';
    case 'tooManyLines':
      return 'Ce fichier dépasse 2 000 lignes : découpe-le en plusieurs fichiers.';
    case 'syntax':
      return `Fichier illisible : le guillemet ouvert ligne ${analysis.line} n’est jamais refermé.`;
    case 'wrongSeparator': {
      const found = analysis.candidates.map(theSeparator);
      const listed = found.length > 1 ? `${found.slice(0, -1).join(', ')} ou ${found.at(-1)}` : found[0];
      return `Ce fichier semble utiliser ${listed} comme séparateur, alors que les listes du catalogue utilisent ${theSeparator(SEPARATOR)}. Enregistre-le avec des points-virgules (dans Excel : « CSV UTF-8 »), puis choisis-le à nouveau.`;
    }
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

/** Why a duplicate line won't be imported: the same English in the list, or higher in the file. */
function duplicateOf(row: Extract<ImportRow, { status: 'duplicate' }>) {
  return 'existing' in row.of
    ? `déjà dans la liste : « ${row.of.existing} »`
    : `même expression anglaise que la ligne ${row.of.line}`;
}

interface PreviewProps {
  analysis: Extract<CatalogImportAnalysis, { ok: true }>;
  fileName?: string;
  filter: StatusFilter;
  onFilter: (filter: StatusFilter) => void;
  onReset: () => void;
  onImport: () => void;
  importing: boolean;
}

/** The grid of the lines of the file, with their status, the summary above it, and the import below. */
export function ImportPreview({ analysis, fileName, filter, onFilter, onReset, onImport, importing }: PreviewProps) {
  const rows = analysis.rows as ImportRow[];
  const { summary, room } = analysis;
  const shown = filter === 'all' ? rows : rows.filter((row) => row.status === filter);
  const confirm = useRef<HTMLDialogElement>(null);
  const overflow = summary.new > room;
  const left = [
    summary.duplicate > 0 && (summary.duplicate > 1 ? `les ${summary.duplicate} doublons` : 'le doublon'),
    summary.error > 0 && (summary.error > 1 ? `les ${summary.error} lignes en erreur` : 'la ligne en erreur'),
  ].filter(Boolean);
  const leftOut = summary.duplicate + summary.error;

  return (
    <div className="import-preview">
      <p className="import-preview__summary" role="status">
        {fileName && <strong>{fileName} : </strong>}
        {plural(summary.total, 'ligne')} : {summary.new} à importer, {plural(summary.duplicate, 'doublon')},{' '}
        {plural(summary.error, 'erreur')}.
      </p>
      {overflow && (
        <p className="form-error" role="alert">
          {tooMany(summary.new, room)}
        </p>
      )}
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
              <th scope="col">Expression française</th>
              <th scope="col">Expression anglaise</th>
              <th scope="col">Thématique</th>
              <th scope="col">Statut</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr key={row.line} className={`import-row--${row.status}`}>
                <td className="import-preview__line">{row.line}</td>
                <td lang="fr">
                  {row.french}
                  {row.frenchExample && <span className="item-list__example">{row.frenchExample}</span>}
                </td>
                <td lang="en">
                  {row.english}
                  {row.example && <span className="item-list__example">{row.example}</span>}
                </td>
                <td className="item-list__topic">{row.topic}</td>
                <td>
                  <span className={`import-status import-status--${row.status}`}>{STATUS_LABELS[row.status]}</span>
                  {row.status !== 'new' && (
                    <span className="import-preview__why">{row.status === 'error' ? row.error : duplicateOf(row)}</span>
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
          disabled={summary.new === 0 || overflow || importing}
          onClick={() => confirm.current?.showModal()}
        >
          {importing ? 'Import…' : `Importer ${wordCount(summary.new)}`}
        </button>
        {summary.new === 0 && <span className="import-preview__none">Aucune ligne à importer dans ce fichier.</span>}
      </div>

      <dialog ref={confirm} className="dialog" aria-labelledby="catalog-import-confirm">
        <h3 id="catalog-import-confirm">Importer {wordCount(summary.new)} ?</h3>
        <p>
          {wordCount(summary.new)} {summary.new > 1 ? 'seront ajoutés' : 'sera ajouté'}.
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
