// MEM-93 — essai d'Azure AI Speech, Pronunciation Assessment (spike, hors production).
//
// Lancé par run.sh dans un conteneur jetable (Node 24 + ffmpeg), sur le VPS.
// Lit les enregistrements de ./enregistrements (<id>-soignee.<ext>, <id>-fautive.<ext>),
// les convertit, les envoie à l'API REST « short audio » avec le texte de
// référence, et écrit dans ./resultats : les réponses JSON brutes, resume.csv
// et compte-rendu.md (scores, mots et phonèmes signalés, temps, formats).
//
// Variables : AZURE_SPEECH_KEY, AZURE_SPEECH_REGION (ex. francecentral),
// LANGUAGE (en-US par défaut). Aucune journalisation côté Azure : pas de
// paramètre storeAudio (désactivée par défaut).

import { execFile } from 'node:child_process';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
// docker --env-file keeps the quotes of KEY="value": they are removed here.
const env = (name) =>
  process.env[name]
    ?.trim()
    .replace(/^(['"])(.*)\1$/, '$2')
    .trim();
const KEY = env('AZURE_SPEECH_KEY');
const REGION = env('AZURE_SPEECH_REGION');
const LANGUAGE = env('LANGUAGE') || 'en-US';
if (!KEY || !REGION) {
  console.error('AZURE_SPEECH_KEY et AZURE_SPEECH_REGION sont requis (fichier .env).');
  process.exit(1);
}
const ENDPOINT = `${env('AZURE_SPEECH_ENDPOINT') || `https://${REGION}.stt.speech.microsoft.com`}/speech/recognition/conversation/cognitiveservices/v1?language=${LANGUAGE}&format=detailed`;
/** The scores are at the top of the REST response, under PronunciationAssessment in the SDK's. */
const scores = (node) => node?.PronunciationAssessment ?? node ?? {};

const items = JSON.parse(await readFile('items.json', 'utf8'));
const byId = new Map(items.map((item) => [item.id, item]));
const files = (await readdir('enregistrements')).filter((name) => /^\d{2}-(soignee|fautive)\.\w+$/.test(name)).sort();
if (files.length === 0) {
  console.error('Aucun enregistrement dans ./enregistrements (attendu : 01-soignee.webm, 01-fautive.webm…).');
  process.exit(1);
}
await rm('resultats', { recursive: true, force: true });
await mkdir('resultats/json', { recursive: true });
await mkdir('tmp', { recursive: true });

const now = () => performance.now();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let ipa = true; // alphabet phonétique international, si l'API REST l'accepte

function header(referenceText) {
  const params = {
    ReferenceText: referenceText,
    GradingSystem: 'HundredMark',
    Granularity: 'Phoneme',
    Dimension: 'Comprehensive',
    EnableMiscue: 'True',
    EnableProsodyAssessment: 'True',
    ...(ipa && { PhonemeAlphabet: 'IPA' }),
  };
  return Buffer.from(JSON.stringify(params), 'utf8').toString('base64');
}

/** Un appel à l'API : statut, durée, réponse. Réessaie après un 429 (offre gratuite : 20 requêtes/min). */
async function assess(body, contentType, referenceText) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const start = now();
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': KEY,
        'Content-Type': contentType,
        Accept: 'application/json',
        'Pronunciation-Assessment': header(referenceText),
      },
      body,
    });
    const ms = now() - start;
    const text = await res.text();
    if (res.status === 429) {
      await sleep(5000 * (attempt + 1));
      continue;
    }
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      // une erreur en texte brut
    }
    return { status: res.status, ms, json, text };
  }
  return { status: 429, ms: 0, json: null, text: 'trop de requêtes' };
}

async function convert(input, output, args) {
  const start = now();
  await run('ffmpeg', ['-v', 'error', '-y', '-i', input, '-ac', '1', '-ar', '16000', ...args, output]);
  return now() - start;
}

