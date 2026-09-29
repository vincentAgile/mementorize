# Mementorize — Web (Next.js)

Interface de Mementorize : connexion / inscription (phase 3), liste et ajout de ses fiches (citations et vocabulaire anglais), et écran de révision (phases 4 et 5).

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
- `app/app-header.tsx` — en-tête commun (navigation, nombre de révisions en attente, déconnexion).
- `lib/session.ts` — le cookie de session (httpOnly) qui contient le JWT renvoyé par l'API.
- `lib/api.ts` — client HTTP vers l'API, **côté serveur uniquement** (`import 'server-only'`).
- `lib/types.ts` — `Item` est une *union discriminée* : tester `item.type` suffit pour que TypeScript connaisse la forme de `item.content`.

## Pourquoi le navigateur n'appelle plus l'API directement

En phase 2, le navigateur appelait l'API en `fetch`. Avec l'authentification, il faudrait lui confier le token, donc le stocker quelque part de lisible en JavaScript (localStorage), ce qui l'expose en cas de faille XSS.

À la place, Next.js joue le rôle d'intermédiaire (on parle de *Backend For Frontend*) :

1. Le formulaire de connexion appelle une **Server Action**, qui exécute `POST /auth/login` depuis le serveur Next.js.
2. Le JWT reçu est rangé dans un cookie **httpOnly** : le navigateur le renvoie automatiquement à Next.js, mais aucun script de la page ne peut le lire.
3. Pour afficher ou créer des quotes, Next.js lit le cookie et appelle l'API avec `Authorization: Bearer <token>`.

Conséquence : l'URL de l'API n'est plus exposée au navigateur, d'où `API_URL` au lieu de `NEXT_PUBLIC_API_URL`.

## Note sur les imports

Contrairement à `apps/api` (NodeNext + imports `.js` explicites), Next.js résout les modules TypeScript via `moduleResolution: "bundler"` : pas d'extension sur les imports relatifs (`from './lib/api'`, pas `'./lib/api.js'`). Chaque app garde la convention par défaut de son framework.
