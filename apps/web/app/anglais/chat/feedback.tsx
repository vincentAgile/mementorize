'use client';

import { useState } from 'react';
import { correctedParts, type Evaluation } from '../../../lib/chat';
import type { ChatVoice } from '../../../lib/chat-voice';
import { ChatSpeakButton } from './chat-speak-button';

/**
 * MEM-131: the evaluation of a message, under it, in English: the corrected
 * version (its changes underlined and in bold, not by colour only), the
 * corrections « before → after » with their type and explanation, or
 * « Great, no corrections needed. ». MEM-132: never read by itself; a
 * loudspeaker reads the corrected version on demand.
 */
export function Feedback({
  written,
  evaluation,
  voice,
  readingKey,
}: {
  written: string;
  evaluation: Evaluation;
  voice?: ChatVoice;
  readingKey?: string;
}) {
  const [copied, setCopied] = useState(false);
  const correct = evaluation.corrections.length === 0;

  async function copy() {
    try {
      await navigator.clipboard.writeText(evaluation.corrected);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="chat-feedback" aria-label="Feedback">
      <h3 className="chat-feedback__title">Feedback</h3>
      {evaluation.pronunciation && <SpokenScores pronunciation={evaluation.pronunciation} />}
      {correct ? (
        <p className="chat-feedback__ok">Great, no corrections needed.</p>
      ) : (
        <>
          <div className="chat-feedback__label-row">
            <h4 className="chat-feedback__label">Corrected version</h4>
            {voice && (
              <ChatSpeakButton
                voice={voice}
                readingKey={`corrected-${readingKey ?? written}`}
                text={evaluation.corrected}
                title="Écouter la version corrigée"
              />
            )}
          </div>
          <p className="chat-feedback__corrected">
            {correctedParts(written, evaluation.corrected).map((part, index) =>
              part.changed ? (
                <ins key={index} className="chat-feedback__change">
                  {part.text}
                </ins>
              ) : (
                <span key={index}>{part.text}</span>
              ),
            )}
          </p>
          <h4 className="chat-feedback__label">Corrections</h4>
          <ul className="chat-feedback__list">
            {evaluation.corrections.map((correction, index) => (
              <li key={index}>
                <span className="chat-feedback__type">{correction.type}</span> <del>{correction.original}</del>{' '}
                <span aria-hidden="true">→</span>
                <span className="visually-hidden"> becomes</span> <strong>{correction.suggestion}</strong>
                {correction.explanation && <span className="chat-feedback__why"> — {correction.explanation}</span>}
              </li>
            ))}
          </ul>
          <p className="chat-feedback__actions" lang="fr">
            <button type="button" className="link-button" onClick={() => void copy()}>
              Copier la version corrigée
            </button>
            <span role="status" className="chat-feedback__copied">
              {copied ? 'Copiée ✓' : ''}
            </span>
          </p>
        </>
      )}
    </section>
  );
}

const score = (value: number) => Math.round(value);

/**
 * MEM-133: the pronunciation of a message said aloud (and sent as
 * recognized): its scores and the words to work on, in English like the
 * rest of the feedback.
 */
function SpokenScores({ pronunciation }: { pronunciation: NonNullable<Evaluation['pronunciation']> }) {
  return (
    <div className="chat-feedback__pronunciation">
      <h4 className="chat-feedback__label">Pronunciation · {score(pronunciation.score)}/100</h4>
      <p className="chat-feedback__scores">
        Accuracy {score(pronunciation.accuracy)} · Fluency {score(pronunciation.fluency)}
        {pronunciation.completeness !== null && <> · Completeness {score(pronunciation.completeness)}</>}
      </p>
      {pronunciation.words.length > 0 ? (
        <p className="chat-feedback__words">
          Words to practise:{' '}
          {pronunciation.words.map((word, index) => (
            <span key={word}>
              {index > 0 && ', '}
              <strong>{word}</strong>
            </span>
          ))}
        </p>
      ) : (
        <p className="chat-feedback__words">Every word was clear.</p>
      )}
    </div>
  );
}
