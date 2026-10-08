# Mementorize

Application de mémorisation à long terme (citations, vocabulaire anglais, cartes mentales), basée sur la courbe de l'oubli. Un système d'autoévaluation détermine, pour chaque élément, le bon moment pour le réviser.

Projet personnel de veille technique : chaque phase de développement est aussi l'occasion d'explorer une brique de l'écosystème JS/TS moderne et d'une chaîne de déploiement complète (Docker, Traefik, GitHub Actions).

## Statut

✅ **Phase 2 terminée.** `apps/web` (Next.js) liste et ajoute des quotes en consommant l'API `apps/api`.
✅ **Phase 3 terminée.** Inscription / connexion (JWT + Passport côté API, cookie de session httpOnly côté Next.js) ; chaque utilisateur ne voit que ses quotes.
✅ **Phase 4 terminée.** Répétition espacée : algorithme FSRS (ts-fsrs), historique des révisions, écran « À réviser » avec auto-évaluation.
✅ **Phase 5 terminée.** Table `items` polymorphe (jsonb), vocabulaire anglais révisé dans les deux sens, migration qui conserve les citations et leur historique.
✅ **Phase 6 terminée.** Cartes mentales interactives : éditeur @xyflow/react, arbre stocké en jsonb, une carte de révision par branche (branche masquée à retrouver).
✅ **Phase 7 terminée.** Conteneurisation complète : Dockerfiles multi-stage (API, web), `docker compose up` lance base, migrations, API et web, réseaux isolés et healthchecks.
✅ **Phase 8 terminée.** En ligne sur un VPS OVH, derrière Traefik, en HTTPS (Let's Encrypt) : https://mementorize.delaneuville.fr — guide dans [deploy/README.md](./deploy/README.md).
🚧 **Phase 9 — Intégration continue.** Pas encore commencée (GitHub Actions : lint et tests sur chaque push et pull request).

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
deploy/      # Mise en production sur le VPS : Traefik et guide pas à pas (phase 8)
```

Le monorepo est géré avec **pnpm workspaces** + **Turborepo** pour orchestrer les tâches (`build`, `dev`, `lint`, `test`) et mettre en cache ce qui n'a pas changé.

## Prérequis

- Docker (avec Docker Compose) : pour la base de données, ou pour toute l'application
- Pour développer : Node.js 24 (voir `.nvmrc`) et pnpm, activé via Corepack : `corepack enable`

## Démarrage

Deux façons de lancer l'application.

### Tout en conteneurs

Rien d'autre à installer que Docker :

```bash
cp .env.example .env              # une seule fois, puis remplacer JWT_SECRET
docker compose up --build         # web + api + base de données → http://localhost:3001
```

`docker compose down` arrête tout en gardant les données ; `docker compose down -v` efface aussi la base.

### En production

Sur le VPS, derrière Traefik et en HTTPS : voir le guide [deploy/README.md](./deploy/README.md).

### En développement (rechargement à chaud)

```bash
docker compose up -d postgres     # PostgreSQL seulement
pnpm install                      # installe + génère le client Prisma (postinstall)
# (une seule fois) créer apps/api/.env et apps/web/.env.local depuis leurs .env.example
pnpm --filter api prisma:migrate  # crée le schéma en base
pnpm dev                          # lance apps/* en mode watch (turbo)
```

Les deux modes partagent la même base (même volume Docker) : on peut passer de l'un à l'autre. Ils utilisent en revanche les mêmes ports (3000 et 3001 pour `pnpm dev`, 3001 pour les conteneurs) : arrêter l'un avant de lancer l'autre.

Détails spécifiques à chaque app : [apps/api/README.md](./apps/api/README.md), [apps/web/README.md](./apps/web/README.md).

## Conteneurisation (phase 7)

```
navigateur ──3001──▶ web ──(frontend)──▶ api ──(backend)──▶ postgres
                                                  migrate ──┘
```

| service    | image | rôle |
|------------|-------|------|
| `postgres` | `postgres:16-alpine` | la base ; publiée sur `127.0.0.1:5432` seulement, pour `pnpm dev` |
| `migrate`  | `apps/api/Dockerfile`, cible `migrate` | applique les migrations (`prisma migrate deploy`) puis s'arrête |
| `api`      | `apps/api/Dockerfile`, cible `runtime` | l'API NestJS ; démarre une fois `migrate` terminé avec succès |
| `web`      | `apps/web/Dockerfile` | le serveur Next.js ; démarre une fois l'API déclarée en bonne santé |

**Ordre de démarrage.** `depends_on` avec conditions : `postgres` *healthy* (`pg_isready`) → `migrate` *completed successfully* → `api` *healthy* (`GET /health`, qui interroge aussi la base) → `web`. Sans ces conditions, les services démarreraient en même temps et l'API tenterait de se connecter à une base pas encore prête.

**Isolation.** Seul `web` est publié sur la machine hôte. L'API n'est joignable que par `web`, sur le réseau `frontend` (le navigateur ne l'appelle jamais directement, voir [apps/web/README.md](./apps/web/README.md)) ; la base n'est que sur le réseau `backend`, que `web` ne voit pas. Les conteneurs s'adressent les uns aux autres par nom de service (`http://api:3000`, `postgres:5432`), résolu par le DNS de Docker.

**Configuration.** Tout passe par des variables d'environnement, lues dans un fichier `.env` à la racine (modèle : `.env.example`, ignoré par git). Les images ne contiennent aucun secret : le même build peut tourner en local et, plus tard, en production avec d'autres valeurs.

**Dockerfiles multi-stage.** Chaque image est construite en plusieurs étapes ; seule la dernière est livrée :

1. `prune` — `turbo prune <app> --docker` extrait du monorepo ce dont l'app a besoin, en séparant les `package.json` + lockfile (`out/json`) des sources (`out/full`) ;
2. `build` — installe les dépendances (couche mise en cache tant que le lockfile ne change pas, même si le code change), compile ;
3. image finale — Node seul, le code compilé et les dépendances de production, sous l'utilisateur non privilégié `node`. Ni sources, ni outils de build, ni dépendances de développement.

Le build se lance depuis la racine (le contexte Docker est tout le monorepo, filtré par `.dockerignore`) : chaque Dockerfile vit à côté de son app mais a besoin du lockfile et de la config pnpm de la racine.

## Conventions

Voir [CONTRIBUTING.md](./CONTRIBUTING.md) pour les conventions de branches et de commits.

## Feuille de route

Le détail des phases (apprentissages visés, livrables, technos) vit dans le document de suivi partagé, hors de ce repo.
