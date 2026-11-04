import Link from 'next/link';
import { separatorName } from '../../../lib/csv-separator';
import { countOf, ITEM_NOUN } from '../../../lib/nouns';

/**
 * MEM-122: « Exporter en CSV », above the table of « Ma liste »: every card,
 * whatever the filter, the page or the selection (MEM-52), with the separator
 * chosen in the settings (MEM-55), recalled here. A plain link: the route
 * sends the file, the browser downloads it.
 */
export function ListExport({ count, separator }: { count: number; separator: string }) {
  const all = `Exporte les ${countOf(count, ITEM_NOUN)}`;
  return (
    <div className="list-export">
      <a href="/anglais/liste/export" className="list-export__button" download title={all}>
        Exporter en CSV
      </a>
      <span className="list-export__info">
        {count > 1 ? `${all}, quel que soit leur état` : 'Exporte la carte, quel que soit son état'} · séparateur{' '}
        <strong>{separatorName(separator)}</strong> · <Link href="/reglages/saisie#csv">Changer dans les Réglages</Link>
      </span>
    </div>
  );
}
