'use client';

import { Fragment, useId, useMemo, useState } from 'react';
import type { AdminUserRow, SpaceCounts, StatusCounts } from '../../../lib/admin-api';
import {
  DEFAULT_USER_SORT,
  fullDate,
  fullName,
  lastActivity,
  nextUserSort,
  searchUsers,
  shortDate,
  sortUsers,
  type UserSort,
  type UserSortKey,
} from '../../../lib/admin-users';
import { NBSP } from '../../../lib/format';
import { PAGE_SIZES } from '../../../lib/item-list';
import { Pagination } from '../../lists/pagination';

const USER_NOUN = { one: 'utilisateur', many: 'utilisateurs', feminine: false };

const COLUMNS: { key: UserSortKey; label: string; numeric?: boolean }[] = [
  { key: 'user', label: 'Utilisateur' },
  { key: 'createdAt', label: 'Inscrit le' },
  { key: 'lastActiveAt', label: 'Dernière activité' },
  { key: 'Vocabulary', label: 'Anglais', numeric: true },
  { key: 'Quote', label: 'Citations', numeric: true },
  { key: 'MindMap', label: 'Cartes mentales', numeric: true },
  { key: 'total', label: 'Total', numeric: true },
];

const count = (value: number) => value.toLocaleString('fr-FR');
const plural = (value: number, one: string, many: string) => `${count(value)}${NBSP}${value > 1 ? many : one}`;

/** « En attente 120 · À apprendre 15 · En cours 190 · Appris 17 ». */
function statusLine(counts: StatusCounts): string {
  return [
    `En attente ${count(counts.Waiting)}`,
    `À apprendre ${count(counts.ToLearn)}`,
    `En cours d’apprentissage ${count(counts.Learning)}`,
    `Appris ${count(counts.Learned)}`,
  ].join(' · ');
}

/** The detail of a row (or of the totals): each space, per state. */
function Detail({ counts }: { counts: SpaceCounts }) {
  const { MindMap } = counts;
  return (
    <dl className="admin-users__detail">
      <dt>Anglais</dt>
      <dd>{statusLine(counts.Vocabulary)}</dd>
      <dt>Citations</dt>
      <dd>{statusLine(counts.Quote)}</dd>
      <dt>Cartes mentales</dt>
      <dd>
        {plural(MindMap.total, 'carte', 'cartes')} · {plural(MindMap.branchesInReview, 'branche', 'branches')} en
        révision · {plural(MindMap.branchesLearned, 'branche apprise', 'branches apprises')}
      </dd>
    </dl>
  );
}

/** The button that opens the detail of a row. */
function Toggle({
  open,
  onClick,
  label,
  controls,
}: {
  open: boolean;
  onClick: () => void;
  label: string;
  controls: string;
}) {
  return (
    <button
      type="button"
      className="admin-users__toggle"
      aria-expanded={open}
      aria-controls={controls}
      onClick={onClick}
    >
      <span aria-hidden="true">{open ? '▾' : '▸'}</span>
      <span className="visually-hidden">Détail par état : {label}</span>
    </button>
  );
}

/**
 * MEM-84: the users of the console. Search on the e-mail and the name, sort
 * by column (the most recent activity first by default), pages of 20, 50
 * or 100; each row opens on the detail of its counters, as the row of the
 * totals of all the users.
 */
