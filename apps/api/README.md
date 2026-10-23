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

# Seulement les cartes d'un type de fiche (un espace par sujet) : Quote | Vocabulary | MindMap
curl "http://localhost:3000/reviews/due?type=Vocabulary" -H "Authorization: Bearer $TOKEN"

# Combien de cartes à réviser, en tout et par type (les compteurs du menu)
curl http://localhost:3000/reviews/due/summary -H "Authorization: Bearer $TOKEN"

# S'auto-évaluer sur une carte : Again | Hard | Good | Easy
curl -X POST http://localhost:3000/reviews/<cardId> \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"rating":"Good"}'
```

Une nouvelle quote est à réviser tout de suite. Avec « Good », elle revient 10 minutes plus tard (phase d'apprentissage), puis après quelques jours, puis de plus en plus loin tant que la réponse reste bonne. « Again » la fait revenir quelques minutes plus tard et compte un oubli (`lapses`).

## Modèle de contenu (phase 5)

Toutes les fiches, quel que soit leur type, vivent dans une seule table `items` :

| colonne   | rôle                                                                                                                                        |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`    | `Quote` ou `Vocabulary` (enum PostgreSQL)                                                                                                   |
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
    { "id": "root", "parentId": null, "label": "La Révolution française", "position": { "x": 0, "y": 0 } },
    { "id": "a", "parentId": "root", "label": "Causes", "position": { "x": 260, "y": -30 } },
    { "id": "a1", "parentId": "a", "label": "Crise financière", "position": { "x": 520, "y": -30 } },
    { "id": "b", "parentId": "root", "label": "Acteurs", "position": { "x": 260, "y": 30 } }
  ]
}
```

- **Un parent par nœud, pas une liste d'arêtes.** Avec `parentId`, un nœud ne peut pas avoir deux parents : c'est garanti par la forme même des données. Les arêtes ne sont pas stockées, l'interface les recalcule.
- **Validation en deux temps.** `SaveMindMapDto` vérifie chaque nœud (DTO imbriqués : sans `@Type()`, class-transformer laisserait les objets imbriqués tels quels, sans les valider ni retirer les champs inconnus). `validateMindMap()` vérifie ensuite l'arbre entier : identifiants uniques, une seule racine, parents connus, pas de cycle. Sinon : `400`.
- **Les ids des nœuds sont générés par le client** (`crypto.randomUUID()`) et restent stables d'un enregistrement à l'autre : c'est ce qui permet de reconnaître une branche renommée ou déplacée.

### Une carte de révision par branche

Chaque enfant direct de la racine (une « branche ») a sa propre carte FSRS, de type `BranchRecall`. La colonne `cards.nodeId` indique de quelle branche il s'agit. Comme en phase 5 pour les deux sens d'un mot, les cartes d'une nouvelle carte mentale sont décalées d'un jour chacune pour ne pas toutes tomber le même jour.

Contrairement aux citations et au vocabulaire, les cartes dépendent du contenu : `CARD_TEMPLATES` devient `cardSlots(type, content)`. À chaque modification, `ItemsService.update` compare les cartes existantes à celles attendues :

| changement dans la carte mentale                           | effet sur les cartes de révision                               |
| ---------------------------------------------------------- | -------------------------------------------------------------- |
| nouvelle branche                                           | nouvelle carte (les nouvelles sont décalées d'un jour chacune) |
| branche supprimée, ou déplacée plus bas dans l'arbre       | carte supprimée, avec son historique                           |
| branche renommée, déplacée à l'écran, sous-idées modifiées | carte conservée, calendrier inchangé                           |

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

| cible     | contenu                                                              | lancée par                                                            |
| --------- | -------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `runtime` | `dist/` + dépendances de production                                  | le service `api` : `node dist/main.js`                                |
| `migrate` | l'étape de build entière (CLI Prisma et moteur de migration compris) | le service `migrate` : `prisma migrate deploy`, une fois, avant l'API |

La CLI Prisma est une dépendance de développement : la garder hors de l'image `runtime` évite d'y embarquer Prisma Studio et ses dépendances. Les migrations ont leur propre conteneur, qui s'arrête une fois son travail fait.

**Ce qui a changé dans le code pour tourner en conteneur :**

- **`GET /health`** (public) : répond `{"status":"ok"}` si la base répond, `503` sinon. C'est le _healthcheck_ du service `api` : `web` n'est démarré qu'une fois l'API réellement prête, pas seulement le processus lancé.
- **Validation de la configuration au démarrage** (`src/config/env.validation.ts`, branchée sur `ConfigModule.forRoot({ validate })`) : sans `DATABASE_URL` ou `JWT_SECRET`, l'API refuse de démarrer et liste ce qui manque, au lieu d'échouer plus tard sur une erreur 500. Une chaîne vide compte comme absente, car `docker-compose.yml` transmet `JWT_SECRET` même quand `.env` ne le définit pas. En production, la valeur d'exemple `change-me` est refusée.
- **`app.enableShutdownHooks()`** : `docker stop` envoie SIGTERM. Sans ce réglage, Nest ne l'écoute pas, la connexion à la base n'est pas fermée, et Docker tue le processus au bout de 10 s. Le service a aussi `init: true` dans `docker-compose.yml` : un mini-init (tini) tient le rôle de PID 1, car un processus de PID 1 ignore les signaux qu'il ne gère pas lui-même.
- **`"files"` dans `package.json`** : `pnpm deploy` (qui extrait l'API et ses dépendances de production dans l'image) copie les fichiers à publier. Sans liste explicite, il applique le `.gitignore`… qui exclut `dist/`.

**Deux pièges Prisma dans le Dockerfile :**

- `prisma.config.ts` lit `DATABASE_URL` même pour `prisma generate`, qui ne se connecte jamais : l'étape de build définit une URL factice, qui n'atteint pas l'image finale.
- Le client Prisma est du code _généré_ à côté de `@prisma/client`, dans `node_modules`. Après `pnpm deploy`, ce `node_modules` est neuf : il faut relancer `prisma generate` dans le dossier déployé, avec la CLI de l'étape de build.

## Rappels par e-mail (phase 11)

Chaque utilisateur peut recevoir, une fois par jour à l'heure de son choix (dans son fuseau horaire), un e-mail qui lui dit combien de cartes l'attendent. Rien n'est envoyé les jours où rien n'est dû.

```bash
# Réglages (désactivé, 8 h, Europe/Paris par défaut)
curl http://localhost:3000/reminders/settings -H "Authorization: Bearer $TOKEN"
curl -X PUT http://localhost:3000/reminders/settings -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"enabled":true,"hour":8,"timeZone":"Europe/Paris"}'

