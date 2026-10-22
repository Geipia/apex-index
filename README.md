# ERAZ Index

Le classement de référence des IA, calculé à partir des benchmarks les plus exigeants
(Humanity's Last Exam, ARC-AGI, FrontierMath, SWE-bench Pro, OSWorld, GDPval…).
Site statique bilingue, **entièrement généré** par `scripts/build.mjs` : ne modifiez pas les fichiers HTML à la main.

| Généré | Contenu |
|---|---|
| `index.html`, `analyses.html`, `matrice.html`, `benchmarks.html`, `a-propos.html`, `admin.html` | Pages en français |
| `en/` | Les mêmes pages en anglais |
| `modele/<id>.html`, `en/model/<id>.html` | Une fiche par modèle, dans les deux langues |
| `badge/<id>.svg` | Badge à intégrer (rang et points), mis à jour chaque jour |
| `sitemap.xml`, `urls.txt` | Plan du site avec versions linguistiques ; liste des URL pour IndexNow |

Code commun : `scoring.js` (formule des points, partagée avec le générateur), `i18n.js` (textes FR/EN de l'interface), `app.js`, `charts.js`, `styles.css`. Les textes fixes des pages sont dans `scripts/build.mjs`.

## Données

| Fichier | Rôle |
|---|---|
| `data.js` | Configuration : catégories, benchmarks (poids, planchers, liens), modèles suivis, valeurs de base saisies à la main. |
| `history.js` | **Généré.** Une photo des scores bruts par jour, pour le graphique d'évolution. |
| `scores.js` | **Généré.** Scores récupérés depuis les sources, avec le lien vers la source de chaque score. Prime sur `data.js`. |
| `scripts/update-data.mjs` | Récupère les scores depuis BenchLM (pages modèles) et Artificial Analysis (Intelligence Index, coût, open weights). |

## Mettre à jour les scores

```bash
node scripts/update-data.mjs --dry-run   # voir ce qui change
node scripts/update-data.mjs             # écrire scores.js
node scripts/build.mjs                   # regénérer toutes les pages
node scripts/indexnow.mjs                # prévenir Bing & co (après publication)
```

Node 18 ou plus récent, aucune dépendance. Le script liste aussi les modèles bien classés
qui ne sont pas encore suivis ; pour en ajouter un, créez son entrée dans `data.js`
(`id` = slug de sa page `benchlm.ai/models/<slug>`, `aa` = son nom chez Artificial Analysis s'il diffère).

Sur GitHub, le workflow `.github/workflows/update-scores.yml` lance ces scripts chaque jour,
publie s'il y a du nouveau, puis prévient les moteurs de recherche via IndexNow
(la clé est le fichier `.txt` à la racine).

## Lancer en local

```bash
python -m http.server 8790
```
