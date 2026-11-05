# Mementorize : document maître

> Source de vérité du projet pour les conversations avec Claude (et pour moi).
> Il résume l'essentiel et renvoie vers les README pour le détail : **il ne les duplique pas**.
> À mettre à jour à la fin de chaque epic (voir « Entretien du document »).
>
> Dernière mise à jour : 2026-11-03 · Dépôt au commit `e94b221` (fusion de la PR #157, v0.21)

## 1. Le produit

Application de mémorisation à long terme, fondée sur la courbe de l'oubli et l'algorithme FSRS. Trois espaces par sujet :

| Espace          | Contenu                                             | Cartes de révision                                  |
| --------------- | --------------------------------------------------- | --------------------------------------------------- |
| Anglais         | éléments de vocabulaire (mot, expression ou phrase) | une carte français → anglais est révisée            |
| Citations       | citations avec indice de rappel, auteur et source   | une carte : l'indice au recto, la citation au verso |
| Cartes mentales | arbre d'idées éditable (@xyflow/react)              | une carte par branche (branche masquée)             |

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

| Décision                                                                                                                                                                                  | Raison                                                                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Table `items` polymorphe, contenu en `jsonb` validé par DTO                                                                                                                               | un seul modèle pour tous les types de fiches ; la base ne vérifie pas la forme, l'API oui                                           |
| Carte mentale = `nodes` avec `parentId` (pas d'arêtes stockées)                                                                                                                           | un seul parent par nœud garanti par la forme des données ; l'arbre ne peut pas devenir un graphe                                    |
| Format stocké indépendant de React Flow                                                                                                                                                   | `flow.ts` convertit dans les deux sens                                                                                              |
| Une carte FSRS par branche de carte mentale (`BranchRecall`)                                                                                                                              | révision fine ; les cartes suivent le contenu (`cardSlots`)                                                                         |
| Vocabulaire : deux cartes en base, une seule révisée (français → anglais)                                                                                                                 | `REVIEWED_CARD` ; un futur réglage pourra réactiver l'autre sens                                                                    |
| États du vocabulaire : `Waiting` → `ToLearn` (file ordonnée) → `Learning` → `Learned`                                                                                                     | processus d'apprentissage distinct du processus de révision                                                                         |
| « Appris » n'est pas une note FSRS (`Learned` réservé à l'historique)                                                                                                                     | exclu des données d'optimisation FSRS                                                                                               |
| Nouveaux réglages FSRS appliqués à la prochaine révision, sans recalcul des dates programmées                                                                                             | évite un afflux soudain de cartes                                                                                                   |
| **Migrations rétrocompatibles** : on ajoute dans une version, on retire dans la suivante                                                                                                  | pendant le déploiement, l'ancien code tourne quelques secondes sur le nouveau schéma                                                |
| Les images ne contiennent aucun secret ; tout passe par variables d'environnement                                                                                                         | même build en local et en production                                                                                                |
| Prononciation évaluée via **Azure Pronunciation Assessment**, derrière une couche voix                                                                                                    | décision prise dans le backlog (MEM-89, MEM-90) ; essai MEM-93                                                                      |
| Apprentissage du vocabulaire en trois étapes sur la série : écoute (sans texte), anglais → français (sans note), évaluation                                                               | entendre avant de lire, reconnaître avant de produire ; seule l'évaluation change les états (v0.18)                                 |
| Évaluation de l'apprentissage : réponses envoyées élément par élément, dès qu'il est réussi                                                                                               | interrompre une série garde les acquis ; un élément « à revoir » reste dans son état antérieur                                      |
| Cadre « Évaluer ma prononciation » partagé par la révision et l'apprentissage                                                                                                             | mêmes composants ; désactivé avec « Service d'évaluation indisponible » quand Azure n'est pas configuré                             |
| Citations : « Indice de rappel » obligatoire ; les citations antérieures ont reçu « Indice de rappel » par migration                                                                      | la carte part d'un indice plutôt que du début du texte ; l'indice provisoire se remplace depuis la liste (v0.19)                    |
| Recto d'une carte de citation : l'indice seul, l'auteur et le début de la citation sur demande                                                                                            | on peut s'aider sans voir la réponse ; la réponse cachée n'est pas dans la page (v0.19)                                             |
| Réglage « Mode d'utilisation » Standard / Avancé (Standard par défaut)                                                                                                                    | réserver les actions qui défont le travail à qui les demande ; base des futures options avancées (v0.20)                            |
| Réinitialiser l'apprentissage : mode Avancé seulement, vérifié par l'API (403) ; dernier de la file, cartes neuves, historique conservé                                                   | une erreur d'apprentissage se rattrape sans perdre les données de révision (v0.20)                                                  |
| Historique des états d'apprentissage (`learning_status_changes`) écrit par un trigger PostgreSQL ; le passé reconstitué depuis `review_logs`                                              | aucun changement d'état n'échappe, quel que soit le code (même pendant un déploiement) ; sert au graphique de fin d'apprentissage   |
| Pas de révision tous espaces confondus (« Tout réviser » retiré) : chaque espace se révise à part, et finit sur sa prochaine révision et sa progression                                   | une révision a un sujet ; l'écran de fin (apprentissage et révision) montre où en est cet espace                                    |
| « Mes statistiques » (popup du compte) : un onglet par espace, avec les composants de fin de session (`ProgressSummary`, `ProgressChart`)                                                 | un seul affichage de la progression, à la fin d'une session comme à tout moment ; pas d'onglet Cartes mentales (pas de progression) |
| La prononciation anglaise va au bout : passer à la carte suivante ne la coupe plus, la suivante attend (seule la dernière demandée)                                                       | on peut se noter sans attendre la fin du son ; le haut-parleur et « Réécouter » coupent toujours                                    |
| Sous-menu Anglais : Apprendre · Réviser, **Ma liste** (avec l'export CSV), **Ajouter une carte**, **Ajouter une liste** (liste prédéfinie ou fichier CSV) ; anciennes adresses redirigées | ajouter une carte et en ajouter beaucoup sont deux gestes ; l'export est à côté de ce qu'il exporte (v0.24, MEM-122, MEM-123)       |

## 4. Vocabulaire du projet

Référentiel unique des mots de l'interface, des stories Jira et de nos échanges. Dans l'interface, on n'emploie que le terme de la colonne « Interface » ; la colonne « À éviter » liste ce qu'on ne doit plus y voir. Le code est en anglais ; `apps/web/lib/nouns.ts` est le seul endroit où les noms des objets sont écrits pour les messages (jamais en dur dans un composant). « Mot », « expression » et « phrase » restent libres pour décrire le contenu d'une carte.

| Interface                                                         | Définition                                                                                                                                                                                                                    | Dans le code                                                   | À éviter                                            |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------- |
| **Carte** (espace Anglais)                                        | ce que l'on apprend et révise : un mot, une expression ou une phrase en anglais avec sa traduction française                                                                                                                  | `Item` de type `Vocabulary` (`ITEM_NOUN`)                      | « élément » (banni, MEM-120), « entrée », « fiche » |
| **Citation**                                                      | une citation avec indice de rappel, auteur et source                                                                                                                                                                          | `Item` de type `Quote` (`QUOTE_NOUN`)                          | « carte » pour une citation                         |
| **Carte mentale**, **branche**                                    | arbre d'idées éditable ; une branche masquée est une carte à réviser                                                                                                                                                          | `Item` de type `MindMap` ; `Card` `BranchRecall`               | « carte » seul pour une carte mentale               |
| _(invisible)_                                                     | planning de révision FSRS d'un sens d'un mot (deux par mot, un seul révisé) : à ne pas confondre avec la carte de l'utilisateur                                                                                               | `Card`                                                         | l'appeler « carte » dans une story                  |
| **Espace**                                                        | un sujet (Anglais, Citations, Cartes mentales) avec son sous-menu d'onglets                                                                                                                                                   | `Space`                                                        | « module », « section »                             |
| **En attente**, **À apprendre**, **En apprentissage**, **Appris** | les quatre états d'une carte ou d'une citation                                                                                                                                                                                | `LearningStatus` : `Waiting`, `ToLearn`, `Learning`, `Learned` | « nouveau », « maîtrisé »                           |
| **Apprendre** ≠ **Réviser**                                       | processus d'apprentissage (première prise de contact, file ordonnée) ≠ processus de révision (FSRS)                                                                                                                           | `learning/`, `reviews/`                                        | employer l'un pour l'autre                          |
| **Indice de rappel**                                              | la « question » d'une citation, affichée seule au recto (obligatoire)                                                                                                                                                         | `hint`                                                         | « titre », « thème »                                |
| **Thématique**                                                    | thème d'une carte de vocabulaire (« Voyage », « Cuisine »)                                                                                                                                                                    | `topic`                                                        | « catégorie », « tag »                              |
| **Niveau**                                                        | A1 à C2 (CECRL) d'une liste prédéfinie ; propre au catalogue, pas un champ des cartes (v0.22)                                                                                                                                 | `LanguageLevel`                                                |                                                     |
| **Liste prédéfinie** (utilisateur), **Catalogue** (console)       | listes de cartes proposées par l'administrateur, copiées dans le vocabulaire de l'utilisateur (v0.22)                                                                                                                         | `predefined_lists`, `predefined_entries`                       | « pack », « deck »                                  |
| **Ma liste**                                                      | toutes mes cartes de l'espace Anglais (onglet `/anglais/liste`, avec l'export) : ne pas confondre avec une liste prédéfinie                                                                                                   | `VocabularyTable`                                              | « Liste » seul, « mon vocabulaire » dans un libellé |
| **Ajouter une carte** ≠ **Ajouter une liste**                     | une carte à la main ≠ plusieurs cartes d'un coup, ajoutées à Ma liste, par une liste prédéfinie ou par un fichier CSV (jamais une liste à part)                                                                               | `/anglais/ajouter`, `/anglais/ajouter-liste`                   | « Ajouter » seul, « Import / export »               |
| **Mode d'utilisation**                                            | réglage Standard ou Avancé : l'Avancé ajoute des actions comme la réinitialisation de l'apprentissage ; ne pas confondre avec le **mode d'apprentissage**                                                                     | `usageMode`                                                    |                                                     |
| **Mode d'apprentissage**                                          | réglage Guidé ou Autonome : le niveau d'explication de l'apprentissage et de la révision de l'anglais (Guidé explique chaque étape et pose la question) ; ne pas confondre avec le **mode d'utilisation** (Standard / Avancé) | `learningMode` (`Guided`, `Autonomous`)                        | « mode débutant / expert »                          |
| **Epic**                                                          | une version `v0.x` dans Jira                                                                                                                                                                                                  |                                                                |                                                     |

Entretien : ajouter une ligne dès qu'un nouveau terme apparaît dans l'interface ; un terme qui change se change aussi dans `nouns.ts` et dans les stories ouvertes. Depuis MEM-120, le test `apps/web/lib/vocabulary-guard.test.ts` fait échouer la CI si « élément » réapparaît dans les sources de l'interface ou de l'API (hors `nouns.ts` et exceptions justifiées dans le test).

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

Mises à jour de `MEMENTORIZE.md` : Claude peut fusionner la PR (CI verte) et resynchroniser la copie du projet Claude sans redemander l'accord.

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

Epics terminées : v0.1 (MEM-1) à v0.25 (MEM-124) : espaces par sujet, profil et réglages, apprentissage du vocabulaire, ergonomie Anglais, identité visuelle, prononciation, saisie bilingue, révision simplifiée, thématiques et import/export CSV, pagination et actions groupées, file d'apprentissage, espace Citations, réglages FSRS, réglages en onglets, console d'administration et sessions, entraînement à la prononciation (v0.16), espace Cartes mentales aux onglets Réviser, Liste et Ajouter (v0.17), nouvelle procédure d'apprentissage du vocabulaire en trois étapes : écoute et prononciation, anglais → français, évaluation (v0.18, MEM-100 ; PR #122 à #136), indice de rappel des citations, dans le CSV et en révision (v0.19, MEM-105 ; PR #137 à #139), mode d'utilisation Standard / Avancé et réinitialisation de l'apprentissage depuis les listes (v0.20, MEM-109 ; PR #140 et #141), « Mes statistiques », page à onglets Anglais et Citations ouverte depuis la popup du compte, avec la prochaine révision et la progression (v0.21, MEM-112 ; PR #156 et #157), listes prédéfinies de mots par niveau A1 à C2 : catalogue de la console (listes, saisie, import et export CSV des mots, migration `20261103200000_predefined_lists`) et ajout par l'utilisateur, en copies (v0.22, MEM-115 ; PR #159 à #161), « carte » à la place d'« élément » dans l'espace Anglais, avec un test garde-fou (v0.23, MEM-119 ; PR #164), sous-menu Anglais Apprendre · Réviser, Ma liste (avec l'export CSV), Ajouter une carte, Ajouter une liste (liste prédéfinie ou fichier), anciennes adresses redirigées (v0.24, MEM-121 ; PR #165 et #166), modes d'apprentissage Guidé / Autonome : réglage (migration `20261105090000_learning_mode`), page explicative avant le choix des cartes, questions « Comment le dit-on en français / en anglais ? », et bouton « Réessayer » à l'étape 2 dans les deux modes (v0.25, MEM-124 ; PR #168 à #171).

Hors epic, depuis : « + Ajouter » ouvre une page de sélection dans la préparation d'une session de citations, comme en Anglais (PR #142) ; « Indice de rappel » multiligne (PR #143) ; page « Ressources », icône de l'en-tête sur ordinateur et onglet de la barre du bas sur téléphone (PR #145) ; fin d'apprentissage avec la prochaine révision et un graphique de progression, et l'historique des états d'apprentissage (PR #146, migration `20261101200000_learning_status_history`) ; le même écran de fin à la révision d'un espace (PR #148) ; suppression de « Tout réviser » (PR #149) ; écrans de fin allégés (PR #151) ; « Réviser » avant « Apprendre » dans les espaces (PR #152) ; onglet « Ajouter » sans saisie semi-automatique et avec deux boutons radio pour la file (PR #153) ; « par sessions de cinq » retiré (PR #154) ; la prononciation anglaise va au bout, la suivante attend (PR #155) ; console : sélection et suppression en masse des mots d'une liste du catalogue (PR #162) ; un même titre de liste possible pour des niveaux différents, le niveau dans le nom du fichier exporté (PR #167).

Toutes les epics sont closes (v0.22 à v0.25 clôturées le 2026-11-05) et aucune story n'est ouverte : le prochain travail est à définir.

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
