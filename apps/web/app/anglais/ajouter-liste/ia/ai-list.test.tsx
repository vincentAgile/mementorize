// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SETTINGS_KEY } from '../../../../lib/ai-lists';

const addAiListAction = vi.fn();
vi.mock('./actions', () => ({ addAiListAction }));
const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
const getAiListStatus = vi.fn();
const getItems = vi.fn();
const getPreferences = vi.fn();
vi.mock('../../../../lib/api', () => ({ getAiListStatus, getItems, getPreferences }));

const { AiListGenerator } = await import('./ai-list-generator');
const { default: AiListPage } = await import('./page');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
  this.open = true;
};
HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
  this.open = false;
};

const entry = (english: string, extra: Record<string, unknown> = {}) => ({
  event: 'entry',
  data: {
    english,
    french: `${english} (fr)`,
    example: `I like ${english}.`,
    frenchExample: `J’aime ${english}.`,
    topic: 'Voyage et transports',
    ...extra,
  },
});
const done = (proposed: number, skippedDuplicates = 0) => ({ event: 'done', data: { proposed, skippedDuplicates } });

/**
 * A response of the route, as server-sent events. `holdAfter`: the stream
 * waits after this many events until released; the signal of the fetch
 * (« Annuler ») breaks it, as a real one.
 */
function sse(events: { event: string; data: unknown }[], { holdAfter = -1 } = {}) {
  const encoder = new TextEncoder();
  let release: () => void = () => undefined;
  let signal: AbortSignal | undefined;
  const response = () =>
    new Response(
      new ReadableStream<Uint8Array>({
        async start(controller) {
          signal?.addEventListener('abort', () => controller.error(new DOMException('Aborted', 'AbortError')));
          for (const [index, event] of events.entries()) {
            if (signal?.aborted) return;
            controller.enqueue(encoder.encode(`event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`));
            if (index === holdAfter) await new Promise<void>((resolve) => (release = resolve));
          }
          if (!signal?.aborted) controller.close();
        },
      }),
      { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
    );
  return {
    fetch: (_url: string, init: RequestInit) => {
      signal = init.signal ?? undefined;
      return Promise.resolve(response());
    },
    release: () => release(),
  };
}

const flush = async () => {
  for (let i = 0; i < 10; i++) await act(async () => await new Promise((resolve) => setTimeout(resolve, 0)));
};

let root: Root;
let container: HTMLDivElement;
function mount({ remaining = 7, owned = [] as string[] } = {}) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(<AiListGenerator remaining={remaining} owned={owned} learnHref="/anglais/preparer" />));
}
const $ = <T extends Element = HTMLElement>(selector: string) => container.querySelector(selector) as T | null;
const plain = (element: Element | null) => (element?.textContent ?? '').replace(/\u00a0/g, ' ');
const button = (name: string | RegExp) =>
  [...container.querySelectorAll('button')].find((b) =>
    typeof name === 'string' ? plain(b) === name : name.test(plain(b)),
  ) as HTMLButtonElement | undefined;
const radio = (name: string, value: string) => $<HTMLInputElement>(`input[name="${name}"][value="${value}"]`)!;
const checkedValue = (name: string) => $<HTMLInputElement>(`input[name="${name}"]:checked`)?.value;
const click = (element: Element | null | undefined) => act(() => (element as HTMLElement).click());
function type(element: HTMLInputElement | HTMLTextAreaElement, text: string) {
  const proto = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(element, text);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
const key = (element: Element, key: string) =>
  act(() => {
    element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
const text = () => container.textContent!.replace(/ /g, ' ');
const rows = () =>
  [...container.querySelectorAll('tbody tr')].map((tr) => ({
    english: tr.querySelector('.ai-preview__english .ai-cell, .ai-preview__english input')?.textContent,
    checked: tr.querySelector<HTMLInputElement>('.catalog-content__check input')!.checked,
    disabled: tr.querySelector<HTMLInputElement>('.catalog-content__check input')!.disabled,
  }));
const addButton = () => button(/^Ajouter \d+ cartes?$|^Ajouter 0 carte$/);

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  addAiListAction.mockReset();
  push.mockReset();
  window.localStorage.clear();
  window.history.replaceState(null, '', '/anglais/ajouter-liste/ia');
});
afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  vi.unstubAllGlobals();
});