export function UsersTable({ users, totals, now }: { users: AdminUserRow[]; totals: SpaceCounts; now: string }) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<UserSort>(DEFAULT_USER_SORT);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[0]);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const searchId = useId();
  const date = useMemo(() => new Date(now), [now]);

  const shown = useMemo(() => sortUsers(searchUsers(users, search), sort), [users, search, sort]);
  const pageCount = Math.max(1, Math.ceil(shown.length / pageSize));
  const current = Math.min(page, pageCount);
  const pageRows = shown.slice((current - 1) * pageSize, current * pageSize);

  const toggle = (id: string) =>
    setOpen((before) => {
      const next = new Set(before);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <section className="item-list admin-users" aria-label="Utilisateurs">
      <div className="admin-users__bar">
        <div className="item-list__filters">
          <label htmlFor={searchId} className="visually-hidden">
            Rechercher par e-mail ou par nom
          </label>
          <input
            id={searchId}
            type="search"
            placeholder="Rechercher par e-mail ou par nom"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </div>
        <p className="item-list__count" aria-live="polite">
          {search.trim()
            ? `${count(shown.length)} sur ${plural(users.length, 'utilisateur', 'utilisateurs')}`
            : plural(users.length, 'utilisateur', 'utilisateurs')}
        </p>
      </div>

      <div className="item-list__scroll">
        <table className="item-list__table admin-users__table">
          <thead>
            <tr>
              <th scope="col" className="admin-users__toggle-cell">
                <span className="visually-hidden">Détail</span>
              </th>
              {COLUMNS.map((column) => {
                const active = sort.key === column.key;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    className={column.numeric ? 'admin-users__number' : undefined}
                    aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSort(nextUserSort(sort, column.key));
                        setPage(1);
                      }}
                    >
                      {column.label}
                      <span className="item-list__arrow" aria-hidden="true">
                        {active ? (sort.direction === 'asc' ? '▲' : '▼') : '↕'}
                      </span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length + 1} className="item-list__none">
                  Aucun utilisateur ne correspond à la recherche.
                </td>
              </tr>
            )}
            {pageRows.map((user) => {
              const name = fullName(user);
              const isOpen = open.has(user.id);
              const detailId = `detail-${user.id}`;
              return (
                <Fragment key={user.id}>
                  <tr className={isOpen ? 'is-open' : undefined}>
                    <td className="admin-users__toggle-cell">
                      <Toggle open={isOpen} onClick={() => toggle(user.id)} label={user.email} controls={detailId} />
                    </td>
                    <th scope="row" className="admin-users__user">
                      <span className="admin-users__email">{user.email}</span>
                      {name && <span className="admin-users__name">{name}</span>}
                    </th>
                    <td>{shortDate(user.createdAt)}</td>
                    <td>
                      {user.lastActiveAt ? (
                        <>
                          <span className="admin-users__date">{fullDate(user.lastActiveAt)}</span>
                          <span className="admin-users__ago">{lastActivity(user.lastActiveAt, date)}</span>
                        </>
                      ) : (
                        <span className="admin-users__ago">jamais</span>
                      )}
                    </td>
                    <td className="admin-users__number">{count(user.counts.Vocabulary.total)}</td>
                    <td className="admin-users__number">{count(user.counts.Quote.total)}</td>
                    <td className="admin-users__number">{count(user.counts.MindMap.total)}</td>
                    <td className="admin-users__number">{count(user.counts.total)}</td>
                  </tr>
                  {isOpen && (
                    <tr id={detailId} className="admin-users__detail-row">
                      <td />
                      <td colSpan={COLUMNS.length}>
                        <Detail counts={user.counts} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr className={open.has('totals') ? 'is-open' : undefined}>
              <td className="admin-users__toggle-cell">
                <Toggle
                  open={open.has('totals')}
                  onClick={() => toggle('totals')}
                  label="tous les utilisateurs"
                  controls="detail-totals"
                />
              </td>
              <th scope="row" colSpan={3}>
                Tous les utilisateurs
              </th>
              <td className="admin-users__number">{count(totals.Vocabulary.total)}</td>
              <td className="admin-users__number">{count(totals.Quote.total)}</td>
              <td className="admin-users__number">{count(totals.MindMap.total)}</td>
              <td className="admin-users__number">{count(totals.total)}</td>
            </tr>
            {open.has('totals') && (
              <tr id="detail-totals" className="admin-users__detail-row">
                <td />
                <td colSpan={COLUMNS.length}>
                  <Detail counts={totals} />
                </td>
              </tr>
            )}
          </tfoot>
        </table>
      </div>

      <Pagination
        noun={USER_NOUN}
        page={current}
        pageCount={pageCount}
        pageSize={pageSize}
        onPage={setPage}
        onPageSize={(size) => {
          setPageSize(size);
          setPage(1);
        }}
      />
    </section>
  );
}
