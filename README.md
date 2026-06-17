# Modula CMS Presentation Runtime

`modula-cms-presentation` est le support de référence pour une instance Node de production basée sur Modula CMS.

Ce dépôt n’est pas le socle CMS lui-même. Il représente une instance hôte prête à consommer les releases publiées depuis :

- CMS source : [IdoSoIam/modula-cms](https://github.com/IdoSoIam/modula-cms)
- registre : [IdoSoIam/modula-cms-registry](https://github.com/IdoSoIam/modula-cms-registry)

## Rôle du dépôt

Cette instance sert à :

- simuler une vraie instance de production en local
- servir de base de déploiement Node
- consommer des releases packagées
- dialoguer avec le registre pour les modèles de site et les mises à jour

Elle ne sert pas à :

- builder le CMS source
- publier des releases
- contenir la logique cœur du produit

## Structure

- `current/` : version active déployée
- `releases/` : versions extraites, utiles pour rollback
- `.env` : configuration runtime persistante
- `shared/data/` : base SQLite et données persistantes hors release
- `shared/uploads/` : uploads persistants
- `shared/run/` : PID et fichiers de service

## Commandes

```bash
npm run deploy:local -- 0.1.1
npm run start
npm run stop
npm run status
```

## Architecture runtime

Cette instance :

- ne build rien
- ne publie rien
- consomme une release déjà construite depuis `modula-cms`
- utilise le registre pour lire les templates et les releases

Le registre système est lisible publiquement. Une clé n’est utile ici que pour les opérations de mutation ou pour brancher un registre custom.

Le moteur local de mise à jour est embarqué dans la release sous `current/scripts/update-agent.mjs`.
Il lit la même configuration que le CMS dans `.env`.
En configuration standard, il écoute sur `127.0.0.1:4401` et n’a pas besoin d’une configuration séparée.

## Installation type

1. Déployer une release dans `current/` avec `npm run deploy:local -- <version>`
2. Renseigner la configuration dans `.env`
3. Lancer `npm run start`
4. Utiliser l’admin du CMS pour lire les releases du registre et déclencher une mise à jour

Wrangler n’est pas utilisé sur cette machine runtime.
Wrangler sert uniquement pour les projets Cloudflare, notamment le registre.

## Contribution

Les contributions sur ce dépôt doivent rester centrées sur son rôle d’instance hôte.

### Principes

- ne pas déplacer ici la logique cœur du CMS
- ne pas transformer ce dépôt en source de build produit
- préserver la structure `current/`, `releases/`, `shared/`
- conserver le comportement d’une instance Node proche de la production
- éviter les dépendances inutiles côté runtime

### Workflow recommandé

1. adapter la structure d’instance ou les scripts runtime si nécessaire
2. tester démarrage, arrêt, statut et déploiement local
3. vérifier la compatibilité avec les releases publiées depuis `modula-cms`
4. documenter clairement tout changement impactant le déploiement Node

## Licence

Ce projet est distribué sous licence `GNU GPL v3.0`.

Cela signifie notamment :

- vous pouvez utiliser et modifier ce dépôt
- vous pouvez redistribuer une version modifiée
- si vous redistribuez cette version modifiée, vous devez rester dans la famille GPL
- vous devez conserver l’accès au code source correspondant pour les destinataires

Le texte complet est fourni dans [LICENSE](D:/Works/modula-cms-presentation/LICENSE).

### Mise en place

La licence est posée ici via :

1. un identifiant SPDX dans `package.json`
2. un fichier `LICENSE` à la racine
3. cette documentation dans le `README`
