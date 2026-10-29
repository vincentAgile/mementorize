# Mementorize : document maître

> Source de vérité du projet pour les conversations avec Claude (et pour moi).
> Il résume l'essentiel et renvoie vers les README pour le détail : **il ne les duplique pas**.
> À mettre à jour à la fin de chaque epic (voir « Entretien du document »).
>
> Dernière mise à jour : 2026-10-29 · Dépôt au commit `a62593c` (fusion de la PR #126, v0.18)

## 1. Le produit

Application de mémorisation à long terme, fondée sur la courbe de l'oubli et l'algorithme FSRS. Trois espaces par sujet :

| Espace          | Contenu                                             | Cartes de révision                       |
| --------------- | --------------------------------------------------- | ---------------------------------------- |
| Anglais         | éléments de vocabulaire (mot, expression ou phrase) | une carte français → anglais est révisée |
| Citations       | citations avec auteur et source                     | une carte « retrouver la suite »         |
| Cartes mentales | arbre d'idées éditable (@xyflow/react)              | une carte par branche (branche masquée)  |

Deux rôles pour moi : **développeur** (projet de veille technique, phases 0 à 11) puis **product owner** (versions v0.x pilotées dans Jira). Utilisateur principal aujourd'hui : moi seul.

Production : https://mementorize.delaneuville.fr

## 2. Où est quoi

| Sujet                              | Où                                                                               |
| ---------------------------------- | -------------------------------------------------------------------------------- |
| Code                               | GitHub `vincentAgile/mementorize` (monorepo)                                     |
| Backlog                            | Jira `https://delaneuville.atlassian.net/jira/software/projects/MEM` (clé `MEM`) |
| Détail technique API               | `apps/api/README.md`                                                             |
| Détail technique web               | `apps/web/README.md` (+ `apps/web/AGENTS.md`, voir §6)                           |
| Production, serveur, sauvegardes   | `deploy/README.md`                                                               |
| CI, CD, conteneurs                 | `README.md` racine                                                               |
| Conventions de branches            | `CONTRIBUTING.md` (partiellement dépassé, voir §5)                               |
| Feuille de route des phases 0 à 11 | document de suivi partagé, hors dépôt                                            |

## 3. Stack et architecture

- **Monorepo** pnpm + Turborepo : `apps/api`, `apps/web`, `packages/`, `deploy/`. Node 24 (`.nvmrc`).
- **API** : NestJS (ESM, imports en `.js`) + Prisma (adapter-pg) + PostgreSQL 16. Authentification JWT + Passport, sessions avec jeton de renouvellement.
- **Web** : Next.js (App Router, Server Actions). Le navigateur n'appelle **jamais** l'API directement : Next.js joue le rôle de BFF et garde le JWT dans un cookie httpOnly.
- **Répétition espacée** : ts-fsrs, seulement via `SchedulerService`.
- **Voix** : prononciation générée par Kokoro (serveur, conteneur dédié), repli sur la voix du navigateur. Évaluation de la prononciation de l'utilisateur par **Azure AI Speech** (service externe, facultatif, derrière la couche `apps/api/src/voice/` ; détail dans `apps/api/README.md` et `deploy/README.md`).
- **Conteneurs** : Docker multi-stage ; démarrage ordonné postgres → migrate → api → web ; seul `web` est publié.
- **CI/CD** : GitHub Actions. Six jobs de CI ; sur `main`, images publiées sur GHCR, puis déploiement par SSH, sans coupure (docker-rollout).
- **Exploitation** : VPS OVH, Traefik (HTTPS Let's Encrypt), Uptime Kuma, sonde externe healthchecks.io, sauvegarde quotidienne chiffrée (rclone vers OVH Object Storage).

### Décisions structurantes (et pourquoi)

| Décision                                                                                                                    | Raison                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Table `items` polymorphe, contenu en `jsonb` validé par DTO                                                                 | un seul modèle pour tous les types de fiches ; la base ne vérifie pas la forme, l'API oui               |
| Carte mentale = `nodes` avec `parentId` (pas d'arêtes stockées)                                                             | un seul parent par nœud garanti par la forme des données ; l'arbre ne peut pas devenir un graphe        |
| Format stocké indépendant de React Flow                                                                                     | `flow.ts` convertit dans les deux sens                                                                  |
| Une carte FSRS par branche de carte mentale (`BranchRecall`)                                                                | révision fine ; les cartes suivent le contenu (`cardSlots`)                                             |
| Vocabulaire : deux cartes en base, une seule révisée (français → anglais)                                                   | `REVIEWED_CARD` ; un futur réglage pourra réactiver l'autre sens                                        |
| États du vocabulaire : `Waiting` → `ToLearn` (file ordonnée) → `Learning` → `Learned`                                       | processus d'apprentissage distinct du processus de révision                                             |
| « Appris » n'est pas une note FSRS (`Learned` réservé à l'historique)                                                       | exclu des données d'optimisation FSRS                                                                   |
| Nouveaux réglages FSRS appliqués à la prochaine révision, sans recalcul des dates programmées                               | évite un afflux soudain de cartes                                                                       |
| **Migrations rétrocompatibles** : on ajoute dans une version, on retire dans la suivante                                    | pendant le déploiement, l'ancien code tourne quelques secondes sur le nouveau schéma                    |
| Les images ne contiennent aucun secret ; tout passe par variables d'environnement                                           | même build en local et en production                                                                    |
| Prononciation évaluée via **Azure Pronunciation Assessment**, derrière une couche voix                                      | décision prise dans le backlog (MEM-89, MEM-90) ; essai MEM-93                                          |
| Apprentissage du vocabulaire en trois étapes sur la série : écoute (sans texte), anglais → français (sans note), évaluation | entendre avant de lire, reconnaître avant de produire ; seule l'évaluation change les états (v0.18)     |
| Évaluation de l'apprentissage : réponses envoyées élément par élément, dès qu'il est réussi                                 | interrompre une série garde les acquis ; un élément « à revoir » reste dans son état antérieur          |
| Cadre « Évaluer ma prononciation » partagé par la révision et l'apprentissage                                               | mêmes composants ; désactivé avec « Service d'évaluation indisponible » quand Azure n'est pas configuré |

## 4. Vocabulaire du projet

- **Élément de vocabulaire** : mot, expression ou phrase en anglais avec sa traduction française (abrégé « élément » quand le contexte suffit). Dans l'interface, « entrée » reste possible là où la place compte.
- **Espace** : un sujet (Anglais, Citations, Cartes mentales) avec son sous-menu d'onglets.
- **Processus d'apprentissage** (première prise de contact avec des éléments) ≠ **processus de révision** (FSRS).
- **Epic** = une version `v0.x` dans Jira.

## 5. Méthode de travail

### Conversations

Une conversation par rôle, pas de conversation « fourre-tout » :

| Conversation              | Rôle                                                                                      |
| ------------------------- | ----------------------------------------------------------------------------------------- |
| **Mementorize backlog**   | produit : priorisation, découpage, rédaction des epics et stories dans Jira. Pas de code. |
| **Mementorize Dev**       | développement et exploitation (déploiement, serveur)                                      |
| conversations ponctuelles | un ticket ou un chantier, avec le dépôt attaché ; elles se terminent par une PR           |

Règle : **une décision importante est consignée ici ou dans Jira, jamais seulement dans une conversation** (l'historique est compressé et ne se retrouve que par recherche).

**Aiguillage des demandes.** Conversation « backlog » : les demandes deviennent des stories groupées en epic dans Jira, sans code ; le développement ne commence qu'après accord. Autre conversation : développement direct, sauf si la demande dépasse une PR, ajoute une migration ou touche plusieurs écrans, auquel cas Claude propose de passer par le backlog. Le libellé de la conversation est un repère ; le message de lancement (§8) fait foi.

### Cycle d'un ticket

1. La story est écrite dans Jira (objectif, critères d'acceptation, dépendances).
2. Branche d'epic `v0.x` et une branche par story (`MEM-<n>-<sujet>`), PR vers `main` (merge commit).
3. CI verte obligatoire (la protection de `main` impose de passer par une PR).
4. **Chaque fusion sur `main` déclenche un déploiement en production.** Une PR à la fois : fusionner, vérifier que le déploiement est vert, puis la suivante (rebase sur `main` avant de fusionner).
5. Transition des stories en « Terminé » dans Jira, suppression des branches, clôture de l'epic.

### Règles de parallélisation

- Deux ou trois développements en parallèle au maximum (le goulot, c'est la relecture).
- Pas de tickets qui touchent les mêmes écrans ou le même modèle en parallèle.
- **Une seule migration de base en cours à la fois.**

### Conventions

- Code en anglais ; échanges, README et interface en français.
- Commits : Conventional Commits (`feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `ci`).
- Avant de pousser : `pnpm format`, `pnpm lint && pnpm test && pnpm build`.
- Environnement de dev : Windows, PowerShell, VS Code.
- `CONTRIBUTING.md` décrit encore les branches `phase/N-...` des phases 0 à 11 : depuis les versions v0.x, le schéma est « branche d'epic + branches de stories ».

## 6. Pièges connus

- **Next.js** : la version utilisée a des changements non rétrocompatibles. `apps/web/AGENTS.md` demande de lire `node_modules/next/dist/docs/` avant d'écrire du code web ; ne pas se fier à la mémoire.
- **React Flow** : `colorMode="system"` provoque une erreur d'hydratation (mode sombre par variables CSS) ; un nœud neuf doit avoir une taille provisoire, sinon la première frappe est perdue.
- **Prisma** : `prisma.config.ts` lit `DATABASE_URL` même pour `generate` ; le client généré doit être regénéré après `pnpm deploy` dans les Dockerfiles. Les migrations qui touchent à des données sont écrites à la main.
- **Contrainte d'unicité des cartes** `(itemId, kind, nodeId)` : `NULL` compte comme distinct en PostgreSQL ; seul `ItemsService` crée des cartes, c'est le garde-fou.
- Une commande de déploiement ou de serveur se lance **sur le VPS** (SSH), pas sur le PC.

## 7. État du backlog (Jira, projet MEM)

Epics terminées : v0.1 (MEM-1) à v0.18 (MEM-100) : espaces par sujet, profil et réglages, apprentissage du vocabulaire, ergonomie Anglais, identité visuelle, prononciation, saisie bilingue, révision simplifiée, thématiques et import/export CSV, pagination et actions groupées, file d'apprentissage, espace Citations, réglages FSRS, réglages en onglets, console d'administration et sessions, entraînement à la prononciation (v0.16), espace Cartes mentales aux onglets Réviser, Liste et Ajouter (v0.17), nouvelle procédure d'apprentissage du vocabulaire en trois étapes : écoute et prononciation, anglais → français, évaluation (v0.18, MEM-100 ; PR #122 à #126).

Toutes les epics sont closes (MEM-89, MEM-96 et MEM-100 clôturées le 2026-10-29) et aucune story n'est ouverte : le prochain travail est à définir.

### Idées et suite possible

- Bonus de la feuille de route : tests de bout en bout, environnement de staging, PWA, observabilité avancée (Prometheus / Grafana).
- Mesure de l'usage : page « Statistiques » à partir de `review_logs`, éventuellement Umami (hébergé sur le VPS).
- Optimisation FSRS sur l'historique (MEM-76) : à reprendre quand l'historique de révisions sera suffisant (de l'ordre de 1 000 révisions par espace).
- Import de séries de cartes déjà connues (directement dans « Appris »).
- Le blocage ponctuel de l'écran de révision (phase 6) n'existe plus : point clos.

## 8. Lancer une nouvelle conversation

Message type pour un développement :

> Contexte : voir `MEMENTORIZE.md` (dépôt `vincentAgile/mementorize`).
> Implémente la story MEM-<n> (critères dans Jira). Crée la branche `MEM-<n>-<sujet>` depuis `main`, ajoute les tests, ouvre une PR et vérifie que la CI passe. Ne fusionne pas sans mon accord.

Message type pour le backlog :

> Contexte : voir `MEMENTORIZE.md`. On travaille le backlog Jira du projet MEM (pas de code). Point de départ : <sujet>.

## 9. Entretien du document

- À la clôture de chaque epic : mettre à jour §7 (statuts, prochaines idées) et ajouter les décisions de §3.
- À chaque nouvelle règle de méthode : §5.
- Un fait qui existe déjà dans un README ou dans Jira : y renvoyer plutôt que le recopier.
- Le document vit dans le dépôt : il se modifie par PR comme le reste. Une copie est gardée dans le projet Claude « Mementorize », qui regroupe aussi les conversations « Mementorize Dev » et « Mementorize backlog » (à resynchroniser après chaque mise à jour).
