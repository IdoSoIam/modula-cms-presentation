# Modula CMS Presentation Runtime

Cette arborescence simule une instance de production.

## Structure

- `current/` : version active déployée
- `releases/` : versions extraites, utiles pour rollback
- `.env` : configuration runtime persistante
- `shared/data/` : données persistantes
- `shared/uploads/` : uploads persistants
- `shared/run/` : PID et fichiers de service

## Commandes

```bash
npm run deploy:local -- 0.1.1
npm run start
npm run stop
npm run status
```

## Rôle dans la nouvelle architecture

Cette instance :

- ne build rien
- ne publie rien
- consomme une release déjà construite depuis `D:\Works\modula-cms`
- utilise le registre Cloudflare uniquement pour lire les templates et les releases

Le script local de mise à jour est embarqué dans la release sous `current/scripts/update-agent.mjs`.
Il lit la même configuration que le CMS dans `.env`.
En configuration standard, il écoute sur `127.0.0.1:4401` et n’a pas besoin de variables dédiées.

## Installation type

1. Déployer une release dans `current/` avec `npm run deploy:local -- <version>`
2. Renseigner la configuration dans `.env`
3. Lancer `npm run start`
4. L’admin du CMS peut ensuite lire les releases du registre et déclencher une mise à jour

Wrangler n’est pas utilisé sur cette machine runtime.
Wrangler sert uniquement à déployer le registre Cloudflare dans `D:\Works\modula-cms-registery`.
