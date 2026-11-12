'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from 'react';
import {
  AI_GENERATE_HREF,
  type AiListSettings,
  DEFAULT_SETTINGS,
  duplicateKey,
  excludeOf,
  type GeneratedEntry,
  type GenerationEvent,
  readSettings,
  refusalText,
  saveSettings,
  settingsSummary,
  themeOf,
} from '../../../../lib/ai-lists';
import { sseReader } from '../../../../lib/chat';
import { type AddAiListResult, addAiListAction } from './actions';
import { AiListPreview, type Phase, type PreviewRow } from './ai-list-preview';
import { AiListSettingsForm } from './ai-list-settings';

const noop = () => () => undefined;
const yes = () => true;
const no = () => false;

const storage = () => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

/**
 * MEM-140/141: « Générer avec l'IA », the settings then the preview, on one
 * page. « Générer » waits for the first card (the button is off), then shows
 * the preview, where the cards come one by one. « Proposer d'autres »
 * (MEM-142) puts new cards in the place of the rows unchecked, the others
 * kept as they are. Leaving the page with cards not added asks first (a link
 * of the app, or closing the tab).
 */
export function AiListGenerator({
  remaining: initialRemaining,
  owned: initialOwned,
  learnHref,
}: {
  remaining: number;
  /** The English of « Ma liste », as duplicate keys. */
  owned: string[];
  learnHref: string;
}) {
  const router = useRouter();
  const [settings, setSettings] = useState<AiListSettings>(DEFAULT_SETTINGS);
  const [view, setView] = useState<'settings' | 'preview'>('settings');
  const [remaining, setRemaining] = useState(initialRemaining);
  const [owned, setOwned] = useState(() => new Set(initialOwned));
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  /** The settings of the cards shown: their summary, their theme (the topic). */
  const [generated, setGenerated] = useState<AiListSettings>(DEFAULT_SETTINGS);
  const [waiting, setWaiting] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [queue, setQueue] = useState(true);
  const [result, setResult] = useState<AddAiListResult | null>(null);
  const [adding, startAdding] = useTransition();
  const controller = useRef<AbortController | null>(null);
  const nextId = useRef(1);
  /** The English proposed since the last full generation, in order: not proposed again (MEM-142). */
  const proposed = useRef<string[]>([]);
  const regenerate = useRef<HTMLDialogElement>(null);
  const leave = useRef<HTMLDialogElement>(null);
  const [leaveHref, setLeaveHref] = useState<string | null>(null);

  // The last settings of this browser, once on the page (the server renders the defaults).
  const hydrated = useSyncExternalStore(noop, yes, no);
  const [restored, setRestored] = useState(false);
  if (hydrated && !restored) {
    setRestored(true);
    setSettings(readSettings(storage()));
  }

  const unsaved = rows.length > 0;

  // Leaving with cards not added: a link of the app asks first; closing the tab too.
  useEffect(() => {
    if (!unsaved) return;
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
      const link = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!link || link.target === '_blank' || link.hasAttribute('download')) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      event.preventDefault();
      event.stopPropagation();
      setLeaveHref(url.pathname + url.search + url.hash);
      leave.current?.showModal();
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    document.addEventListener('click', onClick, true);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [unsaved]);

  // Leaving the page stops a generation running.
  useEffect(() => () => controller.current?.abort(), []);

  function changeSettings(next: AiListSettings) {
    setSettings(next);
    setRefusal(null);
    saveSettings(storage(), next);
  }

  /** A row of the preview for a card proposed: checked. */
  const rowOf = (entry: GeneratedEntry): PreviewRow => {
    proposed.current.push(entry.english);
    return {
      id: nextId.current++,
      english: entry.english,
      french: entry.french,
      example: entry.example ?? '',
      frenchExample: entry.frenchExample ?? '',
      checked: true,
      edited: false,
    };
  };

  /**
   * Calls the route: the response of a stream, or null once the refusal is
   * said (on the settings, or in the preview while replacing).
   */
  async function ask(body: object, abort: AbortController, replacing: boolean): Promise<Response | null> {
    let response: Response;
    try {
      response = await fetch(AI_GENERATE_HREF, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: abort.signal,
      });
    } catch {
      response = new Response(null, { status: 502 });
    }
    if (response.ok && response.body) {
      // Counted, even if cancelled later (only a failure is given back).
      setRemaining((count) => Math.max(0, count - 1));
      return response;
    }
    const refused = (await response.json().catch(() => null)) as { reason?: unknown } | null;
    const limit = response.status === 429 && refused?.reason === 'daily-limit';
    if (limit) setRemaining(0);
    if (replacing)
      setPhase(
        limit ? { kind: 'idle' } : { kind: 'failed', message: refusalText(response.status, refused), retry: true },
      );
    if (!replacing || limit) setRefusal(refusalText(response.status, refused));
    return null;
  }

  /** Reads the events of a generation; `onEntry` for each card. How it ended: done, failed or cancelled. */
  async function read(
    response: Response,
    abort: AbortController,
    onEntry: (entry: GeneratedEntry) => void,
  ): Promise<
    { kind: 'done'; proposed: number; skipped: number } | { kind: 'failed'; midway: boolean } | { kind: 'cancelled' }
  > {
    const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
    const events = sseReader();
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return { kind: 'failed', midway: false };
        for (const item of events.push(value) as unknown as GenerationEvent[]) {
          if (item.event === 'entry') onEntry(item.data);
          else if (item.event === 'done') {
            return { kind: 'done', proposed: item.data.proposed, skipped: item.data.skippedDuplicates };
          } else if (item.event === 'error') {
            setRemaining((count) => count + 1); // a failure doesn't count
            return { kind: 'failed', midway: true };
          }
        }
      }
    } catch {
      return abort.signal.aborted ? { kind: 'cancelled' } : { kind: 'failed', midway: false };
    } finally {
      if (controller.current === abort) controller.current = null;
    }
  }

  /** Asks for cards with these settings: the preview once the first one comes, else the reason on the screen. */
  async function generate(chosen: AiListSettings) {
    if (waiting || phase.kind === 'running') return;
    saveSettings(storage(), chosen);
    setRefusal(null);
    setWaiting(true);
    const abort = new AbortController();
    controller.current = abort;
    const body = { level: chosen.level, theme: themeOf(chosen), count: chosen.count, kind: chosen.kind };
    const response = await ask(body, abort, false);
    setWaiting(false);
    if (!response) return;
    proposed.current = [];
    setGenerated(chosen);
    setRows([]);
    setResult(null);
    setPhase({ kind: 'running' });
    setView('preview');

    const end = await read(response, abort, (entry) => setRows((current) => [...current, rowOf(entry)]));
    if (end.kind === 'done') setPhase(end);
    else if (end.kind === 'cancelled') setPhase(end);
    else if (end.midway) {
      setPhase({
        kind: 'failed',
        message: 'L’IA s’est interrompue : les cartes reçues sont gardées. Tu peux regénérer.',
      });
    } else setPhase({ kind: 'failed', message: 'La génération s’est interrompue : réessaie.' });
  }

  /**
   * MEM-142: « Proposer d'autres »: new cards in the place of the rows
   * unchecked (or already in « Ma liste »), as they come; the rows checked,
   * corrected or not, stay. The same settings; the English proposed in this
   * preview is not proposed again. Counts as a generation. A failure leaves
   * the rows not replaced yet as they were.
   */
  async function replace() {
    if (phase.kind === 'running' || remaining <= 0) return;
    const targets = rows.filter((row) => !row.checked || owned.has(duplicateKey(row.english))).map((row) => row.id);
    if (targets.length === 0) return;
    const abort = new AbortController();
    controller.current = abort;
    setRefusal(null);
    setResult(null);
    setPhase({ kind: 'running', replace: { received: 0, total: targets.length } });
    setRows((current) => current.map((row) => (targets.includes(row.id) ? { ...row, replacing: true } : row)));
    const body = {
      level: generated.level,
      theme: themeOf(generated),
      count: targets.length,
      kind: generated.kind,
      exclude: excludeOf([...proposed.current, ...rows.map((row) => row.english)]),
    };
    const response = await ask(body, abort, true);
    const left = [...targets];
    const settle = () =>
      setRows((current) => current.map((row) => (row.replacing ? { ...row, replacing: false } : row)));
    if (!response) {
      settle();
      return;
    }
    let received = 0;
    const end = await read(response, abort, (entry) => {
      const row = rowOf(entry);
      const target = left.shift();
      received++;
      setPhase({ kind: 'running', replace: { received, total: targets.length } });
      setRows((current) =>
        current.some((other) => other.id === target)
          ? current.map((other) => (other.id === target ? row : other))
          : [...current, row],
      );
    });
    if (end.kind === 'done') {
      // Fewer new cards than rows to replace: the rows left are taken away.
      setRows((current) => current.filter((row) => !left.includes(row.id)));
      setPhase({ kind: 'replaced', replaced: received, missing: left.length });
      return;
    }
    settle();
    if (end.kind === 'cancelled') setPhase({ kind: 'cancelled', replaced: received });
    else {
      setPhase({
        kind: 'failed',
        message:
          received > 0
            ? `L’IA s’est interrompue : ${received} sur ${targets.length} remplacées, les autres sont inchangées.`
            : 'L’IA n’a pas répondu : les cartes sont inchangées.',
        retry: true,
      });
    }
  }

  function regenerateAll() {
    if (rows.some((row) => row.edited)) regenerate.current?.showModal();
    else void generate(generated);
  }

  function add() {
    const chosen = rows.filter((row) => row.checked && !owned.has(duplicateKey(row.english)));
    if (chosen.length === 0) return;
    startAdding(async () => {
      const outcome = await addAiListAction(
        chosen.map((row) => ({
          english: row.english,
          french: row.french,
          ...(row.example && { example: row.example }),
          ...(row.frenchExample && { frenchExample: row.frenchExample }),
        })),
        themeOf(generated),
        queue,
      );
      setResult(outcome);
      if ('added' in outcome) {
        setOwned((current) => new Set([...current, ...chosen.map((row) => duplicateKey(row.english))]));
        setRows([]);
        setPhase({ kind: 'idle' });
      }
    });
  }

  function toSettings() {
    setView('settings');
    setResult(null); // the settings are kept as they were
  }

  return (
    <>
      {view === 'settings' ? (
        <AiListSettingsForm
          settings={settings}
          onChange={changeSettings}
          onGenerate={() => {
            if (rows.some((row) => row.edited)) regenerate.current?.showModal();
            else void generate(settings);
          }}
          remaining={remaining}
          pending={waiting}
          error={refusal}
          backToPreview={rows.length > 0 ? () => setView('preview') : null}
        />
      ) : (
        <AiListPreview
          summary={settingsSummary(generated)}
          count={generated.count}
          rows={rows}
          owned={owned}
          phase={phase}
          remaining={remaining}
          queue={queue}
          onQueue={setQueue}
          onRows={setRows}
          onCancel={() => controller.current?.abort()}
          onRegenerate={regenerateAll}
          onReplace={() => void replace()}
          onEditSettings={toSettings}
          onAdd={add}
          adding={adding}
          result={result ?? (refusal && remaining > 0 ? { error: refusal } : null)}
          learnHref={learnHref}
          onMore={toSettings}
        />
      )}

      <dialog ref={regenerate} className="dialog" aria-labelledby="ai-regenerate-title">
        <h3 id="ai-regenerate-title">Regénérer toutes les cartes ?</h3>
        <p className="dialog__hint">Tes corrections seront perdues, et cela compte une génération.</p>
        <div className="dialog__buttons">
          <button type="button" className="button--secondary" onClick={() => regenerate.current?.close()}>
            Annuler
          </button>
          <button
            type="button"
            className="button--primary"
            onClick={() => {
              regenerate.current?.close();
              void generate(view === 'settings' ? settings : generated);
            }}
          >
            Regénérer
          </button>
        </div>
      </dialog>

      <dialog ref={leave} className="dialog" aria-labelledby="ai-leave-title">
        <h3 id="ai-leave-title">Quitter la page ?</h3>
        <p className="dialog__hint">Tu perdras les propositions non ajoutées.</p>
        <div className="dialog__buttons">
          <button type="button" className="button--secondary" onClick={() => leave.current?.close()}>
            Rester
          </button>
          <button
            type="button"
            className="button--primary"
            onClick={() => {
              leave.current?.close();
              controller.current?.abort();
              setRows([]);
              if (leaveHref) router.push(leaveHref);
            }}
          >
            Quitter
          </button>
        </div>
      </dialog>
    </>
  );
}
