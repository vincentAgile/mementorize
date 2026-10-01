# apps/api

API NestJS de Mementorize : CRUD sur les quotes (phase 1), protégé par une authentification JWT (phase 3) — chaque utilisateur ne voit que ses propres quotes — planification des révisions par répétition espacée (phase 4, algorithme FSRS), plusieurs types de contenu : citations et vocabulaire anglais (phase 5), et cartes mentales révisées branche par branche (phase 6).

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

# Créer / lister ses quotes (même contrat qu'avant la phase 5)
curl -X POST http://localhost:3000/quotes \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"text":"The only true wisdom is in knowing you know nothing.","author":"Socrates"}'
curl http://localhost:3000/quotes -H "Authorization: Bearer $TOKEN"

# Créer / lister du vocabulaire (l'exemple est facultatif)
curl -X POST http://localhost:3000/vocabulary \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"word":"to cherish","translation":"chérir","example":"I will always cherish these memories."}'
curl http://localhost:3000/vocabulary -H "Authorization: Bearer $TOKEN"

# Tout ce qu'on apprend, tous types confondus (ou filtré : ?type=Quote / ?type=Vocabulary)
curl http://localhost:3000/items -H "Authorization: Bearer $TOKEN"
```

Sans token (ou avec un token expiré) : `401 Unauthorized`.

## Authentification : comment ça marche

- `POST /auth/register` : le mot de passe est haché avec **bcryptjs** (coût 12) ; seul le hash est stocké (`users.passwordHash`).
- `POST /auth/login` : `LocalAuthGuard` déclenche la `LocalStrategy` de Passport, qui compare le mot de passe au hash.
- Dans les deux cas l'API renvoie un **JWT** signé avec `JWT_SECRET`, valable `JWT_EXPIRES_IN` secondes.
- Les routes protégées utilisent `JwtAuthGuard` → `JwtStrategy` vérifie la signature et l'expiration du token, puis place `{ id, email }` dans `request.user` (lu via le décorateur `@CurrentUser()`).
- `QuotesService` filtre toujours par `userId` : la quote d'un autre utilisateur renvoie un 404, comme si elle n'existait pas.

## Répétition espacée (phase 4)

Chaque fiche a une ou plusieurs **cartes** (`cards`) qui mémorise où en est son apprentissage : prochaine date de révision (`due`), stabilité, difficulté, nombre de révisions et d'oublis, état (`New`, `Learning`, `Review`, `Relearning`). Chaque auto-évaluation ajoute une ligne dans `review_logs` : c'est l'historique des révisions.

Le calcul est confié à [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs), une implémentation de FSRS (l'algorithme utilisé par Anki). Tout passe par `SchedulerService` (`src/scheduling/`), seul endroit du code qui connaît la librairie.

```bash
# Ce qu'il y a à réviser maintenant (+ prochaine date pour chaque réponse possible)
curl http://localhost:3000/reviews/due -H "Authorization: Bearer $TOKEN"

