import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { getCatalogLists } from '../../../lib/api';

export const metadata: Metadata = { title: 'Ajouter une liste · Anglais' };

/**
 * Tab « Ajouter une liste » of the Anglais space (MEM-123): several cards at
 * once, two ways, as two large links: a predefined list (MEM-118), off while
 * none is published, or a CSV file (MEM-53). The cards join « Ma liste »:
 * never a list apart.
 */
export default async function AddListPage() {
  const lists = await getCatalogLists();
  return (
    <section className="add-list" aria-labelledby="add-list-title">
      <h2 id="add-list-title" className="add-list__title">
        Ajouter une liste
      </h2>
      <p className="add-list__intro">Plusieurs cartes d’un coup, ajoutées à Ma liste. Choisis d’où elles viennent :</p>
      <ul className="add-list__choices">
        <li>
          <Choice
            href={lists.length > 0 ? '/anglais/ajouter-liste/predefinies' : null}
            title="Liste prédéfinie"
            icon={<ListIcon />}
            id="choice-predefined"
          >
            Choisis une liste par niveau (A1 à C2) proposée par Mementorize.
            {lists.length === 0 && <strong className="add-list__off"> Aucune liste disponible pour le moment.</strong>}
          </Choice>
        </li>
        <li>
          <Choice
            href="/anglais/ajouter-liste/fichier"
            title="Importer un fichier"
            icon={<FileIcon />}
            id="choice-file"
          >
            Charge un fichier CSV de cartes, par exemple exporté depuis Ma liste.
          </Choice>
        </li>
      </ul>
    </section>
  );
}

/** A choice: a link with its explanation (read with it by screen readers), or off without its destination. */
function Choice({
  href,
  title,
  icon,
  id,
  children,
}: {
  href: string | null;
  title: string;
  icon: ReactNode;
  id: string;
  children: ReactNode;
}) {
  const content = (
    <>
      <span className="add-list__icon" aria-hidden="true">
        {icon}
      </span>
      <span className="add-list__name">{title}</span>
      <span id={`${id}-text`} className="add-list__text">
        {children}
      </span>
    </>
  );
  if (!href) {
    return (
      <div className="add-list__choice is-disabled" aria-disabled="true" aria-describedby={`${id}-text`}>
        {content}
      </div>
    );
  }
  return (
    <Link href={href} className="add-list__choice" aria-describedby={`${id}-text`}>
      {content}
    </Link>
  );
}

function ListIcon() {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3.5" y="3.5" width="17" height="17" rx="2.5" />
      <path d="M7.5 8.5h9M7.5 12h9M7.5 15.5h5" strokeLinecap="round" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M6 3.5h8l4 4v13H6z" strokeLinejoin="round" />
      <path d="M14 3.5v4h4M12 11v6M9.5 14.5 12 17l2.5-2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
