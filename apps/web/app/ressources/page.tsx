import type { Metadata } from 'next';
import { RESOURCES, siteOf } from '../../lib/resources';
import { AppHeader } from '../app-header';

export const metadata: Metadata = { title: 'Ressources' };

/** The « Ressources » page, opened from its icon in the header, next to the gear: links on memory and learning, each in a new tab. */
export default function ResourcesPage() {
  return (
    <>
      <AppHeader />
      <main className="page page--reading">
        <h1 className="visually-hidden page__sr-title">Ressources</h1>
        <section className="settings">
          <h2>Ressources</h2>
          <ul className="resources">
            {RESOURCES.map(({ title, url }) => (
              <li key={url}>
                <a href={url} target="_blank" rel="noopener noreferrer" className="resources__link">
                  <span className="resources__title">{title}</span>
                  <span className="resources__site">
                    {siteOf(url)}
                    <span className="visually-hidden"> (nouvel onglet)</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </>
  );
}
