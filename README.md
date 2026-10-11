# Mementorize

[![CI](https://github.com/vincentAgile/mementorize/actions/workflows/ci.yml/badge.svg)](https://github.com/vincentAgile/mementorize/actions/workflows/ci.yml)

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
✅ **Phase 9 terminée.** Intégration continue avec GitHub Actions : formatage, lint, tests unitaires, build, migrations et tests e2e sur PostgreSQL, images Docker, sur chaque pull request.
✅ **Phase 10 terminée.** Déploiement continu : chaque push sur `main` part en production (images publiées sur GHCR par la CI, déploiement par SSH, sauvegarde et migrations dans le pipeline), sans coupure de service.
🚧 **Phase 11 — Observabilité et rappels.** Pas encore commencée (dont la sauvegarde automatique de la base).

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
deploy/      # Production sur le VPS : Traefik, scripts de déploiement, guide pas à pas (phases 8 et 10)
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

| service    | image                                  | rôle                                                                |
| ---------- | -------------------------------------- | ------------------------------------------------------------------- |
| `postgres` | `postgres:16-alpine`                   | la base ; publiée sur `127.0.0.1:5432` seulement, pour `pnpm dev`   |
| `migrate`  | `apps/api/Dockerfile`, cible `migrate` | applique les migrations (`prisma migrate deploy`) puis s'arrête     |
| `api`      | `apps/api/Dockerfile`, cible `runtime` | l'API NestJS ; démarre une fois `migrate` terminé avec succès       |
| `web`      | `apps/web/Dockerfile`                  | le serveur Next.js ; démarre une fois l'API déclarée en bonne santé |

**Ordre de démarrage.** `depends_on` avec conditions : `postgres` _healthy_ (`pg_isready`) → `migrate` _completed successfully_ → `api` _healthy_ (`GET /health`, qui interroge aussi la base) → `web`. Sans ces conditions, les services démarreraient en même temps et l'API tenterait de se connecter à une base pas encore prête.

**Isolation.** Seul `web` est publié sur la machine hôte. L'API n'est joignable que par `web`, sur le réseau `frontend` (le navigateur ne l'appelle jamais directement, voir [apps/web/README.md](./apps/web/README.md)) ; la base n'est que sur le réseau `backend`, que `web` ne voit pas. Les conteneurs s'adressent les uns aux autres par nom de service (`http://api:3000`, `postgres:5432`), résolu par le DNS de Docker.

**Configuration.** Tout passe par des variables d'environnement, lues dans un fichier `.env` à la racine (modèle : `.env.example`, ignoré par git). Les images ne contiennent aucun secret : le même build peut tourner en local et, plus tard, en production avec d'autres valeurs.

**Dockerfiles multi-stage.** Chaque image est construite en plusieurs étapes ; seule la dernière est livrée :

1. `prune` — `turbo prune <app> --docker` extrait du monorepo ce dont l'app a besoin, en séparant les `package.json` + lockfile (`out/json`) des sources (`out/full`) ;
2. `build` — installe les dépendances (couche mise en cache tant que le lockfile ne change pas, même si le code change), compile ;
3. image finale — Node seul, le code compilé et les dépendances de production, sous l'utilisateur non privilégié `node`. Ni sources, ni outils de build, ni dépendances de développement.

Le build se lance depuis la racine (le contexte Docker est tout le monorepo, filtré par `.dockerignore`) : chaque Dockerfile vit à côté de son app mais a besoin du lockfile et de la config pnpm de la racine.

## Intégration continue (phase 9)

Chaque pull request, et chaque push sur `main`, déclenche [`.github/workflows/ci.yml`](./.github/workflows/ci.yml) : six jobs indépendants, lancés en parallèle (environ une minute au total).

| job                     | vérifie                                                                                                                                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Formatage               | `pnpm format:check` : tout le dépôt suit la configuration Prettier (`.prettierrc.json`)                                                                                                                                                          |
| Lint                    | `pnpm lint` : oxlint pour l'API, ESLint pour le web                                                                                                                                                                                              |
| Tests unitaires         | `pnpm test` (Vitest)                                                                                                                                                                                                                             |
| Build                   | `pnpm build` : compile l'API et le web, ce qui vérifie aussi les types                                                                                                                                                                           |
| Migrations et tests e2e | sur un vrai PostgreSQL (_service container_) : les migrations, rejouées depuis zéro, correspondent exactement à `schema.prisma` (`prisma migrate diff --exit-code`), s'appliquent sur une base vide, puis les tests e2e de l'API tournent dessus |
| Images Docker           | construit les trois images (`api`, `migrate`, `web`) : un Dockerfile cassé est repéré ici, pas au déploiement. Sur `main`, les publie aussi sur GHCR (voir ci-dessous)                                                                           |

- **Caches** : le store pnpm (les paquets téléchargés) est mis en cache par `actions/setup-node`, indexé sur le lockfile ; le cache de Turborepo (`.turbo/cache`) permet de rejouer sans les relancer les tâches dont les entrées n'ont pas changé.
- **Mise en place commune** : [`.github/actions/setup`](./.github/actions/setup/action.yml), une action locale (pnpm, Node, caches, `pnpm install --frozen-lockfile`) partagée par les jobs.
- **Un nouveau push annule le passage en cours** sur la même PR (`concurrency`), et le jeton fourni au workflow est en lecture seule.

Avant de pousser, les mêmes vérifications en local :

```bash
pnpm format        # corrige le formatage (ou format:check pour vérifier seulement)
pnpm lint && pnpm test && pnpm build
```

## Déploiement continu (phase 10)

Un push sur `main` (en pratique, la fusion d'une pull request) part en production tout seul, sans coupure de service :

```
push sur main ──▶ CI (ci.yml) ──vert──▶ Deploy (deploy.yml) ──SSH──▶ VPS : deploy/deploy.sh
                   └─ images publiées sur ghcr.io,                         ├─ git checkout <commit>
                      étiquetées par commit                                └─ deploy/release.sh
```

1. **La CI publie les images.** Sur `main`, le job « Images Docker » pousse `ghcr.io/vincentagile/mementorize-{api,migrate,web}`, étiquetées avec le SHA du commit (et `main`). Le serveur ne construit plus rien : il exécute exactement ce que la CI a testé.
2. **Le workflow Deploy** se lance quand la CI d'un push sur `main` est au vert. Il se connecte au VPS avec une clé SSH dédiée, qui ne peut lancer que `deploy/deploy.sh`, et lui passe le commit (et, sur l'entrée standard, un jeton GitHub temporaire pour télécharger les images).
3. **Sur le serveur**, `deploy.sh` place le dépôt sur ce commit, puis `release.sh` : télécharge les images, sauvegarde la base, applique les migrations, puis remplace `api` et `web` avec [docker-rollout](https://github.com/wowu/docker-rollout).
4. **Un test de fumée** vérifie que le site répond, depuis l'extérieur.

**Sans coupure.** docker-rollout démarre un second conteneur à côté de l'ancien, attend son _healthcheck_, puis arrête l'ancien. Pour `web`, l'ancien se déclare d'abord en mauvaise santé (`/tmp/drain`), Traefik cesse de lui envoyer des requêtes, et il n'est arrêté qu'ensuite. Pour `api`, que `web` joint par le DNS de Docker, chaque réponse ferme sa connexion (`Connection: close`) : aucune connexion gardée ouverte ne peut être coupée sous les pieds de `web` quand l'ancien conteneur s'arrête. Si le nouveau conteneur ne devient jamais sain, il est supprimé et l'ancien continue de servir. Vérifié sur un banc local (Traefik, trafic continu, 7 remplacements dont un raté exprès) : 0 requête en échec sur plus de 30 000, contre plusieurs centaines par remplacement sans ces précautions.

**Migrations rétrocompatibles.** Elles s'appliquent _avant_ le remplacement : pendant quelques secondes, l'ancienne version du code tourne sur le nouveau schéma. Une migration doit donc rester compatible avec la version précédente : on ajoute (colonne facultative, table) dans une version, on retire dans une suivante, une fois le code qui s'en servait parti.

Mise en place, retour à une version précédente, dépannage : [deploy/README.md](./deploy/README.md#déploiement-continu-phase-10).

## Conventions

Voir [CONTRIBUTING.md](./CONTRIBUTING.md) pour les conventions de branches et de commits.

## Feuille de route

Le détail des phases (apprentissages visés, livrables, technos) vit dans le document de suivi partagé, hors de ce repo.
