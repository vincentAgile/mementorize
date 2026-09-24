# Mementorize — Web (Next.js)

Interface de Mementorize : connexion / inscription (phase 3), puis liste et ajout de ses propres quotes.

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
- `app/page.tsx` — Server Component : récupère l'utilisateur et ses quotes côté serveur, avec le token de la session.
- `app/quotes/` — formulaire d'ajout (client component + Server Action).
- `lib/session.ts` — le cookie de session (httpOnly) qui contient le JWT renvoyé par l'API.
- `lib/api.ts` — client HTTP vers l'API, **côté serveur uniquement** (`import 'server-only'`).

## Pourquoi le navigateur n'appelle plus l'API directement

En phase 2, le navigateur appelait l'API en `fetch`. Avec l'authentification, il faudrait lui confier le token, donc le stocker quelque part de lisible en JavaScript (localStorage), ce qui l'expose en cas de faille XSS.

À la place, Next.js joue le rôle d'intermédiaire (on parle de *Backend For Frontend*) :

1. Le formulaire de connexion appelle une **Server Action**, qui exécute `POST /auth/login` depuis le serveur Next.js.
2. Le JWT reçu est rangé dans un cookie **httpOnly** : le navigateur le renvoie automatiquement à Next.js, mais aucun script de la page ne peut le lire.
3. Pour afficher ou créer des quotes, Next.js lit le cookie et appelle l'API avec `Authorization: Bearer <token>`.

Conséquence : l'URL de l'API n'est plus exposée au navigateur, d'où `API_URL` au lieu de `NEXT_PUBLIC_API_URL`.

## Note sur les imports

Contrairement à `apps/api` (NodeNext + imports `.js` explicites), Next.js résout les modules TypeScript via `moduleResolution: "bundler"` : pas d'extension sur les imports relatifs (`from './lib/api'`, pas `'./lib/api.js'`). Chaque app garde la convention par défaut de son framework.
