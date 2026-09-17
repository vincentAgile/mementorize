# Mementorize

Application de mémorisation à long terme (quotes, vocabulaire anglais, cartes mentales), basée sur la courbe de l'oubli. Un système d'autoévaluation détermine, pour chaque élément, le bon moment pour le réviser.

Projet personnel de veille technique : chaque phase de développement est aussi l'occasion d'explorer une brique de l'écosystème JS/TS moderne et d'une chaîne de déploiement complète (Docker, Traefik, GitHub Actions).

## Statut

✅ **Phase 2 terminée.** `apps/web` (Next.js) liste et ajoute des quotes en consommant l'API `apps/api`.
🚧 **Phase 3 — Authentification.** Pas encore commencée.

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
docker compose up -d              # PostgreSQL
pnpm install                      # installe + génère le client Prisma (postinstall)
pnpm --filter api prisma:migrate  # crée le schéma en base
pnpm dev                          # lance apps/* en mode watch (turbo)
```

Détails spécifiques à l'API : voir [apps/api/README.md](./apps/api/README.md).

## Conventions

Voir [CONTRIBUTING.md](./CONTRIBUTING.md) pour les conventions de branches et de commits.

## Feuille de route

Le détail des phases (apprentissages visés, livrables, technos) vit dans le document de suivi partagé, hors de ce repo.