# S'auto-évaluer sur une carte : Again | Hard | Good | Easy
curl -X POST http://localhost:3000/reviews/<cardId> \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"rating":"Good"}'
```

Une nouvelle quote est à réviser tout de suite. Avec « Good », elle revient 10 minutes plus tard (phase d'apprentissage), puis après quelques jours, puis de plus en plus loin tant que la réponse reste bonne. « Again » la fait revenir quelques minutes plus tard et compte un oubli (`lapses`).

## Modèle de contenu (phase 5)

Toutes les fiches, quel que soit leur type, vivent dans une seule table `items` :

| colonne   | rôle |
|-----------|------|
| `type`    | `Quote` ou `Vocabulary` (enum PostgreSQL) |
| `content` | colonne **jsonb** dont la forme dépend du type : `{ text, author, source }` pour une citation, `{ word, translation, example }` pour un mot |

La base ne vérifie pas la forme de `content` : c'est l'API qui le fait, avec un DTO par type (`CreateQuoteDto`, `CreateVocabularyDto`). `ItemsService` stocke et relit les fiches sans jamais regarder ce qu'il y a dedans ; seuls les contrôleurs `/quotes` et `/vocabulary` connaissent leur type.

Une fiche a une carte par « face » à réviser (`cards.kind`) :

- une citation : `QuoteRecall` (retrouver la suite à partir de l'auteur et des premiers mots) ;
- un mot : `EnglishToFrench` et `FrenchToEnglish`, chacune avec son propre calendrier FSRS. La seconde démarre un jour plus tard, pour ne pas enchaîner les deux sens du même mot.

La migration `generic_items` est écrite à la main : à partir du seul schéma, Prisma aurait supprimé la table `quotes` pour en créer une nouvelle, en perdant les cartes et l'historique. Elle renomme la table, transforme les colonnes `text` / `author` / `source` en `content` jsonb, et conserve les identifiants, les cartes et les `review_logs`.

## Cartes mentales (phase 6)

Une carte mentale est une fiche comme les autres (`items.type = 'MindMap'`) : tout l'arbre tient dans la colonne jsonb `content`.

```json
{
  "nodes": [
    { "id": "root", "parentId": null,   "label": "La Révolution française", "position": { "x": 0,   "y": 0 } },
    { "id": "a",    "parentId": "root", "label": "Causes",                  "position": { "x": 260, "y": -30 } },
    { "id": "a1",   "parentId": "a",    "label": "Crise financière",        "position": { "x": 520, "y": -30 } },
    { "id": "b",    "parentId": "root", "label": "Acteurs",                 "position": { "x": 260, "y": 30 } }
  ]
}
```

- **Un parent par nœud, pas une liste d'arêtes.** Avec `parentId`, un nœud ne peut pas avoir deux parents : c'est garanti par la forme même des données. Les arêtes ne sont pas stockées, l'interface les recalcule.
- **Validation en deux temps.** `SaveMindMapDto` vérifie chaque nœud (DTO imbriqués : sans `@Type()`, class-transformer laisserait les objets imbriqués tels quels, sans les valider ni retirer les champs inconnus). `validateMindMap()` vérifie ensuite l'arbre entier : identifiants uniques, une seule racine, parents connus, pas de cycle. Sinon : `400`.
- **Les ids des nœuds sont générés par le client** (`crypto.randomUUID()`) et restent stables d'un enregistrement à l'autre : c'est ce qui permet de reconnaître une branche renommée ou déplacée.

### Une carte de révision par branche

Chaque enfant direct de la racine (une « branche ») a sa propre carte FSRS, de type `BranchRecall`. La colonne `cards.nodeId` indique de quelle branche il s'agit. Comme en phase 5 pour les deux sens d'un mot, les cartes d'une nouvelle carte mentale sont décalées d'un jour chacune pour ne pas toutes tomber le même jour.

Contrairement aux citations et au vocabulaire, les cartes dépendent du contenu : `CARD_TEMPLATES` devient `cardSlots(type, content)`. À chaque modification, `ItemsService.update` compare les cartes existantes à celles attendues :

| changement dans la carte mentale | effet sur les cartes de révision |
|----------------------------------|----------------------------------|
| nouvelle branche                 | nouvelle carte (les nouvelles sont décalées d'un jour chacune) |
| branche supprimée, ou déplacée plus bas dans l'arbre | carte supprimée, avec son historique |
| branche renommée, déplacée à l'écran, sous-idées modifiées | carte conservée, calendrier inchangé |

Le contenu et les cartes sont modifiés dans une seule requête Prisma (écritures imbriquées) : tout réussit, ou rien.

**Contrainte d'unicité.** Elle devient `(itemId, kind, nodeId)`. Mais PostgreSQL considère deux `NULL` comme différents dans un index unique : pour les citations et le vocabulaire (`nodeId` à `NULL`), la base n'empêche donc plus d'avoir deux cartes du même type pour une fiche. On aurait pu écrire `NULLS NOT DISTINCT` (PostgreSQL 15+) dans la migration, mais Prisma ne sait pas le décrire dans `schema.prisma`, et le schéma et la migration auraient divergé. Comme seul `ItemsService` crée des cartes, et une seule fois chacune, ce compromis est acceptable.

La migration `mind_maps` est écrite à la main, dans le même style que ce que Prisma génère : ajout des valeurs d'enum, de la colonne `nodeId`, remplacement de l'index unique.

```bash
# Créer une carte mentale (l'arbre complet)
curl -X POST http://localhost:3000/mind-maps \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"nodes":[{"id":"root","parentId":null,"label":"Photosynthèse","position":{"x":0,"y":0}},{"id":"in","parentId":"root","label":"Entrées","position":{"x":260,"y":0}}]}'

