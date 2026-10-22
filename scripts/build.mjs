#!/usr/bin/env node
// Génère toutes les pages du site à partir des données du jour :
//   - pages principales en français (/) et en anglais (/en/)
//   - une fiche par modèle dans les deux langues (/modele/…, /en/model/…)
//   - un badge SVG par modèle (/badge/…), à intégrer sur d'autres sites
//   - sitemap.xml (avec les versions linguistiques) et la liste des URL pour IndexNow
//
// Usage : node scripts/build.mjs   (lancé chaque jour par le workflow, après update-data.mjs)
// Les textes fixes des pages sont dans TX ci-dessous ; ceux générés par le navigateur sont dans i18n.js.

import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://eraz.ovh";
const X_URL = "https://x.com/erazindex";

// ---------- Données ----------
const ctx = { window: {} };
ctx.globalThis = ctx.window;
vm.createContext(ctx);
for (const f of ["data.js", "scores.js", "history.js", "scoring.js", "i18n.js"]) {
  try { vm.runInContext(await readFile(path.join(ROOT, f), "utf8"), ctx); } catch (e) { if (f !== "history.js") throw e; }
}
const W = ctx.window;
const Z = W.ERAZScore;
const D = Z.prepare(W.APEX_DATA, W.APEX_SCORES);
const ROWS = Z.rank(D, Z.PRESETS.balanced);
const HIST = Z.historyPoints(D, W.ERAZ_HISTORY || [], Z.PRESETS.balanced);
const N = ROWS.length;

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---------- Adresses de chaque page, par langue ----------
const PAGES = {
  home:       { fr: "/",                en: "/en/" },
  analyses:   { fr: "/analyses.html",   en: "/en/analyses.html" },
  matrix:     { fr: "/matrice.html",    en: "/en/matrix.html" },
  benchmarks: { fr: "/benchmarks.html", en: "/en/benchmarks.html" },
  about:      { fr: "/a-propos.html",   en: "/en/about.html" },
  admin:      { fr: "/admin.html" },
};
const modelUrl = (lang, id) => (lang === "en" ? `/en/model/${id}.html` : `/modele/${id}.html`);
const fileOf = (url) => path.join(ROOT, url.endsWith("/") ? url + "index.html" : url);

// ---------- Textes fixes ----------
const TX = {
  fr: {
    htmlLang: "fr", ogLocale: "fr_FR", other: "en",
    keywords: "classement IA, meilleure IA, comparatif IA, benchmark IA, classement LLM, LLM leaderboard, GPT, Claude, Gemini, Grok, DeepSeek, Humanity's Last Exam, ARC-AGI, FrontierMath, SWE-bench",
    nav: { home: "Classement", analyses: "Analyses", matrix: "Matrice", benchmarks: "Benchmarks" },
    homeAria: "ERAZ Index, accueil", theme: "Changer de thème", langSwitch: "EN", langAria: "English version", xAria: "ERAZ Index sur X",
    ticker: "Classement du jour et variations depuis la veille",
    edition: "Édition", daily: "Mise à jour chaque jour", close: "Fermer",
    footAbout: "Le classement de référence de l'intelligence artificielle, recalculé chaque jour à partir de quatorze benchmarks indépendants.",
    footIndex: "L'index", footData: "Données", footFollow: "Suivre", footPages: "Pages du site",
    license: "classement sous licence", licenseUrl: "https://creativecommons.org/licenses/by/4.0/deed.fr",
    footBase: "Données publiques agrégées · meilleure configuration publiée de chaque modèle · mise à jour quotidienne à 6 h UTC",
  },
  en: {
    htmlLang: "en", ogLocale: "en_US", other: "fr",
    keywords: "AI leaderboard, best AI model, AI ranking, AI benchmarks, LLM leaderboard, LLM ranking, GPT, Claude, Gemini, Grok, DeepSeek, Humanity's Last Exam, ARC-AGI, FrontierMath, SWE-bench",
    nav: { home: "Ranking", analyses: "Analysis", matrix: "Matrix", benchmarks: "Benchmarks" },
    homeAria: "ERAZ Index, home", theme: "Toggle theme", langSwitch: "FR", langAria: "Version française", xAria: "ERAZ Index on X",
    ticker: "Today's ranking and change since yesterday",
    edition: "Edition", daily: "Updated daily", close: "Close",
    footAbout: "The reference ranking of artificial intelligence, recalculated every day from fourteen independent benchmarks.",
    footIndex: "The index", footData: "Data", footFollow: "Follow", footPages: "Site pages",
    license: "ranking licensed under", licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    footBase: "Aggregated public data · best published configuration of each model · updated daily at 6:00 UTC",
  },
};

const MARK = (s) => `<svg viewBox="0 0 32 32" width="${s}" height="${s}" aria-hidden="true"><path d="M16 3 29 28H3Z" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/><path d="M16 13 22 25H10Z" fill="var(--accent)"/></svg>`;
const X_ICON = `<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M17.8 3h3.1l-6.8 7.7L22 21h-6.2l-4.9-6.4L5.3 21H2.2l7.2-8.3L1.8 3h6.4l4.4 5.8L17.8 3Zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5Z" fill="currentColor"/></svg>`;

