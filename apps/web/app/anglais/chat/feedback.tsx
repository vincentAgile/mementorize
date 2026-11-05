'use client';

import { useState } from 'react';
import { correctedParts, type Evaluation } from '../../../lib/chat';

/**
 * MEM-131: the evaluation of a message, under it, in English: the corrected
 * version (its changes underlined and in bold, not by colour only), the
 * corrections « before → after » with their type and explanation, or
 * « Great, no corrections needed. ».
 */
export function Feedback({ written, evaluation }: { written: string; evaluation: Evaluation }) {
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
      {correct ? (
        <p className="chat-feedback__ok">Great, no corrections needed.</p>
      ) : (
        <>
          <h4 className="chat-feedback__label">Corrected version</h4>
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