curl http://localhost:3000/mind-maps -H "Authorization: Bearer $TOKEN"
curl http://localhost:3000/mind-maps/<id> -H "Authorization: Bearer $TOKEN"

# Remplacer l'arbre (PUT : l'éditeur envoie toujours tous les nœuds)
curl -X PUT http://localhost:3000/mind-maps/<id> \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"nodes":[...]}'

curl -X DELETE http://localhost:3000/mind-maps/<id> -H "Authorization: Bearer $TOKEN"
```

`GET /reviews/due` n'a pas changé : pour une carte `BranchRecall`, `card.nodeId` indique la branche à masquer.

## Image Docker (phase 7)

`apps/api/Dockerfile` produit deux images à partir des mêmes étapes de build (voir le [README racine](../../README.md#conteneurisation-phase-7) pour l'ensemble) :

| cible     | contenu | lancée par |
|-----------|---------|------------|
| `runtime` | `dist/` + dépendances de production | le service `api` : `node dist/main.js` |
| `migrate` | l'étape de build entière (CLI Prisma et moteur de migration compris) | le service `migrate` : `prisma migrate deploy`, une fois, avant l'API |

La CLI Prisma est une dépendance de développement : la garder hors de l'image `runtime` évite d'y embarquer Prisma Studio et ses dépendances. Les migrations ont leur propre conteneur, qui s'arrête une fois son travail fait.

**Ce qui a changé dans le code pour tourner en conteneur :**

- **`GET /health`** (public) : répond `{"status":"ok"}` si la base répond, `503` sinon. C'est le *healthcheck* du service `api` : `web` n'est démarré qu'une fois l'API réellement prête, pas seulement le processus lancé.
- **Validation de la configuration au démarrage** (`src/config/env.validation.ts`, branchée sur `ConfigModule.forRoot({ validate })`) : sans `DATABASE_URL` ou `JWT_SECRET`, l'API refuse de démarrer et liste ce qui manque, au lieu d'échouer plus tard sur une erreur 500. Une chaîne vide compte comme absente, car `docker-compose.yml` transmet `JWT_SECRET` même quand `.env` ne le définit pas. En production, la valeur d'exemple `change-me` est refusée.
- **`app.enableShutdownHooks()`** : `docker stop` envoie SIGTERM. Sans ce réglage, Nest ne l'écoute pas, la connexion à la base n'est pas fermée, et Docker tue le processus au bout de 10 s. Le service a aussi `init: true` dans `docker-compose.yml` : un mini-init (tini) tient le rôle de PID 1, car un processus de PID 1 ignore les signaux qu'il ne gère pas lui-même.
- **`"files"` dans `package.json`** : `pnpm deploy` (qui extrait l'API et ses dépendances de production dans l'image) copie les fichiers à publier. Sans liste explicite, il applique le `.gitignore`… qui exclut `dist/`.

**Deux pièges Prisma dans le Dockerfile :**

- `prisma.config.ts` lit `DATABASE_URL` même pour `prisma generate`, qui ne se connecte jamais : l'étape de build définit une URL factice, qui n'atteint pas l'image finale.
- Le client Prisma est du code *généré* à côté de `@prisma/client`, dans `node_modules`. Après `pnpm deploy`, ce `node_modules` est neuf : il faut relancer `prisma generate` dans le dossier déployé, avec la CLI de l'étape de build.

## Tests

```bash
pnpm --filter api test
```

`ItemsService`, `AuthService` et `ReviewsService` sont testés avec leurs dépendances mockées (Prisma, JWT) : pas besoin d'une vraie base. `validateMindMap()` et `cardSlots()` sont des fonctions pures, testées directement. `SchedulerService` est testé avec une horloge fixe et sans aléa (*fuzz*), ce qui permet de vérifier précisément les intervalles calculés.

## Prisma Studio

Pour explorer la base visuellement :

```bash
pnpm --filter api prisma:studio
```