// ---------- Gabarit commun ----------
function layout({ lang, key, title, desc, url, alt, body, ld, noindex = false, noCount = false, charts = false, admin = false }) {
  const t = TX[lang];
  const navKeys = ["home", "analyses", "matrix", "benchmarks"];
  const altUrl = alt ? alt[t.other] : null;
  const hreflang = alt ? `
  <link rel="alternate" hreflang="fr" href="${SITE}${alt.fr}">
  <link rel="alternate" hreflang="en" href="${SITE}${alt.en}">
  <link rel="alternate" hreflang="x-default" href="${SITE}${alt.fr}">` : "";
  const scripts = ["/data.js", "/scores.js", "/history.js", "/scoring.js", "/i18n.js", ...(charts ? ["/charts.js"] : []), "/app.js", ...(admin ? ["/admin.js"] : [])];
  const year = D.updated.slice(0, 4);
  return `<!doctype html>
<html lang="${t.htmlLang}"${noCount ? " data-no-count" : ""}>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>${noindex ? `
  <meta name="robots" content="noindex, nofollow">` : `
  <meta name="description" content="${esc(desc)}">
  <meta name="keywords" content="${esc(t.keywords)}">
  <link rel="canonical" href="${SITE}${url}">${hreflang}
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="ERAZ Index">
  <meta property="og:url" content="${SITE}${url}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:locale" content="${t.ogLocale}">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:site" content="@erazindex">`}${ld ? `
  <script type="application/ld+json">
${JSON.stringify(ld, null, 2)}
  </script>` : ""}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&family=Newsreader:ital,opsz,wght@0,6..72,400..700;1,6..72,400..700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/styles.css">
  <script src="/analytics.js" defer></script>
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath d='M16 3 29 28H3Z' fill='%233987e5'/%3E%3C/svg%3E">
</head>
<body>
  <header class="topbar">
    <div class="wrap topbar-inner">
      <a class="brand" href="${PAGES.home[lang]}" aria-label="${t.homeAria}">
        ${MARK(26)}
        <span>ERAZ<em>Index</em></span>
      </a>
      <nav class="nav" aria-label="Pages">
${navKeys.map((k) => `        <a href="${PAGES[k][lang]}"${k === key ? ' aria-current="page"' : ""}>${t.nav[k]}</a>`).join("\n")}
      </nav>
      <div class="top-tools">${altUrl ? `
        <a class="lang-link" href="${altUrl}" hreflang="${t.other}" lang="${t.other}" aria-label="${t.langAria}">${t.langSwitch}</a>` : ""}
        <a class="icon-btn x-link" href="${X_URL}" target="_blank" rel="noopener me" aria-label="${t.xAria}">${X_ICON}</a>
        <button class="icon-btn" id="themeToggle" type="button" aria-label="${t.theme}">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9Z" fill="currentColor"/></svg>
        </button>
      </div>
    </div>
  </header>
  <div class="ticker" id="ticker" aria-label="${t.ticker}"></div>

  <main id="top">
${body}
  </main>

  <footer class="footer">
    <div class="wrap footer-grid">
      <div class="footer-brand">
        <a class="brand" href="${PAGES.home[lang]}" aria-label="${t.homeAria}">
          ${MARK(24)}
          <span>ERAZ<em>Index</em></span>
        </a>
        <p>${t.footAbout}</p>
      </div>
      <nav class="footer-col" aria-label="${t.footPages}">
        <h4>${t.footIndex}</h4>
${navKeys.map((k) => `        <a href="${PAGES[k][lang]}">${t.nav[k]}</a>`).join("\n")}
      </nav>
      <div class="footer-col">
        <h4>${t.footData}</h4>
        <a href="https://artificialanalysis.ai/leaderboards/models" target="_blank" rel="noopener">Artificial Analysis</a>
        <a href="https://benchlm.ai" target="_blank" rel="noopener">BenchLM</a>
        <a href="https://arcprize.org/leaderboard" target="_blank" rel="noopener">ARC Prize</a>
        <a href="https://epoch.ai/frontiermath" target="_blank" rel="noopener">Epoch AI</a>
        <h4 class="footer-sub">${t.footFollow}</h4>
        <a href="${X_URL}" target="_blank" rel="noopener me">X · @erazindex</a>
      </div>
    </div>
    <div class="wrap footer-base">
      <span>© ${year} ERAZ Index · ${t.license} <a href="${t.licenseUrl}" target="_blank" rel="noopener license">CC BY 4.0</a></span>
      <span>${t.footBase}</span>
    </div>
  </footer>

  <div class="drawer-backdrop" id="backdrop" hidden></div>
  <aside class="drawer" id="drawer" aria-hidden="true" aria-labelledby="drawerTitle" role="dialog">
    <button class="icon-btn drawer-close" id="drawerClose" type="button" aria-label="${t.close}">
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
    </button>
    <div id="drawerBody"></div>
  </aside>

  <div class="tooltip" id="tooltip" role="tooltip" hidden></div>

${scripts.map((s) => `  <script src="${s}"></script>`).join("\n")}
</body>
</html>
`;
}

const editionLine = (lang, extra) => `<p class="edition"><span id="edition">${TX[lang].edition}</span><span class="sep" aria-hidden="true">·</span><span id="updated"></span><span class="sep" aria-hidden="true">·</span><span>${extra || TX[lang].daily}</span></p>`;
const pageHead = (lang, h1, lede, extra = "") => `    <section class="page-head wrap">
      ${editionLine(lang)}
${extra}      <h1>${h1}</h1>
      <p class="lede">${lede}</p>
    </section>`;

// ---------- Pages principales ----------
function modelIndex(lang) {
  const title = lang === "en" ? "Model pages" : "Fiches des modèles";
  return `    <section class="wrap section model-index">
      <h2>${title}</h2>
      <ul>
${ROWS.map((r) => `        <li><a href="${modelUrl(lang, r.m.id)}"><span>${r.rank}</span>${esc(r.m.name)}</a></li>`).join("\n")}
      </ul>
    </section>`;
}