describe('« Générer avec l’IA »: the settings (MEM-140)', () => {
  it('the defaults, the groups announced and the notice; never the count of the day', () => {
    mount();
    expect([...container.querySelectorAll('legend')].map((l) => l.textContent)).toEqual([
      'Niveau',
      'Thème',
      'Nombre',
      'Type',
    ]);
    expect([checkedValue('level'), checkedValue('theme'), checkedValue('count'), checkedValue('kind')]).toEqual([
      'B1',
      'Vie quotidienne',
      '10',
      'Both',
    ]);
    // The level's name in the tooltip and for the screen readers.
    expect(radio('level', 'A1').getAttribute('aria-label')).toBe('A1 · Débutant');
    expect(radio('level', 'A1').closest('label')!.title).toBe('A1 · Débutant');
    expect([...container.querySelectorAll('input[name="theme"]')]).toHaveLength(11);
    expect(text()).toContain('Autre thème…');
    expect([...container.querySelectorAll('input[name="kind"]')].map((i) => i.closest('label')!.textContent)).toEqual([
      'Mots',
      'Expressions',
      'Les deux',
    ]);
    expect(text()).not.toMatch(/restante/);
    expect(text()).toContain(
      'L’IA peut se tromper : relis les cartes avant de les ajouter. Ton thème est envoyé à notre prestataire d’IA.',
    );
    expect(button('Générer')!.disabled).toBe(false);
    expect($('a[href="/anglais/ajouter-liste"]')!.textContent).toBe('← Retour au choix');
  });

  it('« Autre thème… »: a field, focused, required, 80 characters with a counter from 60; Enter generates', async () => {
    mount();
    click(radio('theme', ''));
    const field = $<HTMLInputElement>('#ai-custom-theme')!;
    expect(document.activeElement).toBe(field);
    expect(field.placeholder).toBe('Ex. : le football, négocier un contrat…');
    expect(field.maxLength).toBe(80);
    expect(button('Générer')!.disabled).toBe(true);
    expect(text()).toContain('Saisis un thème.');
    type(field, '    ');
    expect(button('Générer')!.disabled).toBe(true);

    type(field, 'a'.repeat(60));
    expect(text()).not.toContain('60 / 80');
    type(field, 'a'.repeat(61));
    expect(text()).toContain('61 / 80');

    // A predefined theme closes the field, without losing what was typed.
    type(field, 'le football');
    click(radio('theme', 'Sport et loisirs'));
    expect($('#ai-custom-theme')).toBeNull();
    click(radio('theme', ''));
    expect($<HTMLInputElement>('#ai-custom-theme')!.value).toBe('le football');

    const stream = sse([entry('a goal'), done(1)]);
    fetchMock.mockImplementation(stream.fetch);
    act(() => $<HTMLInputElement>('#ai-custom-theme')!.form!.requestSubmit());
    await flush();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      level: 'B1',
      theme: 'le football',
      count: 10,
      kind: 'Both',
    });
    expect(fetchMock.mock.calls[0][0]).toBe('/anglais/ajouter-liste/ia/generer');
  });

  it('one choice per group; the last settings are remembered in the browser, the free theme too', () => {
    mount();
    click(radio('level', 'C1'));
    click(radio('count', '20'));
    click(radio('kind', 'Expressions'));
    click(radio('theme', ''));
    type($<HTMLInputElement>('#ai-custom-theme')!, 'négocier un contrat');
    expect(container.querySelectorAll('input[name="level"]:checked')).toHaveLength(1);
    expect(JSON.parse(window.localStorage.getItem(SETTINGS_KEY)!)).toEqual({
      level: 'C1',
      theme: null,
      customTheme: 'négocier un contrat',
      count: 20,
      kind: 'Expressions',
    });
    act(() => root.unmount());
    container.remove();

    mount();
    expect([checkedValue('level'), checkedValue('count'), checkedValue('kind')]).toEqual(['C1', '20', 'Expressions']);
    expect($<HTMLInputElement>('#ai-custom-theme')!.value).toBe('négocier un contrat');
    expect(document.activeElement).not.toBe($('#ai-custom-theme')); // not focused when the page opens

    // A broken memory: the defaults.
    act(() => root.unmount());
    container.remove();
    window.localStorage.setItem(SETTINGS_KEY, '{"level":"Z9","count":7');
    mount();
    expect([checkedValue('level'), checkedValue('theme'), checkedValue('count')]).toEqual([
      'B1',
      'Vie quotidienne',
      '10',
    ]);
  });

  it('the quota reached: « Générer » off, and why', async () => {
    mount({ remaining: 0 });
    expect(button('Générer')!.disabled).toBe(true);
    expect(text()).toContain('Tu as atteint la limite de générations d’aujourd’hui. Réessaie demain.');
  });

  it('the quota reached meanwhile, or a refusal: said on the settings, nothing else changes', async () => {
    mount();
    fetchMock.mockResolvedValueOnce(Response.json({ reason: 'daily-limit', retryAt: 'x' }, { status: 429 }));
    click(button('Générer'));
    await flush();
    expect(text()).toContain('Tu as atteint la limite de générations d’aujourd’hui. Réessaie demain.');
    expect(button('Générer')!.disabled).toBe(true);
    expect($('legend')).not.toBeNull(); // still the settings
  });

  it('« Générer » is off while waiting for the first card', async () => {
    mount();
    let answer: (response: Response) => void = () => undefined;
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => (answer = resolve)));
    click(button('Générer'));
    expect(button('Génération…')!.disabled).toBe(true);
    await act(async () => answer(sse([entry('a bus'), done(1)]).fetch('', {}) as unknown as Response));
    await flush();
  });

  it('without an AI, the direct address says it is not available', async () => {
    getAiListStatus.mockResolvedValueOnce({ enabled: false, remaining: 0 });
    const html = renderToStaticMarkup(await AiListPage());
    expect(html).toContain('L’IA n’est pas disponible pour le moment.');
    expect(html).toContain('← Retour au choix');
    expect(html).not.toContain('Générer</button>');
  });

  it('with an AI: the English of « Ma liste » given to the page, « Apprendre » after the learning mode', async () => {
    getAiListStatus.mockResolvedValue({ enabled: true, remaining: 4 });
    getItems.mockResolvedValue([{ type: 'Vocabulary', content: { word: ' A Bus ', translation: 'un bus' } }]);
    getPreferences.mockResolvedValue({ learningMode: 'Guided' });
    const page = (await AiListPage()) as React.ReactElement<{ owned: string[]; learnHref: string; remaining: number }>;
    expect(page.props).toEqual({ remaining: 4, owned: ['a bus'], learnHref: '/anglais/apprendre' });
    getPreferences.mockResolvedValue({ learningMode: 'Free' });
    expect(((await AiListPage()) as React.ReactElement<{ learnHref: string }>).props.learnHref).toBe(
      '/anglais/preparer',
    );
  });
});

