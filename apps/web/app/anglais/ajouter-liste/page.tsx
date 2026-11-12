import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { AI_LIST_HREF, DAILY_LIMIT, UNAVAILABLE } from '../../../lib/ai-lists';
import { getAiListStatus, getCatalogLists } from '../../../lib/api';

export const metadata: Metadata = { title: 'Ajouter une liste · Anglais' };

/**
 * Tab « Ajouter une liste » of the Anglais space (MEM-123): several cards at
 * once, three ways, as three large links: cards proposed by the AI (MEM-140),
 * off without an AI or once the generations of the day are used; a predefined list (MEM-118), off while none is
 * published; or a CSV file (MEM-53). The cards join « Ma liste »: never a
 * list apart.
 */
export default async function AddListPage() {
  const [lists, ai] = await Promise.all([getCatalogLists(), getAiListStatus()]);
  const aiOff = !ai.enabled ? UNAVAILABLE : ai.remaining <= 0 ? DAILY_LIMIT : null;
  return (
    <section className="add-list" aria-labelledby="add-list-title">
      <h2 id="add-list-title" className="add-list__title">
        Ajouter une liste
      </h2>
      <p className="add-list__intro">Plusieurs cartes d’un coup, ajoutées à Ma liste. Choisis d’où elles viennent :</p>
      <ul className="add-list__choices">
        <li>
          <Choice href={aiOff ? null : AI_LIST_HREF} title="Générer avec l’IA" icon={<SparkIcon />} id="choice-ai">
            Choisis un niveau et un thème, l’IA te propose des cartes.
            {aiOff && <strong className="add-list__off"> {aiOff}</strong>}
          </Choice>
        </li>
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

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path
        d="M11 3.5 12.6 8a3 3 0 0 0 1.9 1.9L19 11.5l-4.5 1.6a3 3 0 0 0-1.9 1.9L11 19.5 9.4 15a3 3 0 0 0-1.9-1.9L3 11.5 7.5 9.9A3 3 0 0 0 9.4 8z"
        strokeLinejoin="round"
      />
      <path d="M18.5 3v3.5M16.75 4.75h3.5" strokeLinecap="round" />
    </svg>
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