const HOME = {
  fr: () => `    <section class="hero wrap">
      ${editionLine("fr")}
      <h1>Le classement de référence<br>de l'<em>intelligence artificielle</em>.</h1>
      <p class="lede">Les résultats des benchmarks les plus exigeants, réunis en un seul score. Chaque chiffre est sourcé.</p>
      <div class="stats" id="stats"></div>
      <div class="podium" id="podium" aria-label="Podium"></div>
    </section>
    <section id="classement" class="wrap section">
      <div class="section-head">
        <div>
          <h2>Classement général</h2>
          <p class="muted">Points ERAZ sur 1000. Cliquez sur un modèle pour voir le détail de ses résultats.</p>
        </div>
      </div>
${controls("fr")}
${rankingTable("fr")}
      <p class="footnote">« — » = résultat non publié ou non vérifié par une source indépendante. Le classement peut aussi être <button class="stealth-link" id="advancedToggle" type="button" aria-expanded="false" aria-controls="advanced">ajusté</button> selon vos priorités.</p>
      <div class="advanced" id="advanced" hidden>
        <div class="presets" role="group" aria-label="Profil de classement" id="presets"></div>
        <div class="weights-grid" id="weights"></div>
      </div>
    </section>
${modelIndex("fr")}
    <section class="wrap section about-link">
      <a href="${PAGES.about.fr}">À propos du classement</a>
    </section>`,
  en: () => `    <section class="hero wrap">
      ${editionLine("en")}
      <h1>The reference ranking<br>of <em>artificial intelligence</em>.</h1>
      <p class="lede">Results from the toughest benchmarks, combined into a single score. Every number is sourced.</p>
      <div class="stats" id="stats"></div>
      <div class="podium" id="podium" aria-label="Podium"></div>
    </section>
    <section id="classement" class="wrap section">
      <div class="section-head">
        <div>
          <h2>Overall ranking</h2>
          <p class="muted">ERAZ points out of 1000. Click a model to see its detailed results.</p>
        </div>
      </div>
${controls("en")}
${rankingTable("en")}
      <p class="footnote">"—" = result not published or not verified by an independent source. The ranking can also be <button class="stealth-link" id="advancedToggle" type="button" aria-expanded="false" aria-controls="advanced">adjusted</button> to your priorities.</p>
      <div class="advanced" id="advanced" hidden>
        <div class="presets" role="group" aria-label="Ranking profile" id="presets"></div>
        <div class="weights-grid" id="weights"></div>
      </div>
    </section>
${modelIndex("en")}
    <section class="wrap section about-link">
      <a href="${PAGES.about.en}">About the ranking</a>
    </section>`,
};

function controls(lang) {
  const en = lang === "en";
  return `      <div class="controls">
        <div class="filters">
          <label class="search">
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="m20 20-4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
            <input id="search" type="search" placeholder="${en ? "Search a model…" : "Rechercher un modèle…"}" aria-label="${en ? "Search a model" : "Rechercher un modèle"}">
          </label>
          <select id="orgFilter" aria-label="${en ? "Filter by lab" : "Filtrer par éditeur"}"></select>
          <label class="toggle"><input type="checkbox" id="openOnly"> <span>Open weights</span></label>
        </div>
      </div>`;
}

function rankingTable(lang) {
  const h = lang === "en"
    ? ["Model", "ERAZ points", "Reas.", "Math", "Code", "Agents", ["#1", "Number of benchmarks where the model ranks first"], ["Cov.", "Share of benchmarks published"], ["AA Index", "Artificial Analysis Intelligence Index (external reference)"], ["Input /1M", "API price per million tokens sent to the model (Artificial Analysis)"], ["Output /1M", "API price per million tokens generated by the model (Artificial Analysis)"]]
    : ["Modèle", "Points ERAZ", "Raison.", "Maths", "Code", "Agents", ["N°1", "Nombre de benchmarks où le modèle est n°1"], ["Couv.", "Part des benchmarks publiés"], ["AA Index", "Artificial Analysis Intelligence Index (référence externe)"], ["Entrée /1M", "Prix API pour 1 million de tokens envoyés au modèle (Artificial Analysis)"], ["Sortie /1M", "Prix API pour 1 million de tokens générés par le modèle (Artificial Analysis)"]];
  return `      <div class="table-wrap">
        <table class="ranking" id="ranking">
          <thead>
            <tr>
              <th class="c-rank" scope="col">#</th>
              <th scope="col">${h[0]}</th>
              <th class="c-points" scope="col" data-sort="points">${h[1]}</th>
              <th class="c-cat" scope="col" data-sort="reasoning">${h[2]}</th>
              <th class="c-cat" scope="col" data-sort="math">${h[3]}</th>
              <th class="c-cat" scope="col" data-sort="code">${h[4]}</th>
              <th class="c-cat" scope="col" data-sort="agents">${h[5]}</th>
              <th class="c-num" scope="col" data-sort="wins" title="${h[6][1]}">${h[6][0]}</th>
              <th class="c-num" scope="col" data-sort="coverage" title="${h[7][1]}">${h[7][0]}</th>
              <th class="c-num hide-sm" scope="col" data-sort="aaii" title="${h[8][1]}">${h[8][0]}</th>
              <th class="c-num hide-sm" scope="col" data-sort="priceIn" title="${h[9][1]}">${h[9][0]}</th>
              <th class="c-num hide-sm" scope="col" data-sort="priceOut" title="${h[10][1]}">${h[10][0]}</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>`;
}

