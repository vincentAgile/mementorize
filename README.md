# Mementorize

Application de mémorisation à long terme (citations, vocabulaire anglais, cartes mentales), basée sur la courbe de l'oubli. Un système d'autoévaluation détermine, pour chaque élément, le bon moment pour le réviser.

Projet personnel de veille technique : chaque phase de développement est aussi l'occasion d'explorer une brique de l'écosystème JS/TS moderne et d'une chaîne de déploiement complète (Docker, Traefik, GitHub Actions).

## Statut

🚧 **Phase 0 — Fondations du dépôt.** Aucune application n'est encore branchée : ce commit ne pose que la structure du monorepo.

## Stack cible

- **Frontend** — Next.js (React)
- **API** — NestJS
- **Base de données** — PostgreSQL (via Prisma)
- **Algorithme de révision** — [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs)
- **Cartes mentales** — [@xyflow/react](https://www.npmjs.com/package/@xyflow/react)
- **Conteneurisation** — Docker, Docker Compose, Traefik (HTTPS via Let's Encrypt)
- **CI/CD** — GitHub Actions

## Structure du repo

```
apps/
  api/       # API NestJS (à partir de la phase 1)
  web/       # Interface Next.js (à partir de la phase 2)
packages/    # Code partagé entre apps/* (config, types) — à partir de la phase 5
```

Le monorepo est géré avec **pnpm workspaces** + **Turborepo** pour orchestrer les tâches (`build`, `dev`, `lint`, `test`) et mettre en cache ce qui n'a pas changé.

## Prérequis

- Node.js 22 (voir `.nvmrc`)
- pnpm, activé via Corepack : `corepack enable`

## Démarrage

```bash
pnpm install   # une fois les premiers packages ajoutés (à partir de la phase 1)
pnpm dev
```

## Conventions

Voir [CONTRIBUTING.md](./CONTRIBUTING.md) pour les conventions de branches et de commits.

## Feuille de route

Le détail des phases (apprentissages visés, livrables, technos) vit dans le document de suivi partagé, hors de ce repo.
