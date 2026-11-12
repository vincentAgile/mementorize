import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  type AiListState,
  formatCount,
  formatDay,
  formatMonth,
  STATE_LABELS,
  userHref,
} from '../../../../lib/admin-ai-lists';

export interface UsageColumn<T> {
  label: string;
  value: (row: T) => number;
  /** In the row « 30 jours »: the sum, unless it means nothing (the active users of each day). */
  total?: boolean;
}

interface TopUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

const name = (user: TopUser) => [user.firstName, user.lastName].filter(Boolean).join(' ');

/**
 * MEM-135/143: the consumption of one feature of the AI: its state and its
 * limits, a row per day over the last 30 days with their totals, and the 10
 * biggest users of the month, with a link to their « fiche ». Numbers only.
 */
export function UsageSection<D extends { day: string }, U extends TopUser>({
  id,
  title,
  state,
  limits,
  hint,
  days,
  dayColumns,
  isEmpty,
  month,
  top,
  topColumns,
  noTop,
}: {
  id: string;
  title: string;
  state: AiListState;
  /** « 10 générations par utilisateur et par jour ». */
  limits: ReactNode;
  /** Why the state is not « Active ». */
  hint: string | null;
  days: D[];
  dayColumns: UsageColumn<D>[];
  isEmpty: (day: D) => boolean;
  month: string;
  top: U[];
  topColumns: UsageColumn<U>[];
  noTop: string;
}) {
  return (
    <section className="admin-usage" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>{title}</h2>
      <p>
        État :{' '}
        <strong className={state === 'active' ? 'admin-settings__on' : 'admin-settings__off'}>
          {STATE_LABELS[state]}
        </strong>{' '}
        · {limits} · <Link href={`/admin/parametres#${id}-settings`}>Modifier</Link>
      </p>
      {hint && <p className="settings__hint">{hint}</p>}

      <div className="admin-usage__scroll">
        <table className="admin-usage__table">
          <caption>Par jour, sur les 30 derniers jours</caption>
          <thead>
            <tr>
              <th scope="col">Jour</th>
              {dayColumns.map((column) => (
                <th key={column.label} scope="col">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map((day) => (
              <tr key={day.day} className={isEmpty(day) ? 'is-empty' : undefined}>
                <th scope="row">
                  <time dateTime={day.day}>{formatDay(day.day)}</time>
                </th>
                {dayColumns.map((column) => (
                  <td key={column.label}>{formatCount(column.value(day))}</td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">30 jours</th>
              {dayColumns.map((column) =>
                column.total === false ? (
                  <td key={column.label} aria-label="Sans objet">
                    —
                  </td>
                ) : (
                  <td key={column.label}>{formatCount(days.reduce((sum, day) => sum + column.value(day), 0))}</td>
                ),
              )}
            </tr>
          </tfoot>
        </table>
      </div>

      <h3 id={`${id}-top-title`}>Les 10 plus gros utilisateurs de {formatMonth(month)}</h3>
      {top.length === 0 ? (
        <p className="settings__hint">{noTop}</p>
      ) : (
        <div className="admin-usage__scroll">
          <table className="admin-usage__table" aria-labelledby={`${id}-top-title`}>
            <thead>
              <tr>
                <th scope="col">Utilisateur</th>
                {topColumns.map((column) => (
                  <th key={column.label} scope="col">
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {top.map((user) => (
                <tr key={user.id}>
                  <th scope="row">
                    <Link href={userHref(user.email)}>{user.email}</Link>
                    {name(user) && <span className="admin-usage__name">{name(user)}</span>}
                  </th>
                  {topColumns.map((column) => (
                    <td key={column.label}>{formatCount(column.value(user))}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