const ANALYSES = {
  fr: { h1: "Analyses", lede: "Ce que disent les chiffres : performance, prix, laboratoires et état des benchmarks. Survolez un point ou une barre pour le détail.",
    evo: ["Évolution des points", "Points ERAZ des cinq premiers actuels, jour après jour, recalculés avec la même formule."],
    sc: ["Intelligence et prix", "Points ERAZ selon le prix d'un million de tokens générés. La ligne relie les modèles qu'aucun autre ne bat à prix égal ou inférieur."],
    scLeg: ["Propriétaire", "Open weights", "Licence non précisée", "Frontière qualité-prix"],
    labs: ["Meilleur modèle par laboratoire", "Points ERAZ du modèle le mieux classé de chaque éditeur."],
    pod: ["Le podium, catégorie par catégorie", "Score sur 100 des trois premiers dans chaque domaine."],
    sat: ["Saturation des benchmarks", "Plage des scores, médiane et meilleur résultat. Un test dont le meilleur score frôle 100 % départage mal les modèles de pointe."],
    satLeg: ["Meilleur", "Médiane", "Plage des scores"],
    hist: ["Répartition des points", "Nombre de modèles par tranche de 50 points ERAZ."] },
  en: { h1: "Analysis", lede: "What the numbers say: performance, price, labs and the state of the benchmarks. Hover a point or a bar for details.",
    evo: ["Points over time", "ERAZ points of the current top five, day by day, recalculated with the same formula."],
    sc: ["Intelligence and price", "ERAZ points by the price of one million generated tokens. The line connects the models no other beats at an equal or lower price."],
    scLeg: ["Proprietary", "Open weights", "License not specified", "Price-performance frontier"],
    labs: ["Best model per lab", "ERAZ points of each lab's highest-ranked model."],
    pod: ["The podium, category by category", "Score out of 100 of the top three in each area."],
    sat: ["Benchmark saturation", "Range of scores, median and best result. A test whose best score is close to 100% no longer separates frontier models."],
    satLeg: ["Best", "Median", "Score range"],
    hist: ["Distribution of points", "Number of models per 50-point band of ERAZ points."] },
};
function analysesBody(lang) {
  const a = ANALYSES[lang];
  return `${pageHead(lang, a.h1, a.lede)}
    <section id="analyses" class="wrap section">
      <div class="kpis" id="kpis"></div>
      <div class="charts">
        <article class="chart-card wide">
          <h3>${a.evo[0]}</h3>
          <p class="chart-sub">${a.evo[1]}</p>
          <div class="legend" id="evo-legend"></div>
          <div class="chart" id="chart-evo"></div>
          <p class="chart-note" id="evo-note"></p>
        </article>
        <article class="chart-card wide">
          <h3>${a.sc[0]}</h3>
          <p class="chart-sub">${a.sc[1]}</p>
          <div class="legend"><span><i class="sw s1"></i>${a.scLeg[0]}</span><span><i class="sw s2"></i>${a.scLeg[1]}</span><span><i class="sw s3"></i>${a.scLeg[2]}</span><span><i class="line-key"></i>${a.scLeg[3]}</span></div>
          <div class="chart" id="chart-scatter"></div>
          <p class="chart-note" id="scatter-note"></p>
        </article>
        <article class="chart-card">
          <h3>${a.labs[0]}</h3>
          <p class="chart-sub">${a.labs[1]}</p>
          <div class="chart" id="chart-labs"></div>
        </article>
        <article class="chart-card">
          <h3>${a.pod[0]}</h3>
          <p class="chart-sub">${a.pod[1]}</p>
          <div class="legend" id="podium-legend"></div>
          <div class="chart" id="chart-podium"></div>
        </article>
        <article class="chart-card">
          <h3>${a.sat[0]}</h3>
          <p class="chart-sub">${a.sat[1]}</p>
          <div class="legend"><span><i class="sw s1"></i>${a.satLeg[0]}</span><span><i class="sw muted"></i>${a.satLeg[1]}</span><span><i class="range-key"></i>${a.satLeg[2]}</span></div>
          <div class="chart" id="chart-sat"></div>
        </article>
        <article class="chart-card">
          <h3>${a.hist[0]}</h3>
          <p class="chart-sub">${a.hist[1]}</p>
          <div class="chart" id="chart-hist"></div>
        </article>
      </div>
    </section>`;
}

const matrixBody = (lang) => `${pageHead(lang, lang === "en" ? "Results matrix" : "Matrice des résultats",
  lang === "en" ? "Every model's raw score on every benchmark. The darker the cell, the closer the model is to the best result." : "Le score brut de chaque modèle sur chaque benchmark. Plus la case est intense, plus le modèle est proche du meilleur résultat.")}
    <section id="matrice" class="wrap section">
      <div class="section-head">
        <div class="legend-ramp" aria-hidden="true"><span>0</span><i></i><span>${lang === "en" ? "best" : "meilleur"}</span></div>
      </div>
      <div class="matrix-wrap"><table class="matrix" id="matrix"></table></div>
    </section>`;

const benchmarksBody = (lang) => `${pageHead(lang, lang === "en" ? "The benchmarks" : "Les benchmarks",
  lang === "en" ? "14 tests chosen for their difficulty, independence and resistance to contamination." : "14 épreuves choisies pour leur difficulté, leur indépendance et leur résistance à la contamination.")}
    <section id="benchmarks" class="wrap section">
      <div class="bench-grid" id="benchGrid"></div>
    </section>`;

