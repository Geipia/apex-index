# ERAZ Index

Le classement de référence des IA, calculé à partir des benchmarks les plus exigeants
(Humanity's Last Exam, ARC-AGI, FrontierMath, SWE-bench Pro, OSWorld, GDPval…).
Site statique : `index.html`, `styles.css`, `app.js`.

## Données

| Fichier | Rôle |
|---|---|
| `data.js` | Configuration : catégories, benchmarks (poids, planchers, liens), modèles suivis, valeurs de base saisies à la main. |
| `scores.js` | **Généré.** Scores récupérés depuis les sources, avec le lien vers la source de chaque score. Prime sur `data.js`. |
| `scripts/update-data.mjs` | Récupère les scores depuis BenchLM (pages modèles) et Artificial Analysis (Intelligence Index, coût, open weights). |

## Mettre à jour les scores

```bash
node scripts/update-data.mjs --dry-run   # voir ce qui change
node scripts/update-data.mjs             # écrire scores.js
```

Node 18 ou plus récent, aucune dépendance. Le script liste aussi les modèles bien classés
qui ne sont pas encore suivis ; pour en ajouter un, créez son entrée dans `data.js`
(`id` = slug de sa page `benchlm.ai/models/<slug>`, `aa` = son nom chez Artificial Analysis s'il diffère).

Sur GitHub, le workflow `.github/workflows/update-scores.yml` lance le script chaque jour
et publie automatiquement s'il y a du nouveau.

## Lancer en local

```bash
python -m http.server 8790
```
