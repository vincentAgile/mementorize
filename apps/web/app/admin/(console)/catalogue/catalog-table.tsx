'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import type { CatalogList } from '../../../../lib/admin-api';
import { levelLabel } from '../../../../lib/catalog';
import { NBSP } from '../../../../lib/format';
import { SubmitButton } from '../../../lists/row-actions';
import { deleteCatalogListAction } from './actions';
import { CatalogForm } from './catalog-form';

const words = (count: number) => `${count.toLocaleString('fr-FR')}${NBSP}mot${count > 1 ? 's' : ''}`;

/**
 * MEM-116: the predefined lists of the console: Titre (to its words), Niveau,
 * Mots, État (Brouillon or Publiée), and their actions, Modifier and
 * Supprimer, each in a modal <dialog> (Escape or « Annuler » close it); the
 * button « Nouvelle liste » above.
 */
export function CatalogTable({ lists }: { lists: CatalogList[] }) {
  return (
    <section className="item-list catalog" aria-labelledby="catalog-title">
      <div className="catalog__bar">
        <h1 id="catalog-title">Catalogue</h1>
        <NewList />
      </div>
      {lists.length === 0 ? (
        <p className="admin__empty">Aucune liste pour le moment : crée la première avec « Nouvelle liste ».</p>
      ) : (
        <div className="item-list__scroll">
          <table className="item-list__table catalog__table">
            <thead>
              <tr>
                <th scope="col">Titre</th>
                <th scope="col">Niveau</th>
                <th scope="col" className="catalog__number">
                  Mots
                </th>
                <th scope="col">État</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {lists.map((list) => (
                <tr key={list.id}>
                  <th scope="row">
                    <Link href={`/admin/catalogue/${list.id}`}>{list.title}</Link>
                  </th>
                  <td>{levelLabel(list.level)}</td>
                  <td className="catalog__number">{list.entries.toLocaleString('fr-FR')}</td>
                  <td>
                    <span className={list.published ? 'catalog__state is-published' : 'catalog__state'}>
                      {list.published ? 'Publiée' : 'Brouillon'}
                    </span>
                  </td>
                  <td>
                    <ListActions list={list} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** « Nouvelle liste »: the form, empty, in its dialog; a new form each time it opens. */
function NewList() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [key, setKey] = useState(0);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setKey((n) => n + 1);
          dialog.current?.showModal();
        }}
      >
        Nouvelle liste
      </button>
      <dialog ref={dialog} className="dialog dialog--wide" aria-labelledby="catalog-new">
        <h2 id="catalog-new">Nouvelle liste</h2>
        <CatalogForm key={key} idPrefix="catalog-new" />
      </dialog>
    </>
  );
}

/** Modifier and Supprimer, for one list. */
function ListActions({ list }: { list: CatalogList }) {
  const edit = useRef<HTMLDialogElement>(null);
  const remove = useRef<HTMLDialogElement>(null);
  const [key, setKey] = useState(0);
  return (
    <div className="catalog__actions">
      <button
        type="button"
        className="button--secondary"
        aria-label={`Modifier « ${list.title} »`}
        onClick={() => {
          setKey((n) => n + 1);
          edit.current?.showModal();
        }}
      >
        Modifier
      </button>
      <button
        type="button"
        className="button--secondary catalog__delete"
        aria-label={`Supprimer « ${list.title} »`}
        onClick={() => remove.current?.showModal()}
      >
        Supprimer
      </button>

      <dialog ref={edit} className="dialog dialog--wide" aria-labelledby={`catalog-edit-${list.id}`}>
        <h2 id={`catalog-edit-${list.id}`}>Modifier la liste</h2>
        <CatalogForm key={key} list={list} idPrefix={`catalog-edit-${list.id}`} />
      </dialog>

      <dialog ref={remove} className="dialog" aria-labelledby={`catalog-delete-${list.id}`}>
        <h2 id={`catalog-delete-${list.id}`}>
          Supprimer «{NBSP}
          {list.title}
          {NBSP}» ?
        </h2>
        <p className="dialog__hint">
          {list.entries > 0 ? `Ses ${words(list.entries)} seront supprimés aussi.` : 'Elle ne contient aucun mot.'} Les
          vocabulaires des utilisateurs ne changent pas : les mots qu’ils en ont ajoutés restent les leurs.
        </p>
        <form action={deleteCatalogListAction.bind(null, list.id)} className="dialog__buttons">
          <button type="button" className="button--secondary" onClick={() => remove.current?.close()}>
            Annuler
          </button>
          <SubmitButton label="Supprimer" pendingLabel="Suppression…" className="danger-button" />
        </form>
      </dialog>
    </div>
  );
}