# Envoyer le rappel tout de suite, pour vérifier la configuration (204 ; 503 sans SMTP)
curl -X POST http://localhost:3000/reminders/test -H "Authorization: Bearer $TOKEN"
```

- **Tâche planifiée** (`@nestjs/schedule`, `RemindersScheduler`) : toutes les 10 minutes, elle cherche les utilisateurs dont l'heure est venue (jusqu'à 3 h de retard, si l'API était arrêtée à ce moment-là) et qui n'ont pas encore été traités aujourd'hui.
- **Une fois par jour, même à deux** : avant d'envoyer, la tâche « réserve » la journée par un seul `UPDATE … WHERE reminderLastSentOn <> aujourd'hui`. Pendant un déploiement, deux conteneurs `api` tournent quelques secondes : un seul obtient la ligne, un seul envoie. Si l'envoi échoue, la journée est rendue, et le passage suivant réessaie.
- **Envoi** (`MailService`, Nodemailer) : SMTP configuré par `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` et `APP_URL` (pour les liens). Sans `SMTP_HOST`, rien n'est envoyé, et le reste de l'API fonctionne pareil. En local, Mailpit attrape les e-mails : `docker compose --profile mail up -d mailpit`, puis http://localhost:8025.
- **Désinscription sans connexion** : le lien de l'e-mail porte l'identifiant de l'utilisateur et sa signature HMAC (avec `JWT_SECRET`). `POST /reminders/unsubscribe { user, token }` (public) vérifie la signature et désactive les rappels.

## Tests

```bash
pnpm --filter api test
```

`ItemsService`, `AuthService` et `ReviewsService` sont testés avec leurs dépendances mockées (Prisma, JWT) : pas besoin d'une vraie base. `validateMindMap()` et `cardSlots()` sont des fonctions pures, testées directement. `RemindersService` est testé de la même façon (heure locale, fuseaux, journée déjà traitée, échec d'envoi). `SchedulerService` est testé avec une horloge fixe et sans aléa (_fuzz_), ce qui permet de vérifier précisément les intervalles calculés.