const ABOUT = {
  fr: { h1: "À propos du classement", lede: "Comment les points ERAZ sont calculés à partir des résultats publiés, et d'où viennent les données.",
    calc: "Le calcul des points",
    steps: [["Normalisation", "Pour chaque benchmark, le score est ramené sur 100 : <code>(score − plancher) / (meilleur − plancher)</code>. Le plancher est le niveau du hasard (25 % pour GPQA, 10 % pour MMMU-Pro, 1000 Elo pour GDPval, 0 sinon). Le meilleur modèle suivi obtient 100."],
      ["Catégories", "Les 14 benchmarks sont regroupés en 7 catégories. Dans chacune, la moyenne est pondérée : les épreuves les plus discriminantes (HLE, FrontierMath Tier 4, FrontierSWE, GDPval) pèsent 1,5×, ARC-AGI-3 1,25×, les tests saturés (GPQA) 0,5×, les autres 1×."],
      ["Score global", "Moyenne pondérée des catégories pour lesquelles le modèle a des résultats. Profil par défaut : Raisonnement, Maths, Code, Agents ×1 ; Connaissances ×0,75 ; Contexte long et Multimodal ×0,5."],
      ["Couverture", "Un modèle qui ne publie que ses meilleurs résultats ne doit pas gagner. Les points finaux valent <code>score × (0,75 + 0,25 × couverture) × 10</code>, soit 1000 points au maximum."]],
    whyT: "Pourquoi pas SWE-bench Verified, MMLU ou AIME ?",
    why: "Ces tests sont saturés (plus de 95 % pour les meilleurs modèles) ou contaminés : ils ne distinguent plus les modèles de pointe. L'indice Artificial Analysis est affiché à titre de référence mais exclu du calcul, puisqu'il agrège déjà plusieurs des benchmarks utilisés ici.",
    catT: "Les catégories en détail", cat: "Chaque score de catégorie (Raisonnement, Mathématiques, Code…) est une moyenne pondérée des benchmarks qui la composent, ramenés sur 100. Voici, pour chacune, les benchmarks, leur poids, leur plancher et le meilleur résultat actuel.",
    exT: "Exemple complet, chiffre par chiffre", ex: "Le calcul réel des points d'un modèle, avec les données du jour. Choisissez un modèle :", exAria: "Modèle de l'exemple",
    srcT: "Sources", src: "Chaque score de la fiche d'un modèle renvoie aussi vers sa source d'origine (lien « src »).", back: "← Retour au classement" },
  en: { h1: "About the ranking", lede: "How ERAZ points are calculated from published results, and where the data comes from.",
    calc: "How points are calculated",
    steps: [["Normalization", "For each benchmark, the score is scaled to 100: <code>(score − floor) / (best − floor)</code>. The floor is the random-guess level (25% for GPQA, 10% for MMMU-Pro, 1000 Elo for GDPval, 0 otherwise). The best tracked model gets 100."],
      ["Categories", "The 14 benchmarks are grouped into 7 categories. Within each, the average is weighted: the most discriminating tests (HLE, FrontierMath Tier 4, FrontierSWE, GDPval) weigh 1.5×, ARC-AGI-3 1.25×, saturated tests (GPQA) 0.5×, the others 1×."],
      ["Overall score", "Weighted average of the categories where the model has results. Default profile: Reasoning, Math, Code, Agents ×1; Knowledge ×0.75; Long context and Multimodal ×0.5."],
      ["Coverage", "A model that only publishes its best results should not win. Final points equal <code>score × (0.75 + 0.25 × coverage) × 10</code>, i.e. 1000 points at most."]],
    whyT: "Why not SWE-bench Verified, MMLU or AIME?",
    why: "These tests are saturated (over 95% for the best models) or contaminated: they no longer separate frontier models. The Artificial Analysis index is shown for reference but excluded from the calculation, since it already aggregates several of the benchmarks used here.",
    catT: "Categories in detail", cat: "Each category score (Reasoning, Mathematics, Code…) is a weighted average of its benchmarks, scaled to 100. Here are, for each one, its benchmarks, their weight, their floor and the current best result.",
    exT: "A complete worked example", ex: "The actual calculation of a model's points, with today's data. Pick a model:", exAria: "Model for the example",
    srcT: "Sources", src: "Every score on a model page also links to its original source (\"src\" link).", back: "← Back to the ranking" },
};
function aboutBody(lang) {
  const a = ABOUT[lang];
  return `${pageHead(lang, a.h1, a.lede)}
    <section class="wrap section method">
      <h2>${a.calc}</h2>
      <div class="method-grid">
${a.steps.map(([h, p], i) => `        <article>
          <span class="step">${i + 1}</span>
          <h3>${h}</h3>
          <p>${p}</p>
        </article>`).join("\n")}
      </div>
      <div class="callout">
        <strong>${a.whyT}</strong>
        ${a.why}
      </div>
    </section>
    <section class="wrap section">
      <h2>${a.catT}</h2>
      <p class="muted">${a.cat}</p>
      <div class="cat-detail" id="catDetail"></div>
    </section>
    <section class="wrap section">
      <h2>${a.exT}</h2>
      <p class="muted">${a.ex}</p>
      <select id="exampleModel" aria-label="${a.exAria}"></select>
      <div class="example" id="example"></div>
    </section>
    <section class="wrap section" id="sources-section">
      <h2>${a.srcT}</h2>
      <p class="muted">${a.src}</p>
      <ul class="sources" id="sources"></ul>
      <p class="back"><a href="${PAGES.home[lang]}">${a.back}</a></p>
    </section>`;
}

const adminBody = () => `    <section class="page-head wrap">
      ${editionLine("fr", "Administration")}
      <h1>Audience du site</h1>
      <p class="lede">Visites de chaque page, mesurées sans cookie ni donnée personnelle.</p>
    </section>
    <section class="wrap section">
      <div id="admin"></div>
    </section>`;

