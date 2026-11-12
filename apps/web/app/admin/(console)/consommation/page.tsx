import type { Metadata } from 'next';
import Link from 'next/link';
import {
  formatCount,
  formatDay,
  formatMonth,
  STATE_HINTS,
  STATE_LABELS,
  totalsOf,
  userHref,
} from '../../../../lib/admin-ai-lists';
import { getAiListSettings, getAiListUsage } from '../../../../lib/admin-api';

export const metadata: Metadata = { title: 'Consommation IA' };

const name = (user: { firstName: string | null; lastName: string | null }) =>
  [user.firstName, user.lastName].filter(Boolean).join(' ');

/**
 * MEM-143: what the generations of cards by the AI cost: per day over the
 * last 30 days (generations, active users, cards proposed and added, tokens)
 * and the 10 biggest users of the month, with a link to their « fiche ».
 * Numbers only: no theme typed, no card.
 */
export default async function AiUsagePage() {
  const [settings, report] = await Promise.all([getAiListSettings(), getAiListUsage()]);
  const totals = totalsOf(report.days);
  return (
    <>
      <h1>Consommation IA</h1>
      <section className="admin-usage" aria-labelledby="ai-lists-usage-title">
        <h2 id="ai-lists-usage-title">Consommation de la génération de cartes</h2>
        <p>
          État :{' '}
          <strong className={settings.state === 'active' ? 'admin-settings__on' : 'admin-settings__off'}>
            {STATE_LABELS[settings.state]}
          </strong>{' '}
          · {formatCount(settings.generationsPerDay)} générations par utilisateur et par jour ·{' '}
          <Link href="/admin/parametres#ai-lists-title">Modifier</Link>
        </p>
        {settings.state !== 'active' && <p className="settings__hint">{STATE_HINTS[settings.state]}</p>}

        <div className="admin-usage__scroll">
          <table className="admin-usage__table">
            <caption>Par jour, sur les 30 derniers jours</caption>
            <thead>
              <tr>
                <th scope="col">Jour</th>
                <th scope="col">Générations</th>
                <th scope="col">Utilisateurs actifs</th>
                <th scope="col">Cartes proposées</th>
                <th scope="col">Cartes ajoutées</th>
                <th scope="col">Jetons d’entrée</th>
                <th scope="col">Jetons de sortie</th>
              </tr>
            </thead>
            <tbody>
              {report.days.map((day) => (
                <tr key={day.day} className={day.generations === 0 && day.added === 0 ? 'is-empty' : undefined}>
                  <th scope="row">
                    <time dateTime={day.day}>{formatDay(day.day)}</time>
                  </th>
                  <td>{formatCount(day.generations)}</td>
                  <td>{formatCount(day.activeUsers)}</td>
                  <td>{formatCount(day.proposed)}</td>
                  <td>{formatCount(day.added)}</td>
                  <td>{formatCount(day.inputTokens)}</td>
                  <td>{formatCount(day.outputTokens)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">30 jours</th>
                <td>{formatCount(totals.generations)}</td>
                <td aria-label="Sans objet">—</td>
                <td>{formatCount(totals.proposed)}</td>
                <td>{formatCount(totals.added)}</td>
                <td>{formatCount(totals.inputTokens)}</td>
                <td>{formatCount(totals.outputTokens)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <h3 id="ai-lists-top-title">Les 10 plus gros utilisateurs de {formatMonth(report.month)}</h3>
        {report.top.length === 0 ? (
          <p className="settings__hint">Aucune génération ce mois-ci.</p>
        ) : (
          <div className="admin-usage__scroll">
            <table className="admin-usage__table" aria-labelledby="ai-lists-top-title">
              <thead>
                <tr>
                  <th scope="col">Utilisateur</th>
                  <th scope="col">Générations</th>
                  <th scope="col">Jetons d’entrée</th>
                  <th scope="col">Jetons de sortie</th>
                </tr>
              </thead>
              <tbody>
                {report.top.map((user) => (
                  <tr key={user.id}>
                    <th scope="row">
                      <Link href={userHref(user.email)}>{user.email}</Link>
                      {name(user) && <span className="admin-usage__name">{name(user)}</span>}
                    </th>
                    <td>{formatCount(user.generations)}</td>
                    <td>{formatCount(user.inputTokens)}</td>
                    <td>{formatCount(user.outputTokens)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="settings__hint">
          Des compteurs seulement : ni les thèmes saisis ni les cartes ne sont enregistrés pour la console. Conservés 13
          mois.
        </p>
      </section>
    </>
  );
}
