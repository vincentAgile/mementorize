/** A link of the « Ressources » page: its title and its address. */
export interface Resource {
  title: string;
  url: string;
}

/** The « Ressources » page: reading on memory and learning, in this order. */
export const RESOURCES: Resource[] = [
  { title: 'La courbe de l’oubli', url: 'https://www.mondelangues.fr/repetition-espacee-et-cartes-memoire' },
  {
    title: 'Apprentissages (David Louapre)',
    url: 'https://scienceetonnante.com/blog/2023/09/01/mieux-apprendre-etudier-les-vraies-techniques-scientifiques/',
  },
];

/** The site of a link, shown under its title: « scienceetonnante.com ». */
export const siteOf = (url: string) => new URL(url).hostname.replace(/^www\./, '');
