# apps/api

API NestJS de Mementorize. Phase 1 de la feuille de route : CRUD sur les quotes, en attendant que le modèle se généralise (phase 5) aux autres types de contenu.

## Démarrer en local

Depuis la racine du monorepo :

```bash
# 1. Démarrer PostgreSQL
docker compose up -d

# 2. Installer les dépendances (génère aussi le client Prisma via postinstall)
pnpm install

# 3. Créer le schéma en base
pnpm --filter api prisma:migrate

# 4. Lancer l'API en mode watch
pnpm --filter api dev
```

L'API écoute sur `http://localhost:3000` par défaut (configurable via `PORT` dans `.env`, voir `.env.example`).

## Tester les routes

```bash
# Créer une quote
curl -X POST http://localhost:3000/quotes \
  -H "Content-Type: application/json" \
  -d '{"text":"The only true wisdom is in knowing you know nothing.","author":"Socrates"}'

# Lister les quotes
curl http://localhost:3000/quotes
```

## Tests

```bash
pnpm --filter api test
```

Le `QuotesService` est testé avec un `PrismaService` mocké (pas besoin d'une vraie base pour les tests unitaires).

## Prisma Studio

Pour explorer la base visuellement :

```bash
pnpm --filter api prisma:studio
```
