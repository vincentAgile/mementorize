# Conventions

Projet personnel, mais autant prendre de bonnes habitudes dès la phase 0.

## Branches

Une branche par phase de la feuille de route, fusionnée dans `main` seulement quand elle tourne de bout en bout :

```
phase/0-fondations
phase/1-api-minimale
phase/2-interface-minimale
...
```

Pour les extras entre deux phases : `feature/<sujet>` ou `fix/<sujet>`.

## Commits — Conventional Commits

```
<type>(<scope optionnel>): <description>
```

Types utilisés : `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `ci`.

Exemples :

```
feat(api): ajoute le CRUD quotes
chore(repo): initialise le monorepo pnpm + turborepo
ci: ajoute le workflow de lint et de tests
```

## Règle d'or

Une phase = une branche = une pull request. On ne merge que si la phase se termine par quelque chose qui tourne réellement (voir le principe directeur de la feuille de route).
