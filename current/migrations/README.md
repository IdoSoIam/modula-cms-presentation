# Migrations `modula-cms`

Le système repose sur deux notions distinctes :

- le schéma TypeScript source dans `schema/cms-data-schema.ts`
- les migrations explicites versionnées dans `migrations/`

## Installation d'une base vide

Pour une base vide, `modula-cms` peut générer un bootstrap SQL complet par moteur à partir du schéma source.

- `sqlite` : bootstrap appliqué automatiquement via `npm run db:migrate`
- `d1` : bootstrap appliqué via `npm run cms:db:d1:migrate:local` ou `npm run cms:db:d1:migrate:remote`

Après bootstrap, toutes les migrations existantes sont marquées comme satisfaites dans `_cms_migrations`.

## Mise à jour d'une base existante

Les upgrades ne doivent pas être déduits automatiquement du schéma.

Il faut ajouter une migration explicite :

```bash
npm run db:migrate:scaffold -- add_feature_name
```

Cela crée un dossier du type :

```text
migrations/0011_add_feature_name/
  manifest.json
  before.schema.json
  after.schema.json
  sqlite.sql
  d1.sql
```

Le scaffold :

- compare le dernier snapshot connu avec le schéma TypeScript courant
- enregistre les hashes avant/après
- génère des fichiers SQL vides à compléter

## Format

- `manifest.json` décrit l'identité de la migration et les fichiers SQL à utiliser
- `sqlite.sql` et `d1.sql` sont les scripts `up`
- les scripts `down` sont optionnels et peuvent être ajoutés plus tard dans le manifest

## Commandes utiles

- `npm run db:generate:internal`
- `npm run db:migrate`
- `npm run db:migrate:status`
- `npm run db:migrate:scaffold -- migration_name`
- `npm run cms:db:d1:migrate:local`
- `npm run cms:db:d1:migrate:remote`
