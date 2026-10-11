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

## Intégration continue

Une pull request ne se fusionne que si la CI est au vert (voir la section « Intégration continue » du README). Pour l'imposer, dans les réglages GitHub du dépôt : **Settings → Rules → Rulesets → New branch ruleset**, cible `main`, règle **Require status checks to pass** avec les six jobs du workflow `CI`.

Le formatage est fait par Prettier, avec une configuration unique à la racine (`.prettierrc.json`) ; VS Code l'applique à l'enregistrement (`.vscode/settings.json`). En ligne de commande : `pnpm format`.