## Prisma Studio

Pour explorer la base visuellement :

```bash
pnpm --filter api prisma:studio
```

## Préférences (MEM-6, MEM-44)

`translator` (`DeepL` par défaut, ou `Google`) : le service des boutons de traduction du vocabulaire. `PUT /preferences` ne change que les préférences envoyées.

L'espace ouvert à l'arrivée (`/`, après la connexion, depuis l'e-mail de rappel) est enregistré sur le compte, colonne `users.homeSpace` (Anglais par défaut, y compris pour les comptes existants).

```bash
curl http://localhost:3000/preferences -H "Authorization: Bearer $TOKEN"
curl -X PUT http://localhost:3000/preferences -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"homeSpace":"Quote"}'
```

## Profil (MEM-11)

Le prénom et le nom de l'utilisateur, facultatifs (colonnes `users.firstName` et `users.lastName`, vides pour les comptes existants), servent aux initiales de l'avatar et au menu du compte. Espaces de début et de fin supprimés, 80 caractères au plus chacun ; une chaîne vide efface la valeur.

```bash
curl http://localhost:3000/profile -H "Authorization: Bearer $TOKEN"
curl -X PUT http://localhost:3000/profile -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"firstName":"Vincent","lastName":"Carpentier"}'
```

## Apprentissage du vocabulaire (v0.3)

Un élément de vocabulaire a un état (`items.learningStatus`) : `ToLearn` à la saisie, `Learning` une fois appris, `Learned` quand on le sort de la révision. Seules les cartes des éléments `Learning` sont révisées et comptées (`src/reviews/in-review.ts`) ; citations et cartes mentales sont toujours `Learning`.

Le processus d'apprentissage (`src/learning/`) fait passer les éléments de `ToLearn` à `Learning` :

```bash
# Jusqu'à cinq éléments à apprendre, les plus anciens d'abord (+ prochaine échéance pour chaque note)
curl http://localhost:3000/learning/session -H "Authorization: Bearer $TOKEN"

# Étape 2 : première révision de la carte français → anglais ; l'élément passe à Learning
curl -X POST http://localhost:3000/learning/<itemId> -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"rating":"Good"}'
```

La carte anglais → français, non notée pendant l'apprentissage, devient due tout de suite. Un élément qui n'est plus `ToLearn` renvoie 409. « À revoir » (Again) rend la carte due tout de suite, au lieu du court délai de FSRS (1 ou 10 minutes) : quitter une séance puis y revenir la retrouve à réviser. Chaque élément de la séance porte l'identifiant de sa carte français → anglais (`cardId`) : noté « À revoir », il revient en fin de séance (MEM-47) et ses notes suivantes passent par `POST /reviews/:cardId`. Les deux routes renvoient `nextDueByRating`, les délais à afficher sur ses boutons.

« Appris » en révision et remise en apprentissage (MEM-22) :

```bash
# L'élément (Learning, ou ToLearn depuis l'étape 2, MEM-46) sort de la révision ;
# ses deux cartes reçoivent une ligne « Learned » dans l'historique
curl -X POST http://localhost:3000/learning/<itemId>/learned -H "Authorization: Bearer $TOKEN"

# Un élément Learned revient en révision, avec la planification qu'il avait
curl -X POST http://localhost:3000/learning/<itemId>/relearn -H "Authorization: Bearer $TOKEN"
```

`Learned` est une valeur de l'enum `ReviewRating` réservée à l'historique : la planification (FSRS) ne reçoit que les quatre notes, type `Grade`.

Pour une citation ou une branche de carte mentale, « Appris » porte sur la carte (MEM-48) : `cards.learnedAt` est renseigné, et `REVIEWED_CARD` (`src/reviews/in-review.ts`) écarte ces cartes de la révision, des compteurs et du rappel par e-mail.

```bash
# La carte sort de la révision (409 pour le vocabulaire, appris par élément)
curl -X POST http://localhost:3000/reviews/<cardId>/learned -H "Authorization: Bearer $TOKEN"

# « Remettre en révision », avec la planification qu'elle avait
curl -X POST http://localhost:3000/reviews/<cardId>/relearn -H "Authorization: Bearer $TOKEN"
```

## Import / export CSV du vocabulaire (MEM-50)

`src/items/vocabulary/csv/` : `csv.ts` lit et écrit le CSV (RFC 4180 : guillemets pour les valeurs qui contiennent le séparateur, un guillemet ou un retour à la ligne ; BOM UTF-8 à l'écriture, avec ou sans BOM à la lecture). Le séparateur est celui des Réglages (`users.csvSeparator`, MEM-55 : point-virgule par défaut, ou virgule). Cinq colonnes, après une ligne d'en-têtes : expression française, expression anglaise, thématique, phrase d'exemple en français, phrase d'exemple en anglais.

```bash
# Tout le vocabulaire, quel que soit son état (MEM-52) : mementorize-anglais-AAAA-MM-JJ.csv
curl http://localhost:3000/vocabulary-csv/export -H "Authorization: Bearer $TOKEN"
```

L'import se fait en deux temps. `POST /vocabulary-csv/preview { content }` (MEM-53) analyse le fichier sans rien enregistrer (`vocabulary-import.ts`) :

- la première ligne est celle des en-têtes, toujours ignorée, quels que soient ses intitulés ; 2 000 lignes au plus ensuite ;
- chaque ligne a un statut : `new` (à importer), `duplicate` ou `error` (motif) ;
- un doublon est une expression anglaise **ou** française déjà présente, dans le vocabulaire ou plus haut dans le fichier, sans tenir compte des majuscules ni des espaces en début et fin ; les accents comptent ;
- un fichier illisible renvoie `{ ok: false, problem }` (`empty`, `tooManyLines`, `syntax`, ou `wrongSeparator` quand les lignes n'ont de sens qu'avec l'autre séparateur).

Puis `POST /vocabulary-csv/import { content }` (MEM-54) analyse le fichier à nouveau (le vocabulaire a pu changer depuis l'aperçu) et crée les lignes `new` en une seule transaction (`ItemsService.createMany`, tout ou rien) : éléments « À apprendre », avec leur thématique et leurs exemples, dans l'ordre du fichier ; leur prononciation est générée en arrière-plan. Réponse : `{ ok: true, imported, duplicate, error }`.

Le JSON des requêtes peut atteindre 3 Mo (`main.ts`), pour un fichier de 1 Mo.

## Prononciation (MEM-39)

`src/pronunciation/` génère la prononciation de chaque élément de vocabulaire avec **Kokoro** (`kokoro.client.ts` : `POST /v1/audio/speech`, API compatible OpenAI) et la stocke dans la table `pronunciations` (MP3, avec le texte et la voix qui l'ont produite).

- **Quand** : à la création d'un élément, et quand son anglais change (`VocabularyController`), en arrière-plan : la requête n'attend pas. Une file traite un élément à la fois ; en cas d'échec, nouvel essai 1, 2, 4, 8, 16 minutes plus tard. Au démarrage de l'API (15 s après), un rattrapage reprend tout ce qui manque ou n'est plus à jour (anglais modifié, voix changée).
- **Servir** : `GET /vocabulary/:id/pronunciation` renvoie l'audio au propriétaire de l'élément, seulement s'il correspond à l'anglais actuel ; sinon 404, et le web utilise la voix du navigateur. La suppression d'un élément supprime son audio (cascade).
- **Réglages** : `KOKORO_URL` (sans lui, rien n'est généré) et `KOKORO_VOICE` (`af_heart` par défaut).
- **Tests** : `pronunciation.service.spec.ts` (file, rattrapage, contrôle d'accès) ; `test/pronunciation.e2e-spec.ts` fait tourner un faux serveur Kokoro à côté de l'API et d'une vraie base.

## Sens de révision du vocabulaire (MEM-40)

Un élément de vocabulaire garde ses deux cartes (`EnglishToFrench`, `FrenchToEnglish`), chacune avec son calendrier, mais **seule la carte français → anglais est révisée et comptée** : `REVIEWED_CARD` (`src/reviews/in-review.ts`) s'ajoute à `IN_REVIEW` dans toutes les requêtes sur les cartes dues (révision, compteurs, e-mail de rappel, prochaine révision). Les cartes anglais → français et leur historique restent en base, ignorés : un futur réglage du sens pourra les réactiver.
