import type { Mail } from '../mail/mail.service.js';

export interface ReminderLinks {
  review: string;
  settings: string;
  unsubscribe: string;
}

/** Content of the reminder e-mail (and of the test e-mail). */
export function reminderEmail(to: string, dueCount: number, links: ReminderLinks, isTest = false): Mail {
  const cards = dueCount === 1 ? '1 carte' : `${dueCount} cartes`;
  const subject = isTest ? 'Mementorize : e-mail de test' : `Mementorize : ${cards} à réviser aujourd'hui`;
  const lead = isTest
    ? `Les rappels fonctionnent. Tu as en ce moment ${dueCount === 0 ? 'aucune carte' : cards} à réviser.`
    : `Tu as ${cards} à réviser aujourd'hui. Quelques minutes suffisent pour garder tout ça en mémoire.`;

  const text = [
    lead,
    '',
    `Réviser maintenant : ${links.review}`,
    '',
    '--',
    `Choisir l'heure du rappel : ${links.settings}`,
    `Ne plus recevoir ces rappels : ${links.unsubscribe}`,
  ].join('\n');

  // Nothing typed by a user ends up in the e-mail: no HTML escaping needed.
  const html = `<!doctype html>
<html lang="fr">
  <body style="font-family: system-ui, sans-serif; line-height: 1.5; color: #1f2328; max-width: 32rem; margin: 0 auto; padding: 1rem">
    <h1 style="font-size: 1.25rem">Mementorize</h1>
    <p>${lead}</p>
    <p>
      <a href="${links.review}" style="display: inline-block; padding: 0.6rem 1rem; background: #147d80; color: #ffffff; border-radius: 6px; text-decoration: none">Réviser maintenant</a>
    </p>
    <p style="font-size: 0.85rem; color: #57606a">
      <a href="${links.settings}" style="color: #57606a">Choisir l'heure du rappel</a> ·
      <a href="${links.unsubscribe}" style="color: #57606a">Ne plus recevoir ces rappels</a>
    </p>
  </body>
</html>`;

  return {
    to,
    subject,
    text,
    html,
    // Mail clients show their own "Unsubscribe" button with it.
    headers: { 'List-Unsubscribe': `<${links.unsubscribe}>` },
  };
}
