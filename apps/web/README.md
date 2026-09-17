# Mementorize — Web (Next.js)

Interface minimale de la phase 2 : liste les quotes exposées par `apps/api` et permet d'en ajouter une.

## Prérequis

`apps/api` doit tourner (voir [../api/README.md](../api/README.md)) — cette interface ne fait qu'appeler son API en HTTP, elle n'a pas sa propre base de données.

## Démarrage

```bash
cp .env.example .env.local   # NEXT_PUBLIC_API_URL, par défaut http://localhost:3000
pnpm --filter web dev        # http://localhost:3001 (le 3000 est déjà pris par l'API)
```

## Ce que fait cette phase

- `app/page.tsx` — page d'accueil (server component)
- `app/quotes/quotes-manager.tsx` — client component : charge les quotes au montage, formulaire d'ajout
- `lib/api.ts` — petit client HTTP vers l'API NestJS (`fetch`)
- `lib/types.ts` — type `Quote` côté front, en miroir du modèle Prisma

Pas d'authentification, pas de state management, pas de design system : l'objectif de cette phase est uniquement de valider la connexion front ↔ API. Le reste (auth, FSRS, cartes mentales) arrive dans les phases suivantes.

## Note sur les imports

Contrairement à `apps/api` (NodeNext + imports `.js` explicites), Next.js résout les modules TypeScript via `moduleResolution: "bundler"` : pas d'extension sur les imports relatifs (`from './lib/api'`, pas `'./lib/api.js'`). Chaque app garde la convention par défaut de son framework.