// ---------- Fiches modèles ----------
const MT = {
  fr: {
    title: (m) => `${m.name} : score, benchmarks et classement — ERAZ Index`,
    desc: (r, k) => `${r.m.name} (${r.m.org}) est classé n° ${r.rank} sur ${N} dans l'ERAZ Index, avec ${r.points} points sur 1000. Ses résultats sur ${k} benchmarks, son prix et son évolution.`,
    crumb: "Classement",
    lede: (r) => `Classé <b>n° ${r.rank}</b> sur ${N} avec <b>${r.points} points ERAZ</b> sur 1000.`,
    k: ["Rang ERAZ", "Points", "Couverture", "Benchmarks gagnés", "Prix entrée / M", "Prix sortie / M"],
    ctx: "contexte", ctxUnknown: "contexte non communiqué",
    cats: "Scores par catégorie", catsSub: "Sur 100 : 100 = le meilleur modèle suivi dans la catégorie.",
    benches: "Résultats sur chaque benchmark",
    th: ["Benchmark", "Score", "Rang", "Sur 100", "Source"], notPub: "non publié",
    hist: "Évolution des points", histTh: ["Jour", "Points", "Variation"],
    cmp: "Modèles voisins au classement",
    badge: "Badge à intégrer", badgeSub: (m) => `Affichez le classement de ${m.name} sur votre site ou dans un README. Le badge se met à jour chaque jour.`,
    copy: "Copier", copied: "Copié ✓", html: "HTML", md: "Markdown",
    aa: "Artificial Analysis Intelligence Index", src: "Fiche source", back: "← Retour au classement",
    badgeAlt: (r) => `ERAZ Index : n° ${r.rank}, ${r.points} points`,
  },
  en: {
    title: (m) => `${m.name}: benchmarks, score and ranking — ERAZ Index`,
    desc: (r, k) => `${r.m.name} (${r.m.org}) ranks #${r.rank} of ${N} in the ERAZ Index, with ${r.points} points out of 1000. Its results on ${k} benchmarks, price and history.`,
    crumb: "Ranking",
    lede: (r) => `Ranked <b>#${r.rank}</b> of ${N} with <b>${r.points} ERAZ points</b> out of 1000.`,
    k: ["ERAZ rank", "Points", "Coverage", "Benchmarks won", "Input price / M", "Output price / M"],
    ctx: "context", ctxUnknown: "context not disclosed",
    cats: "Category scores", catsSub: "Out of 100: 100 = the best tracked model in the category.",
    benches: "Results on each benchmark",
    th: ["Benchmark", "Score", "Rank", "Out of 100", "Source"], notPub: "not published",
    hist: "Points over time", histTh: ["Day", "Points", "Change"],
    cmp: "Nearby models in the ranking",
    badge: "Embeddable badge", badgeSub: (m) => `Show ${m.name}'s ranking on your site or in a README. The badge updates every day.`,
    copy: "Copy", copied: "Copied ✓", html: "HTML", md: "Markdown",
    aa: "Artificial Analysis Intelligence Index", src: "Source page", back: "← Back to the ranking",
    badgeAlt: (r) => `ERAZ Index: #${r.rank}, ${r.points} points`,
  },
};