const CONTENT_TYPES = {
  webm: ['audio/webm; codecs=opus', 'audio/ogg; codecs=opus'],
  mp4: ['audio/mp4'],
  m4a: ['audio/mp4'],
  ogg: ['audio/ogg; codecs=opus'],
  wav: ['audio/wav; codecs=audio/pcm; samplerate=16000'],
};

// 1. Formats acceptés directement : le premier fichier de chaque extension, tel quel.
const formats = [];
for (const ext of [...new Set(files.map((name) => name.split('.').pop()))]) {
  const name = files.find((one) => one.endsWith(`.${ext}`));
  const item = byId.get(name.slice(0, 2));
  for (const contentType of CONTENT_TYPES[ext] ?? ['application/octet-stream']) {
    const r = await assess(await readFile(join('enregistrements', name)), contentType, item.text);
    if (r.status === 400 && ipa && /phoneme/i.test(r.text)) ipa = false; // IPA refusé : SAPI
    formats.push({
      file: name,
      contentType,
      status: r.status,
      recognition: r.json?.RecognitionStatus ?? r.text.slice(0, 120),
    });
  }
}

// 2. Chaque enregistrement, converti en OGG/Opus et en WAV 16 kHz mono.
const rows = [];
for (const name of files) {
  const [id, take] = name.split('.')[0].split('-');
  const item = byId.get(id);
  if (!item) continue;
  const source = join('enregistrements', name);
  const ogg = join('tmp', `${id}-${take}.ogg`);
  const wav = join('tmp', `${id}-${take}.wav`);
  const convOgg = await convert(source, ogg, ['-c:a', 'libopus', '-b:a', '32k']);
  const convWav = await convert(source, wav, ['-c:a', 'pcm_s16le']);
  const viaOgg = await assess(await readFile(ogg), 'audio/ogg; codecs=opus', item.text);
  const viaWav = await assess(await readFile(wav), 'audio/wav; codecs=audio/pcm; samplerate=16000', item.text);
  await writeFile(join('resultats/json', `${id}-${take}.json`), JSON.stringify(viaOgg.json ?? viaOgg.text, null, 2));
  const best = viaOgg.json?.NBest?.[0];
  const words = best?.Words ?? [];
  const flagged = words
    .filter((word) => (scores(word).ErrorType ?? 'None') !== 'None' || (scores(word).AccuracyScore ?? 100) < 60)
    .map((word) => `${word.Word} (${scores(word).ErrorType}, ${scores(word).AccuracyScore})`);
  const weakPhonemes = words
    .flatMap((word) =>
      (word.Phonemes ?? []).map((ph) => ({ word: word.Word, ph: ph.Phoneme, score: scores(ph).AccuracyScore })),
    )
    .filter((ph) => ph.score !== undefined && ph.score < 60)
    .map((ph) => `${ph.word}:/${ph.ph}/ ${ph.score}`);
  const pa = scores(best);
  rows.push({
    id,
    kind: item.kind,
    text: item.text,
    take,
    status: viaOgg.status,
    recognition: viaOgg.json?.RecognitionStatus ?? viaOgg.text.slice(0, 80),
    heard: best?.Display ?? '',
    pron: pa.PronScore,
    accuracy: pa.AccuracyScore,
    fluency: pa.FluencyScore,
    completeness: pa.CompletenessScore,
    prosody: pa.ProsodyScore,
    flagged: flagged.join(' ; '),
    weakPhonemes: weakPhonemes.join(' ; '),
    convOggMs: Math.round(convOgg),
    convWavMs: Math.round(convWav),
    apiOggMs: Math.round(viaOgg.ms),
    apiWavMs: Math.round(viaWav.ms),
    wavPron: scores(viaWav.json?.NBest?.[0]).PronScore,
  });
  console.log(
    `${name.padEnd(20)} score ${String(pa.PronScore ?? '—').padStart(5)}  conversion ${Math.round(convOgg)} ms  API ${Math.round(viaOgg.ms)} ms`,
  );
}
await rm('tmp', { recursive: true, force: true });

// 3. Résumé et compte rendu.
const csvCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
const columns = Object.keys(rows[0] ?? {});
await writeFile(
  'resultats/resume.csv',
  [columns.join(','), ...rows.map((row) => columns.map((c) => csvCell(row[c])).join(','))].join('\n'),
);

