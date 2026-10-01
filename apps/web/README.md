# Mementorize — Web (Next.js)

Interface de Mementorize : connexion / inscription (phase 3), liste et ajout de ses fiches (citations et vocabulaire anglais), écran de révision (phases 4 et 5), et éditeur de cartes mentales (phase 6).

## Prérequis

`apps/api` doit tourner (voir [../api/README.md](../api/README.md)) : cette interface ne fait qu'appeler son API en HTTP, elle n'a pas sa propre base de données.

## Démarrage

```bash
cp .env.example .env.local   # API_URL, par défaut http://localhost:3000
pnpm --filter web dev        # http://localhost:3001 (le 3000 est déjà pris par l'API)
```

## Organisation

- `proxy.ts` — s'exécute avant chaque requête : sans cookie de session, redirige vers `/login` (vérification « optimiste », la vraie vérification du token est faite par l'API).
- `app/(auth)/` — groupe de routes (les parenthèses n'apparaissent pas dans l'URL) : `/login`, `/register`, les Server Actions d'authentification et `/session-expired` (Route Handler qui efface un cookie périmé).
- `app/page.tsx` — Server Component : récupère l'utilisateur et ses fiches côté serveur, avec le token de la session ; filtre par type via `?type=`.
- `app/items/` — formulaire d'ajout, citation ou mot de vocabulaire (client component + Server Action).
- `app/review/` — écran « À réviser » : une carte à la fois, « Afficher la réponse », puis 4 boutons d'auto-évaluation qui indiquent quand la carte reviendra. Raccourcis : `Espace` pour révéler, `1` à `4` pour répondre. `facesOf()` (dans `page.tsx`) décide du recto et du verso selon le type de carte : auteur + premiers mots pour une citation, mot anglais ou traduction pour le vocabulaire.
- `app/mind-maps/` — cartes mentales (phase 6), voir ci-dessous.
- `app/app-header.tsx` — en-tête commun (navigation, nombre de révisions en attente, déconnexion).
- `lib/session.ts` — le cookie de session (httpOnly) qui contient le JWT renvoyé par l'API.
- `lib/api.ts` — client HTTP vers l'API, **côté serveur uniquement** (`import 'server-only'`).
- `lib/types.ts` — `Item` est une *union discriminée* : tester `item.type` suffit pour que TypeScript connaisse la forme de `item.content`.
- `lib/mind-map.ts` — fonctions sur l'arbre d'une carte mentale (racine, branches, sous-arbre, mise en page), sans React ni React Flow.

## Cartes mentales (phase 6)

On crée une carte mentale depuis le formulaire d'ajout (type « Carte mentale ») : seul le sujet central est demandé, puis l'éditeur s'ouvre.

