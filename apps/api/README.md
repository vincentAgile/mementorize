# apps/api

API NestJS de Mementorize : CRUD sur les quotes (phase 1), protégé par une authentification JWT (phase 3) — chaque utilisateur ne voit que ses propres quotes.

## Démarrer en local

Depuis la racine du monorepo :

```bash
# 1. Démarrer PostgreSQL
docker compose up -d

# 2. Créer apps/api/.env à partir de .env.example (une seule fois),
#    et remplacer JWT_SECRET par une vraie valeur aléatoire

# 3. Installer les dépendances (génère aussi le client Prisma via postinstall)
pnpm install

# 4. Créer / mettre à jour le schéma en base
pnpm --filter api prisma:migrate

# 5. Lancer l'API en mode watch
pnpm --filter api dev
```

L'API écoute sur `http://localhost:3000` par défaut (configurable via `PORT` dans `.env`, voir `.env.example`).

## Tester les routes

Toutes les routes `/quotes` exigent un token : on crée d'abord un compte (ou on se connecte), puis on passe le token dans l'en-tête `Authorization`.

```bash
# Créer un compte -> renvoie {"accessToken": "..."}
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"vincent@example.com","password":"un-mot-de-passe"}'

# Se connecter (même réponse)
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"vincent@example.com","password":"un-mot-de-passe"}'

TOKEN="<accessToken reçu>"

# Qui suis-je ?
curl http://localhost:3000/auth/me -H "Authorization: Bearer $TOKEN"

# Créer / lister ses quotes
curl -X POST http://localhost:3000/quotes \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"text":"The only true wisdom is in knowing you know nothing.","author":"Socrates"}'
curl http://localhost:3000/quotes -H "Authorization: Bearer $TOKEN"
```

Sans token (ou avec un token expiré) : `401 Unauthorized`.

## Authentification : comment ça marche

- `POST /auth/register` : le mot de passe est haché avec **bcryptjs** (coût 12) ; seul le hash est stocké (`users.passwordHash`).
- `POST /auth/login` : `LocalAuthGuard` déclenche la `LocalStrategy` de Passport, qui compare le mot de passe au hash.
- Dans les deux cas l'API renvoie un **JWT** signé avec `JWT_SECRET`, valable `JWT_EXPIRES_IN` secondes.
- Les routes protégées utilisent `JwtAuthGuard` → `JwtStrategy` vérifie la signature et l'expiration du token, puis place `{ id, email }` dans `request.user` (lu via le décorateur `@CurrentUser()`).
- `QuotesService` filtre toujours par `userId` : la quote d'un autre utilisateur renvoie un 404, comme si elle n'existait pas.

## Tests

```bash
pnpm --filter api test
```

`QuotesService` et `AuthService` sont testés avec leurs dépendances mockées (Prisma, JWT) : pas besoin d'une vraie base pour les tests unitaires.

## Prisma Studio

Pour explorer la base visuellement :

```bash
pnpm --filter api prisma:studio
```