function modelBody(lang, r) {
  const t = MT[lang];
  const I = W.ERAZI18n.make(lang);
  const m = r.m;
  const own = I.T;
  const k = Object.keys(m.s).length;
  const lic = m.open ? own.open : m.open === false ? own.proprietary : "";
  const sub = [m.org, lic, m.ctx && m.ctx !== "—" ? `${t.ctx} ${m.ctx}` : t.ctxUnknown].filter(Boolean).map(esc).join(" · ");
  const kpis = [
    [t.k[0], `#${r.rank}`, `/ ${N}`], [t.k[1], r.points, "/ 1000"], [t.k[2], I.pct(r.coverage * 100, 0), ""],
    [t.k[3], r.wins, `/ ${D.benchmarks.length}`], [t.k[4], I.price(m.priceIn), ""], [t.k[5], I.price(m.priceOut), ""],
  ];
  const fmtScore = (b, v) => (b.unit === "Elo" ? Math.round(v) : b.unit === "%" ? I.pct(v) : I.num(v, 1));
  const cats = Object.keys(D.categories).map((c) => `<tr><td>${esc(I.cat(D, c))}</td><td class="bar-cell"><div class="bar"><i style="width:${r.cats[c] ?? 0}%"></i></div></td><td class="r">${r.cats[c] == null ? "—" : Math.round(r.cats[c])}</td></tr>`).join("\n");
  const benches = D.benchmarks.map((b) => {
    const v = m.s[b.id];
    if (v == null) return `<tr class="muted-row"><td><a href="${b.url}" target="_blank" rel="noopener">${esc(b.name)}</a></td><td class="r">${t.notPub}</td><td class="r">—</td><td class="r">—</td><td></td></tr>`;
    const ref = m.refs?.[b.id];
    return `<tr><td><a href="${b.url}" target="_blank" rel="noopener">${esc(b.name)}</a></td><td class="r">${fmtScore(b, v)}</td><td class="r">#${Z.rankOf(b, m)} / ${b.ranking.length}</td><td class="r">${Math.round(Z.norm(b, v))}</td><td>${ref ? `<a href="${esc(ref)}" target="_blank" rel="noopener">src ↗</a>` : ""}</td></tr>`;
  }).join("\n");
  const near = ROWS.filter((x) => x.m.id !== m.id && Math.abs(x.rank - r.rank) <= 3);
  const badgeUrl = `${SITE}/badge/${m.id}.svg`;
  const pageUrl = `${SITE}${modelUrl(lang, m.id)}`;
  const codeHtml = `<a href="${pageUrl}"><img src="${badgeUrl}" alt="${t.badgeAlt(r)}"></a>`;
  const codeMd = `[![${t.badgeAlt(r)}](${badgeUrl})](${pageUrl})`;
  return `${pageHead(lang, esc(m.name), `${sub}. ${t.lede(r)}`, `      <p class="crumb"><a href="${PAGES.home[lang]}">${t.crumb}</a> / ${esc(m.name)}</p>\n`)}
    <section class="wrap section model-page">
      <div class="kpis">
${kpis.map(([l, v, s]) => `        <div class="kpi"><span>${l}</span><b>${v}</b><small>${s}</small></div>`).join("\n")}
      </div>
      <div class="model-grid">
        <article class="cd-card">
          <h2>${t.cats}</h2>
          <p class="cd-note">${t.catsSub}</p>
          <div class="table-scroll"><table class="cd-table model-cats"><tbody>
${cats}
          </tbody></table></div>
        </article>
        <article class="cd-card">
          <h2>${t.hist}</h2>
          <div class="table-scroll"><table class="cd-table"><thead><tr><th>${t.histTh[0]}</th><th class="r">${t.histTh[1]}</th><th class="r">${t.histTh[2]}</th></tr></thead>
          <tbody id="modelHistory" data-model="${m.id}"></tbody></table></div>
        </article>
      </div>
      <article class="cd-card">
        <h2>${t.benches}</h2>
        <div class="table-scroll"><table class="cd-table"><thead><tr>${t.th.map((h, i) => `<th${i > 0 && i < 4 ? ' class="r"' : ""}>${h}</th>`).join("")}</tr></thead>
        <tbody>
${benches}
        </tbody></table></div>
        <p class="cd-note">${t.aa} : ${m.aaii ?? "—"} · <a href="${esc(m.src)}" target="_blank" rel="noopener">${t.src} ↗</a></p>
      </article>
      <article class="cd-card">
        <h2>${t.cmp}</h2>
        <ul class="near">
${near.map((x) => `          <li><a href="${modelUrl(lang, x.m.id)}"><span class="near-rank">#${x.rank}</span>${esc(x.m.name)}<span class="near-pts">${x.points}</span></a></li>`).join("\n")}
        </ul>
      </article>
      <article class="cd-card badge-card">
        <h2>${t.badge}</h2>
        <p class="cd-note">${t.badgeSub(m)}</p>
        <p><img src="/badge/${m.id}.svg" alt="${t.badgeAlt(r)}" width="${badgeWidth(r)}" height="28"></p>
        <label class="code-label">${t.html}<textarea id="badge-html" readonly rows="2">${esc(codeHtml)}</textarea></label>
        <button class="chip" type="button" data-copy="badge-html" data-done="${t.copied}">${t.copy}</button>
        <label class="code-label">${t.md}<textarea id="badge-md" readonly rows="2">${esc(codeMd)}</textarea></label>
        <button class="chip" type="button" data-copy="badge-md" data-done="${t.copied}">${t.copy}</button>
      </article>
      <p class="back"><a href="${PAGES.home[lang]}">${t.back}</a></p>
    </section>`;
}

// ---------- Badges SVG ----------
// Largeur estimée du texte en Verdana gras 11 px (pas de moteur de rendu ici) :
// ~8,2 px par capitale (avec l'espacement des lettres), ~7,2 px pour un texte mixte.
const textW = (s) => Math.round([...s].reduce((w, c) => w + (/[A-Z]/.test(c) ? 8.2 : c === " " ? 4 : 7.2), 0));
const badgeRight = (r) => `#${r.rank} · ${r.points} pts`;
function badgeWidth(r) { return 22 + textW("ERAZ INDEX") + 10 + 10 + textW(badgeRight(r)) + 10; }
function badgeSvg(r) {
  const left = 22 + textW("ERAZ INDEX") + 10;
  const right = 10 + textW(badgeRight(r)) + 10;
  const w = left + right;
  const color = r.rank === 1 ? "#b8860b" : r.rank === 2 ? "#6b6b68" : r.rank === 3 ? "#a0623a" : "#2a78d6";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="28" viewBox="0 0 ${w} 28" role="img" aria-label="ERAZ Index: ${esc(r.m.name)} ${badgeRight(r)}">
  <title>ERAZ Index — ${esc(r.m.name)} : ${badgeRight(r)}</title>
  <clipPath id="c"><rect width="${w}" height="28" rx="4"/></clipPath>
  <g clip-path="url(#c)">
    <rect width="${left}" height="28" fill="#14130f"/>
    <rect x="${left}" width="${right}" height="28" fill="${color}"/>
  </g>
  <path d="M14 6 21.5 21H6.5Z" fill="none" stroke="#f1eee6" stroke-width="1.6" stroke-linejoin="round"/>
  <path d="M14 12.5 17.4 19H10.6Z" fill="#3987e5"/>
  <g font-family="Verdana,DejaVu Sans,Geneva,sans-serif" font-size="11" font-weight="bold" fill="#fff">
    <text x="${22 + 2}" y="18" letter-spacing=".6">ERAZ INDEX</text>
    <text x="${left + 10}" y="18">${badgeRight(r)}</text>
  </g>
</svg>
`;
}

// ---------- Écriture ----------
const written = [];
async function out(url, html) {
  const f = fileOf(url);
  await mkdir(path.dirname(f), { recursive: true });
  await writeFile(f, html);
  written.push(url);
}

const homeLd = (lang) => ({
  "@context": "https://schema.org",
  "@type": "Dataset",
  name: lang === "en" ? "ERAZ Index — AI model ranking" : "ERAZ Index — Classement des intelligences artificielles",
  description: lang === "en"
    ? "Ranking of AI models (GPT, Claude, Gemini, Grok, DeepSeek…) computed from 14 benchmarks: Humanity's Last Exam, ARC-AGI-2, ARC-AGI-3, FrontierMath, SWE-bench Pro, FrontierSWE, Terminal-Bench, OSWorld, GDPval, GPQA Diamond, AA-Omniscience, AA-LCR, MMMU-Pro."
    : "Classement des modèles d'IA (GPT, Claude, Gemini, Grok, DeepSeek…) calculé à partir de 14 benchmarks : Humanity's Last Exam, ARC-AGI-2, ARC-AGI-3, FrontierMath, SWE-bench Pro, FrontierSWE, Terminal-Bench, OSWorld, GDPval, GPQA Diamond, AA-Omniscience, AA-LCR, MMMU-Pro.",
  url: `${SITE}${PAGES.home[lang]}`,
  inLanguage: lang,
  isAccessibleForFree: true,
  license: TX[lang].licenseUrl,
  creditText: "ERAZ Index (eraz.ovh)",
  dateModified: D.updated,
  keywords: lang === "en" ? ["AI leaderboard", "AI benchmarks", "LLM leaderboard", "AI ranking"] : ["classement IA", "benchmark IA", "LLM leaderboard", "comparatif IA"],
  creator: { "@type": "Organization", name: "ERAZ Index", url: SITE, sameAs: [X_URL] },
});

const META = {
  home: { fr: ["ERAZ Index — Le classement de référence des IA", "Le classement de référence des IA : GPT, Claude, Gemini, Grok, DeepSeek… notés sur 14 benchmarks exigeants, avec un système de points transparent et sourcé."],
          en: ["ERAZ Index — The reference AI leaderboard", "The reference AI leaderboard: GPT, Claude, Gemini, Grok, DeepSeek… scored on 14 demanding benchmarks with a transparent, sourced points system."] },
  analyses: { fr: ["Analyses — ERAZ Index", "Intelligence et prix des IA, évolution des scores, meilleur modèle par laboratoire, saturation des benchmarks : les chiffres clés de l'IA, mis à jour chaque jour."],
              en: ["Analysis — ERAZ Index", "AI intelligence vs price, score history, best model per lab, benchmark saturation: the key numbers of AI, updated daily."] },
  matrix: { fr: ["Matrice des résultats — ERAZ Index", "Tous les scores bruts des IA sur 14 benchmarks dans une seule matrice : GPT, Claude, Gemini, Grok, DeepSeek, Qwen, Kimi…"],
            en: ["Results matrix — ERAZ Index", "Every raw AI score on 14 benchmarks in a single matrix: GPT, Claude, Gemini, Grok, DeepSeek, Qwen, Kimi…"] },
  benchmarks: { fr: ["Les benchmarks d'IA — ERAZ Index", "Les 14 benchmarks utilisés pour classer les IA : Humanity's Last Exam, ARC-AGI, FrontierMath, SWE-bench Pro, OSWorld, GDPval… avec le top 5 de chacun."],
                en: ["AI benchmarks — ERAZ Index", "The 14 benchmarks used to rank AI models: Humanity's Last Exam, ARC-AGI, FrontierMath, SWE-bench Pro, OSWorld, GDPval… with the top 5 of each."] },
  about: { fr: ["À propos du classement — ERAZ Index", "Comment sont calculés les points ERAZ : normalisation des scores, pondération des benchmarks et des catégories, couverture, et sources des données."],
           en: ["About the ranking — ERAZ Index", "How ERAZ points are calculated: score normalization, benchmark and category weights, coverage, and data sources."] },
};
const BODIES = { home: (l) => HOME[l](), analyses: analysesBody, matrix: matrixBody, benchmarks: benchmarksBody, about: aboutBody };

// Les dossiers générés sont recréés à chaque fois (un modèle retiré ne laisse pas de page orpheline).
for (const dir of ["modele", "en", "badge"]) await rm(path.join(ROOT, dir), { recursive: true, force: true });

for (const key of Object.keys(BODIES)) {
  for (const lang of ["fr", "en"]) {
    const [title, desc] = META[key][lang];
    await out(PAGES[key][lang], layout({ lang, key, title, desc, url: PAGES[key][lang], alt: PAGES[key], body: BODIES[key](lang),
      ld: key === "home" ? homeLd(lang) : null, charts: key === "analyses" }));
  }
}
await out(PAGES.admin.fr, layout({ lang: "fr", key: null, title: "Administration — ERAZ Index", url: PAGES.admin.fr, body: adminBody(), noindex: true, noCount: true, admin: true }));

for (const r of ROWS) {
  const alt = { fr: modelUrl("fr", r.m.id), en: modelUrl("en", r.m.id) };
  for (const lang of ["fr", "en"]) {
    const t = MT[lang];
    const ld = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: t.crumb, item: `${SITE}${PAGES.home[lang]}` },
      { "@type": "ListItem", position: 2, name: r.m.name, item: `${SITE}${alt[lang]}` },
    ] };
    await out(alt[lang], layout({ lang, key: null, title: t.title(r.m), desc: t.desc(r, Object.keys(r.m.s).length), url: alt[lang], alt, body: modelBody(lang, r), ld }));
  }
  const f = path.join(ROOT, "badge", `${r.m.id}.svg`);
  await mkdir(path.dirname(f), { recursive: true });
  await writeFile(f, badgeSvg(r));
}

// ---------- Plan du site (avec versions linguistiques) et liste pour IndexNow ----------
const pairs = [...Object.keys(BODIES).map((k) => PAGES[k]), ...ROWS.map((r) => ({ fr: modelUrl("fr", r.m.id), en: modelUrl("en", r.m.id) }))];
const entries = pairs.flatMap((p) => ["fr", "en"].map((lang) => `  <url>
    <loc>${SITE}${p[lang]}</loc>
    <lastmod>${D.updated}</lastmod>
    <changefreq>daily</changefreq>
    <xhtml:link rel="alternate" hreflang="fr" href="${SITE}${p.fr}"/>
    <xhtml:link rel="alternate" hreflang="en" href="${SITE}${p.en}"/>
  </url>`));
await writeFile(path.join(ROOT, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries.join("\n")}
</urlset>
`);
await writeFile(path.join(ROOT, "urls.txt"), pairs.flatMap((p) => [SITE + p.fr, SITE + p.en]).join("\n") + "\n");

console.log(`${written.length} pages, ${ROWS.length} badges, ${pairs.length * 2} URL dans le sitemap.`);