| fichier | rôle |
|---------|------|
| `mind-maps/[id]/page.tsx` | Server Component : charge la carte, affiche l'éditeur |
| `mind-maps/[id]/actions.ts` | Server Actions : enregistrer (tout l'arbre), supprimer |
| `mind-maps/mind-map-editor.tsx` | éditeur (client component), basé sur [@xyflow/react](https://reactflow.dev) |
| `mind-maps/mind-map-viewer.tsx` | la même carte en lecture seule, pour l'écran de révision |
| `mind-maps/topic-node.tsx` | le composant d'un nœud (*custom node* React Flow), partagé par les deux |
| `mind-maps/flow.ts` | conversions entre l'arbre stocké et les nœuds / arêtes de React Flow |

**Édition.** Sélectionner une idée, puis : `Tab` ajoute un enfant, `Entrée` un voisin, `F2` ou un double-clic renomme, `Suppr` supprime l'idée et tout ce qui en part, `Ctrl+S` enregistre. On déplace une idée en la faisant glisser ; « Réorganiser » range tout l'arbre en colonnes. Les liens se créent uniquement par ces commandes, jamais en tirant un trait entre deux nœuds : c'est ce qui garantit que la carte reste un arbre.

**État local, puis enregistrement explicite.** L'éditeur travaille sur son propre état (`useNodesState`) et n'envoie l'arbre à l'API qu'au clic sur « Enregistrer ». Tant qu'il y a des modifications non enregistrées, c'est affiché, et quitter la page demande une confirmation.

**Le format stocké ne dépend pas de React Flow.** L'API garde `{ id, parentId, label, position }` ; React Flow ajoute ses propres champs (`selected`, `measured`, `type`…) qui n'ont rien à faire en base. `flow.ts` fait la conversion dans les deux sens, et les arêtes sont recalculées à partir de `parentId`.

**Révision.** Une carte de révision = une branche. `facesOf()` masque la branche demandée et toutes ses idées *côté serveur* : leurs libellés ne sont pas dans le recto envoyé au navigateur. La forme de la branche (combien de sous-idées) reste visible, comme indice. Le verso montre la carte entière, avec la branche en surbrillance.

**Deux pièges rencontrés avec React Flow :**

- `colorMode="system"` est résolu dans le navigateur seulement : le HTML rendu côté serveur est en mode clair, le client passe en sombre, et React signale une erreur d'hydratation. Le mode sombre passe donc par les variables CSS de React Flow (`--xy-edge-stroke`…), dans `globals.css`, comme le reste de la page.
- React Flow cache un nœud (`visibility: hidden`) tant qu'il ne l'a pas mesuré, et un champ caché ne peut pas prendre le focus : sans précaution, la première lettre tapée dans une idée toute neuve était perdue. Un nouveau nœud reçoit donc une taille provisoire (`initialWidth` / `initialHeight`), ce qui le rend visible dès son premier rendu.

## Pourquoi le navigateur n'appelle plus l'API directement

En phase 2, le navigateur appelait l'API en `fetch`. Avec l'authentification, il faudrait lui confier le token, donc le stocker quelque part de lisible en JavaScript (localStorage), ce qui l'expose en cas de faille XSS.

À la place, Next.js joue le rôle d'intermédiaire (on parle de *Backend For Frontend*) :

1. Le formulaire de connexion appelle une **Server Action**, qui exécute `POST /auth/login` depuis le serveur Next.js.
2. Le JWT reçu est rangé dans un cookie **httpOnly** : le navigateur le renvoie automatiquement à Next.js, mais aucun script de la page ne peut le lire.
3. Pour afficher ou créer des quotes, Next.js lit le cookie et appelle l'API avec `Authorization: Bearer <token>`.

Conséquence : l'URL de l'API n'est plus exposée au navigateur, d'où `API_URL` au lieu de `NEXT_PUBLIC_API_URL`.

## Image Docker (phase 7)

`apps/web/Dockerfile` construit l'app avec `output: 'standalone'` (`next.config.ts`) : en plus du build habituel, `next build` produit `.next/standalone`, un `server.js` autonome accompagné des seuls fichiers de `node_modules` réellement utilisés (environ 40 Mo). L'image finale ne contient que ce dossier et les fichiers statiques (`.next/static`, que Next.js laisse de côté, car un CDN les servirait normalement).

- **`outputFileTracingRoot`** : dans un monorepo pnpm, les dépendances sont dans le `node_modules` de la racine. Next.js trace donc les fichiers depuis la racine du dépôt, et le serveur se retrouve dans `.next/standalone/apps/web/server.js`.
- **`API_URL` est lu à l'exécution, pas au build** : il n'est utilisé que côté serveur (pas de `NEXT_PUBLIC_`), et toutes les pages sont dynamiques. La même image fonctionne quelle que soit l'adresse de l'API ; `docker-compose.yml` la fixe à `http://api:3000`, le nom du service sur le réseau Docker.
- **`HOSTNAME=0.0.0.0`** : par défaut le serveur n'écoute que dans le conteneur ; il doit écouter sur toutes les interfaces pour que le port publié fonctionne.
- **Cookie de session en production** : l'image tourne avec `NODE_ENV=production`, donc le cookie est `Secure` (HTTPS seulement). Chrome, Edge et Firefox font une exception pour `http://localhost` (vérifié avec Chromium), ce qui suffit en local ; la phase 8 apportera HTTPS.

## Note sur les imports

Contrairement à `apps/api` (NodeNext + imports `.js` explicites), Next.js résout les modules TypeScript via `moduleResolution: "bundler"` : pas d'extension sur les imports relatifs (`from './lib/api'`, pas `'./lib/api.js'`). Chaque app garde la convention par défaut de son framework.
