# Duodeal Dashboard

Dashboard interne pour suivre l'usage de Duodeal chez les clients Stage'In.

## Ce que ça fait

- Liste toutes les companies clientes (Airtable Management) avec leur usage mensuel Duodeal
- Détecte les baisses : alerte Slack si `deals_ce_mois < 50% × moy_3_derniers_mois` (garde neutre avant le 15)
- Switch rapide entre comptes clients via les URLs "Login as" déjà générées dans Airtable

## Prérequis manuels

Avant de lancer, il faut :

1. **Airtable** — base Management (`appvoxHefQgJYWqND`), table **Companies** (`tblMauMvSlkmzdZxa`) :
   - Champ `API Key` (singleLineText, `fldmh5wDq9khLdUbl`) — déjà créé, à remplir pour chaque client actif
   - Champ `Last Alert Sent` (dateTime, `fldwRvxcOJlo8EtTT`) — déjà créé, laissé vide (rempli par le cron)
2. **Slack** — créer canal `#duodeal-usage-alerts` + Incoming Webhook
3. **Token Airtable** — PAT avec scopes `data.records:read` ET `data.records:write` (pour marquer les alertes envoyées), sur la base Management
4. Copier `.env.local.example` → `.env.local` et remplir

## Dev

```bash
npm install
npm run dev
# http://localhost:3001
```

## Tester le cron manuellement

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3001/api/cron/check-usage
```

## Déploiement

Vercel-ready. Le cron est déclaré dans `vercel.json` (tous les jours 09:00 UTC).