describe('« Générer avec l’IA »: the cards proposed (MEM-141)', () => {
  async function generateWith(events: { event: string; data: unknown }[], options = {}) {
    const stream = sse(events, options);
    fetchMock.mockImplementation(stream.fetch);
    click(button('Générer'));
    await flush();
    return stream;
  }

  it('the rows come one by one with a counter; then all checked, the header, the warning', async () => {
    mount();
    click(radio('theme', 'Voyage et transports'));
    const stream = await generateWith([entry('a ticket'), entry('a train'), done(2)], { holdAfter: 0 });
    expect(text()).toContain('Génération en cours… 1 / 10');
    expect(rows().map((r) => r.english)).toEqual(['a ticket']);
    expect(addButton()!.disabled).toBe(true); // not while the cards come
    await act(async () => stream.release());
    await flush();
    expect(rows()).toEqual([
      { english: 'a ticket', checked: true, disabled: false },
      { english: 'a train', checked: true, disabled: false },
    ]);
    expect(plain($('h2'))).toBe('B1 · Voyage et transports · 10 cartes');
    expect(text()).toContain('L’IA peut se tromper : relis les traductions avant d’ajouter.');
    expect([...container.querySelectorAll('thead th')].map((th) => th.textContent)).toEqual([
      '',
      'Anglais',
      'Français',
      'Exemple',
      'Actions',
    ]);
    // A box named by its word; « Tout cocher / tout décocher ».
    expect(container.querySelector('tbody input[type="checkbox"]')!.getAttribute('aria-label')).toBe('a ticket');
    expect(plain(addButton()!)).toBe('Ajouter 2 cartes');
    click($('thead input[type="checkbox"]'));
    expect(rows().every((r) => !r.checked)).toBe(true);
    expect(addButton()!.disabled).toBe(true);
    click($('thead input[type="checkbox"]'));
    expect(plain(addButton()!)).toBe('Ajouter 2 cartes');
    // The queue by default.
    expect($<HTMLInputElement>('input[name="queue"][value="on"]')!.checked).toBe(true);
    expect(text()).toContain('2 cartes proposées.');
  });

  it('« Annuler » stops the generation and keeps the rows received; not given back', async () => {
    mount({ remaining: 1 });
    await generateWith([entry('a ticket'), entry('a train'), done(2)], { holdAfter: 0 });
    click(button('Annuler'));
    await flush();
    expect(rows().map((r) => r.english)).toEqual(['a ticket']);
    expect(text()).toContain('Génération annulée : les cartes reçues sont gardées.');
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    click(button('Modifier les réglages'));
    expect(button('Générer')!.disabled).toBe(true); // the last one was used
    expect(text()).toContain('Tu as atteint la limite de générations d’aujourd’hui. Réessaie demain.');
  });

  it('a failure in the middle: the rows kept, the generation given back', async () => {
    mount({ remaining: 1 });
    await generateWith([entry('a ticket'), { event: 'error', data: { statusCode: 502, message: 'x' } }]);
    expect(rows().map((r) => r.english)).toEqual(['a ticket']);
    expect(text()).toContain('L’IA s’est interrompue');
    click(button('Modifier les réglages'));
    expect(button('Générer')!.disabled).toBe(false); // given back
    expect(button('Revenir aux cartes proposées')).toBeDefined();
  });

  it('a click corrects a cell: « modifié », the checks of a card added by hand, Escape gives the text back', async () => {
    mount();
    await generateWith([entry('a ticket'), done(1)]);
    click($('.ai-preview__french .ai-cell'));
    const field = $<HTMLInputElement>('.ai-preview__french input')!;
    expect(document.activeElement).toBe(field);
    type(field, '   ');
    key(field, 'Enter');
    expect(text()).toContain('Saisis la traduction en français.');
    expect(field.getAttribute('aria-invalid')).toBe('true');
    type(field, 'x'.repeat(201));
    key(field, 'Enter');
    expect(text()).toContain('200 caractères au plus.');
    key(field, 'Escape');
    expect($('.ai-preview__french .ai-cell')!.textContent).toBe('a ticket (fr)');
    expect(text()).not.toContain('modifié');

    click($('.ai-preview__french .ai-cell'));
    type($<HTMLInputElement>('.ai-preview__french input')!, '  un billet ');
    key($('.ai-preview__french input')!, 'Enter');
    expect($('.ai-preview__french .ai-cell')!.textContent).toBe('un billet');
    expect(document.activeElement).toBe($('.ai-preview__french .ai-cell'));
    expect(text()).toContain('modifié');

    // The examples, in a fold; 500 characters at most.
    click($('.ai-preview__example .ai-cell'));
    const example = $<HTMLTextAreaElement>('.ai-preview__example textarea')!;
    type(example, 'y'.repeat(501));
    key(example, 'Enter');
    expect(text()).toContain('500 caractères au plus.');
    type(example, 'I lost my ticket.');
    key(example, 'Enter');
    expect($('.ai-preview__example .ai-cell')!.textContent).toBe('I lost my ticket.');
    // The English: required.
    click($('.ai-preview__english .ai-cell'));
    type($<HTMLInputElement>('.ai-preview__english input')!, '');
    key($('.ai-preview__english input')!, 'Enter');
    expect(text()).toContain('Saisis le mot, l’expression ou la phrase en anglais.');
  });

  it('a row corrected into a word of « Ma liste »: « Déjà dans ta liste », unchecked and off', async () => {
    mount({ owned: ['a suitcase'] });
    await generateWith([entry('a ticket'), entry('a bag'), done(2)]);
    click(container.querySelectorAll('.ai-preview__english .ai-cell')[1]);
    type($<HTMLInputElement>('.ai-preview__english input')!, 'A Suitcase');
    key($('.ai-preview__english input')!, 'Enter');
    expect(rows()[1]).toEqual({ english: 'A Suitcase', checked: false, disabled: true });
    expect(text()).toContain('Déjà dans ta liste');
    expect(plain(addButton()!)).toBe('Ajouter 1 carte');
  });

  it('« Retirer » takes the row away (not the same as unchecking)', async () => {
    mount();
    await generateWith([entry('a ticket'), entry('a train'), done(2)]);
    click(button(/^Retirer/));
    expect(rows().map((r) => r.english)).toEqual(['a train']);
    expect(container.querySelector('tbody button[aria-label="Retirer « a train »"]')).not.toBeNull();
  });

  it('fewer cards than asked, or none', async () => {
    mount();
    click(radio('count', '10'));
    await generateWith([...Array.from({ length: 7 }, (_, i) => entry(`w${i}`)), done(7, 3)]);
    expect(text()).toContain('7 cartes proposées : 3 étaient déjà dans ta liste.');
    expect(button('Regénérer tout')).toBeDefined();

    act(() => root.unmount());
    container.remove();
    mount();
    await generateWith([done(0, 15)]);
    expect(text()).toContain('L’IA n’a rien proposé de nouveau pour ce thème.');
    click(button('Modifier les réglages'));
    expect($('legend')).not.toBeNull();
  });

  it('« Regénérer tout » counts a generation, and asks first when rows were corrected', async () => {
    mount();
    await generateWith([entry('a ticket'), done(1)]);
    fetchMock.mockImplementation(sse([entry('a plane'), done(1)]).fetch);
    click(button('Regénérer tout'));
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(rows().map((r) => r.english)).toEqual(['a plane']);

    click($('.ai-preview__french .ai-cell'));
    type($<HTMLInputElement>('.ai-preview__french input')!, 'un avion');
    key($('.ai-preview__french input')!, 'Enter');
    click(button('Regénérer tout'));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const dialog = $<HTMLDialogElement>('dialog[aria-labelledby="ai-regenerate-title"]')!;
    expect(dialog.open).toBe(true);
    fetchMock.mockImplementation(sse([entry('a boat'), done(1)]).fetch);
    click([...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Regénérer'));
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(rows().map((r) => r.english)).toEqual(['a boat']);
    click(button('Modifier les réglages'));
    expect(text()).not.toMatch(/restante/);
  });

  it('« Modifier les réglages » keeps the settings', async () => {
    mount();
    click(radio('level', 'A2'));
    click(radio('theme', 'Santé et bien-être'));
    await generateWith([entry('a doctor'), done(1)]);
    expect(plain($('h2'))).toBe('A2 · Santé et bien-être · 10 cartes');
    click(button('Modifier les réglages'));
    expect([checkedValue('level'), checkedValue('theme')]).toEqual(['A2', 'Santé et bien-être']);
  });

  it('adds the rows checked, corrected, in order, with the theme and the queue; then the confirmation', async () => {
    mount();
    click(radio('theme', 'Voyage et transports'));
    await generateWith([
      entry('a ticket'),
      entry('a train', { example: undefined, frenchExample: undefined }),
      entry('a bus'),
      done(3),
    ]);
    click(container.querySelectorAll('tbody input[type="checkbox"]')[2]); // a bus, unchecked
    click($('.ai-preview__french .ai-cell'));
    type($<HTMLInputElement>('.ai-preview__french input')!, 'un billet');
    key($('.ai-preview__french input')!, 'Enter');
    click($('input[name="queue"][value="off"]'));
    addAiListAction.mockResolvedValueOnce({ added: 1, skipped: 1, queue: false });
    click(addButton());
    await flush();
    expect(addAiListAction).toHaveBeenCalledWith(
      [
        { english: 'a ticket', french: 'un billet', example: 'I like a ticket.', frenchExample: 'J’aime a ticket.' },
        { english: 'a train', french: 'a train (fr)' },
      ],
      'Voyage et transports',
      false,
    );
    expect(text()).toContain('1 carte ajoutée, en attente, 1 déjà présente ignorée.');
    expect($('a[href="/anglais/liste?etat=Waiting"]')!.textContent).toBe('Voir dans ma liste');
    expect($('a[href="/anglais/preparer"]')!.textContent).toBe('Apprendre');
    // The preview is empty; leaving doesn't ask any more.
    expect(rows()).toEqual([]);
    click(button('Générer d’autres cartes'));
    expect($('legend')).not.toBeNull();
    expect(button('Revenir aux cartes proposées')).toBeUndefined();
  });

  it('the addition refused: said, the rows kept', async () => {
    mount();
    await generateWith([entry('a ticket'), done(1)]);
    addAiListAction.mockResolvedValueOnce({ error: 'L’ajout a échoué : aucune carte n’a été ajoutée. Réessaie.' });
    click(addButton());
    await flush();
    expect(text()).toContain('L’ajout a échoué : aucune carte n’a été ajoutée. Réessaie.');
    expect(rows()).toHaveLength(1);
  });

  it('leaving with cards not added asks first', async () => {
    mount();
    const outside = document.createElement('a');
    outside.href = '/anglais/liste';
    outside.textContent = 'Ma liste';
    document.body.append(outside);
    await generateWith([entry('a ticket'), done(1)]);
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    act(() => {
      outside.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
    const dialog = $<HTMLDialogElement>('dialog[aria-labelledby="ai-leave-title"]')!;
    expect(dialog.open).toBe(true);
    expect(dialog.textContent).toContain('Tu perdras les propositions non ajoutées.');
    click([...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Rester'));
    expect(push).not.toHaveBeenCalled();
    act(() => {
      outside.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    });
    click([...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Quitter'));
    expect(push).toHaveBeenCalledWith('/anglais/liste');
    outside.remove();
  });

  it('closing the tab with cards not added asks first; not before', async () => {
    mount();
    const before = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(before);
    expect(before.defaultPrevented).toBe(false);
    await generateWith([entry('a ticket'), done(1)]);
    const after = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(true);
  });
});

describe('« Générer avec l’IA »: « Proposer d’autres » (MEM-142)', () => {
  async function generateWith(events: { event: string; data: unknown }[]) {
    fetchMock.mockImplementation(sse(events).fetch);
    click(button('Générer'));
    await flush();
  }
  const replaceButton = () => button('Proposer d’autres')!;
  const uncheck = (english: string) => click(container.querySelector(`tbody input[aria-label="${english}"]`));
  const lastBody = () => JSON.parse(fetchMock.mock.calls.at(-1)![1].body as string);

  it('off until a row is unchecked, and why', async () => {
    mount();
    await generateWith([entry('a ticket'), entry('a train'), done(2)]);
    expect(replaceButton().disabled).toBe(true);
    expect(text()).toContain('Décoche les cartes à remplacer.');
    expect(replaceButton().getAttribute('aria-describedby')).toBe('ai-preview-replace-hint');
    uncheck('a train');
    expect(replaceButton().disabled).toBe(false);
    expect(text()).not.toContain('Décoche les cartes à remplacer.');
  });

  it('keeps the rows checked (corrected too), replaces the unchecked ones in their place; counts a generation', async () => {
    mount({ remaining: 3 });
    click(radio('level', 'A2'));
    click(radio('theme', 'Santé et bien-être'));
    click(radio('kind', 'Words'));
    await generateWith([entry('a ticket'), entry('a train'), entry('a plane'), entry('a boat'), done(4)]);
    click($('.ai-preview__french .ai-cell'));
    type($<HTMLInputElement>('.ai-preview__french input')!, 'un billet');
    key($('.ai-preview__french input')!, 'Enter');
    uncheck('a train');
    uncheck('a boat');

    const stream = sse([entry('a car'), entry('a bike'), done(2)], { holdAfter: 0 });
    fetchMock.mockImplementation(stream.fetch);
    click(replaceButton());
    await flush();
    // The same settings, the number of rows to replace, all the English proposed.
    expect(lastBody()).toEqual({
      level: 'A2',
      theme: 'Santé et bien-être',
      count: 2,
      kind: 'Words',
      exclude: ['a ticket', 'a train', 'a plane', 'a boat'],
    });
    // As they come: the first one in the place of the first row unchecked.
    expect(text()).toContain('Génération en cours… 1 / 2');
    expect(rows().map((r) => r.english)).toEqual(['a ticket', 'a car', 'a plane', 'a boat']);
    expect(replaceButton().disabled).toBe(true);
    expect(addButton()!.disabled).toBe(true);
    await act(async () => stream.release());
    await flush();
    expect(rows()).toEqual([
      { english: 'a ticket', checked: true, disabled: false },
      { english: 'a car', checked: true, disabled: false },
      { english: 'a plane', checked: true, disabled: false },
      { english: 'a bike', checked: true, disabled: false },
    ]);
    expect(plain($('tbody tr .ai-preview__french'))).toContain('un billet');
    expect(text()).toContain('2 cartes remplacées.');

    // Again: what was replaced is not proposed again; the last generation of the day.
    uncheck('a plane');
    fetchMock.mockImplementation(sse([entry('a bus'), done(1)]).fetch);
    click(replaceButton());
    await flush();
    expect([...lastBody().exclude].sort()).toEqual(['a bike', 'a boat', 'a car', 'a plane', 'a ticket', 'a train']);
    expect(text()).toContain('1 carte remplacée.');
    uncheck('a bus');
    expect(replaceButton().disabled).toBe(true);
    expect(replaceButton().getAttribute('aria-describedby')).toBe('ai-preview-limit');
    expect(text()).toContain('Tu as atteint la limite de générations d’aujourd’hui. Réessaie demain.');
  });

  it('the English sent: 60 at most, the most recent', async () => {
    mount();
    await generateWith([...Array.from({ length: 20 }, (_, i) => entry(`w${i}`)), done(20)]);
    for (let round = 0; round < 3; round++) {
      click($('thead input[type="checkbox"]')); // all unchecked
      fetchMock.mockImplementation(
        sse([...Array.from({ length: 20 }, (_, i) => entry(`r${round}-${i}`)), done(20)]).fetch,
      );
      click(replaceButton());
      await flush();
    }
    click($('thead input[type="checkbox"]'));
    fetchMock.mockImplementation(sse([entry('last'), done(1)]).fetch);
    click(replaceButton());
    await flush();
    const exclude = lastBody().exclude as string[];
    expect(exclude).toHaveLength(60);
    expect(exclude[0]).toBe('r0-0');
    expect(exclude.at(-1)).toBe('r2-19');
  });

  it('fewer new cards than rows to replace: those left are taken away, and why', async () => {
    mount();
    await generateWith([entry('a ticket'), entry('a train'), entry('a plane'), done(3)]);
    uncheck('a ticket');
    uncheck('a plane');
    fetchMock.mockImplementation(sse([entry('a car'), done(1, 4)]).fetch);
    click(replaceButton());
    await flush();
    expect(rows().map((r) => r.english)).toEqual(['a car', 'a train']);
    expect(text()).toContain(
      '1 carte remplacée. Pas assez de nouvelles propositions. Modifie les réglages pour en obtenir d’autres.',
    );
  });

  it('a failure leaves the preview as it was, with « Réessayer »; not counted', async () => {
    mount({ remaining: 1 });
    await generateWith([entry('a ticket'), entry('a train'), done(2)]);
    // The last generation of the day was used: given back below.
    expect(replaceButton().disabled).toBe(true);

    act(() => root.unmount());
    container.remove();
    mount({ remaining: 2 });
    await generateWith([entry('a ticket'), entry('a train'), entry('a plane'), done(3)]);
    uncheck('a train');
    uncheck('a plane');
    fetchMock.mockResolvedValueOnce(Response.json({ message: 'busy' }, { status: 503 }));
    click(replaceButton());
    await flush();
    expect(rows()).toEqual([
      { english: 'a ticket', checked: true, disabled: false },
      { english: 'a train', checked: false, disabled: false },
      { english: 'a plane', checked: false, disabled: false },
    ]);
    expect(text()).toContain('L’IA est occupée pour le moment : réessaie dans un instant.');
    expect(container.querySelector('tr.is-replacing')).toBeNull();

    // In the middle: the cards received are kept, the others as they were; given back.
    fetchMock.mockImplementation(
      sse([entry('a car'), { event: 'error', data: { statusCode: 502, message: 'x' } }]).fetch,
    );
    click(button('Réessayer'));
    await flush();
    expect(rows().map((r) => [r.english, r.checked])).toEqual([
      ['a ticket', true],
      ['a car', true],
      ['a plane', false],
    ]);
    expect(text()).toContain('L’IA s’est interrompue : 1 sur 2 remplacées, les autres sont inchangées.');
    expect(replaceButton().disabled).toBe(false); // still one generation left
    fetchMock.mockImplementation(sse([entry('a bus'), done(1)]).fetch);
    click(button('Réessayer'));
    await flush();
    expect(rows().map((r) => r.english)).toEqual(['a ticket', 'a car', 'a bus']);
    expect(lastBody().count).toBe(1);
  });

  it('« Annuler » keeps what came, the rest as it was', async () => {
    mount();
    await generateWith([entry('a ticket'), entry('a train'), done(2)]);
    uncheck('a ticket');
    uncheck('a train');
    fetchMock.mockImplementation(sse([entry('a car'), entry('a bike'), done(2)], { holdAfter: 0 }).fetch);
    click(replaceButton());
    await flush();
    click(button('Annuler'));
    await flush();
    expect(rows().map((r) => [r.english, r.checked])).toEqual([
      ['a car', true],
      ['a train', false],
    ]);
    expect(text()).toContain('Annulé : 1 carte remplacée, les autres sont inchangées.');
  });
});