const median = (values) => {
  const sorted = values.filter((v) => typeof v === 'number').sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : '—';
};
const max = (values) => (values.length ? Math.max(...values) : '—');
const pairs = items
  .map((item) => {
    const ok = rows.find((row) => row.id === item.id && row.take === 'soignee');
    const ko = rows.find((row) => row.id === item.id && row.take === 'fautive');
    return { item, ok, ko };
  })
  .filter(({ ok, ko }) => ok || ko);
const distinct = pairs.filter(
  ({ ok, ko }) => ok?.pron !== undefined && ko?.pron !== undefined && ok.pron - ko.pron >= 15,
).length;
const measured = pairs.filter(({ ok, ko }) => ok?.pron !== undefined && ko?.pron !== undefined).length;

const md = [];
md.push('# MEM-93 — résultats bruts de l’essai Azure Pronunciation Assessment', '');
md.push(
  `Région \`${REGION}\`, langue \`${LANGUAGE}\`, API REST « short audio », alphabet ${ipa ? 'IPA' : 'SAPI'}, ${new Date().toISOString()}.`,
  '',
);
md.push('## Formats envoyés tels quels', '', '| Fichier | Content-Type | HTTP | Reconnaissance |', '|---|---|---|---|');
for (const f of formats) md.push(`| ${f.file} | \`${f.contentType}\` | ${f.status} | ${f.recognition} |`);
md.push('', '## Soignée contre fautive (PronScore, 0–100)', '');
md.push(`Écart d’au moins 15 points : **${distinct} éléments sur ${measured}**.`, '');
md.push('| # | Élément | Soignée | Fautive | Écart | Signalé (fautive) |', '|---|---|---|---|---|---|');
for (const { item, ok, ko } of pairs) {
  const gap = ok?.pron !== undefined && ko?.pron !== undefined ? Math.round(ok.pron - ko.pron) : '—';
  md.push(
    `| ${item.id} | ${item.text} | ${ok?.pron ?? '—'} | ${ko?.pron ?? '—'} | ${gap} | ${ko?.flagged || '—'}${ko?.weakPhonemes ? `<br>phonèmes : ${ko.weakPhonemes}` : ''} |`,
  );
}
md.push(
  '',
  '## Temps (médiane / maximum, en ms)',
  '',
  '| Type | Conversion OGG | API (OGG) | Conversion WAV | API (WAV) | Total (OGG) |',
  '|---|---|---|---|---|---|',
);
for (const kind of ['mot', 'expression', 'phrase']) {
  const of = rows.filter((row) => row.kind === kind);
  if (!of.length) continue;
  const total = of.map((row) => row.convOggMs + row.apiOggMs);
  md.push(
    `| ${kind} | ${median(of.map((r) => r.convOggMs))} / ${max(of.map((r) => r.convOggMs))} | ${median(of.map((r) => r.apiOggMs))} / ${max(of.map((r) => r.apiOggMs))} | ${median(of.map((r) => r.convWavMs))} / ${max(of.map((r) => r.convWavMs))} | ${median(of.map((r) => r.apiWavMs))} / ${max(of.map((r) => r.apiWavMs))} | ${median(total)} / ${max(total)} |`,
  );
}
md.push('', `Premier enregistrement évalué (après les essais de formats) : ${rows[0]?.apiOggMs ?? '—'} ms.`);
md.push('', '## Même score en OGG et en WAV ?', '');
const sameish = rows.filter(
  (row) => row.pron !== undefined && row.wavPron !== undefined && Math.abs(row.pron - row.wavPron) <= 3,
).length;
md.push(`${sameish} enregistrements sur ${rows.length} à 3 points près.`);
md.push('', 'Réponses complètes : `resultats/json/`, tableau : `resultats/resume.csv`.');
await writeFile('resultats/compte-rendu.md', md.join('\n') + '\n');
console.log(`\nTerminé : resultats/compte-rendu.md (${distinct}/${measured} éléments nettement distingués).`);
