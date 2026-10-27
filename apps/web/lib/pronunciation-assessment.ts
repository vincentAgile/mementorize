/**
 * MEM-91: how an assessment of the pronunciation reads, as plain functions:
 * the appreciation of a score, the quality of a word, the message of a
 * failure. The thresholds follow the trial of MEM-93.
 */

export type WordError = 'none' | 'omission' | 'insertion' | 'mispronunciation';

/** As the API gives it (voice layer, MEM-90). */
export interface PronunciationResult {
  nothingHeard: boolean;
  score: number;
  accuracy: number;
  fluency: number;
  completeness: number;
  words: { word: string; score: number; error: WordError; phonemes?: { phoneme: string; score: number }[] }[];
}

export type Quality = 'good' | 'fair' | 'poor' | 'omitted';

/** At or above: « Très bien » (green); at or above FAIR: « Bien » (orange); below: « À travailler » (red). */
export const GOOD = 80;
export const FAIR = 60;

export function appreciation(score: number): { label: string; quality: Exclude<Quality, 'omitted'> } {
  if (score >= GOOD) return { label: 'Très bien', quality: 'good' };
  if (score >= FAIR) return { label: 'Bien', quality: 'fair' };
  return { label: 'À travailler', quality: 'poor' };
}

export function wordQuality(word: PronunciationResult['words'][number]): Quality {
  if (word.error === 'omission') return 'omitted';
  if (word.error === 'mispronunciation') return 'poor';
  return appreciation(word.score).quality;
}

export const QUALITY_LABELS: Record<Quality, string> = {
  good: 'bien prononcé',
  fair: 'à peu près',
  poor: 'mal prononcé',
  omitted: 'omis',
};

/** The sounds to work on in a word: the weakest first, those below « Bien ». */
export function weakSounds(word: PronunciationResult['words'][number]): { phoneme: string; score: number }[] {
  return (word.phonemes ?? []).filter((ph) => ph.score < GOOD).sort((a, b) => a.score - b.score);
}

/** What to say when the assessment fails, from the status of the answer and its message. */
export function failureMessage(status: number, message?: string): string {
  if (status === 429) {
    return /daily/i.test(message ?? '')
      ? 'Limite quotidienne d’évaluations atteinte : réessayez demain.'
      : 'Beaucoup d’essais d’affilée : réessayez dans une minute.';
  }
  if (status === 400) return 'Enregistrement trop court ou illisible : réessayez en parlant juste après avoir cliqué.';
  if (status === 413) return 'Enregistrement trop long : 10 secondes au plus.';
  return 'Évaluation indisponible pour le moment : réessayez plus tard.';
}
