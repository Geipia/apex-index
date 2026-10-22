// Page admin : visites par page, lues sur les compteurs publics de GoatCounter.
(() => {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const code = (window.ERAZ_ANALYTICS || {}).goatcounter;
  const PAGES = [
    ["/", "Classement"],
    ["/analyses.html", "Analyses"],
    ["/matrice.html", "Matrice"],
    ["/benchmarks.html", "Benchmarks"],
    ["/a-propos.html", "À propos du classement"],
  ];

  if (!code) {
    $("#admin").innerHTML = `
      <article class="cd-card">
        <h3>La mesure d'audience n'est pas encore branchée</h3>
        <ol class="setup">
          <li>Créez un compte gratuit sur <a href="https://www.goatcounter.com/signup" target="_blank" rel="noopener">goatcounter.com</a> et choisissez un code (par exemple <code>eraz</code>).</li>
          <li>Dans <b>Settings</b>, cochez <b>« Allow adding visitor counts on your website »</b> : c'est ce qui permet à cette page de lire les chiffres.</li>
          <li>Indiquez ce code dans <code>analytics.js</code> (<code>goatcounter: "eraz"</code>) et publiez.</li>
        </ol>
      </article>`;
    return;
  }

  const base = `https://${code}.goatcounter.com`;
  const num = (v) => Number(String(v ?? "0").replace(/[^\d]/g, "")) || 0;
  const fmt = (v) => v.toLocaleString("fr-FR");
  const get = (path) => fetch(`${base}/counter/${encodeURIComponent(path)}.json`)
    .then((r) => (r.ok ? r.json() : r.status === 404 ? { count: "0", count_unique: "0" } : Promise.reject(r.status)));

  $("#admin").innerHTML = `<p class="muted">Chargement des compteurs…</p>`;
  Promise.all([get("TOTAL"), ...PAGES.map(([p]) => get(p))])
    .then(([total, ...pages]) => {
      const rows = PAGES.map(([path, label], i) => ({ path, label, views: num(pages[i].count), unique: num(pages[i].count_unique) }))
        .sort((a, b) => b.views - a.views);
      const max = Math.max(1, ...rows.map((r) => r.views));
      $("#admin").innerHTML = `
        <div class="kpis">
          <div class="kpi"><span>Pages vues, au total</span><b>${fmt(num(total.count))}</b><small>depuis l'activation du compteur</small></div>
          <div class="kpi"><span>Visites uniques, au total</span><b>${fmt(num(total.count_unique))}</b><small>une par visiteur et par jour</small></div>
          <div class="kpi"><span>Page la plus vue</span><b>${esc(rows[0].label)}</b><small>${fmt(rows[0].views)} pages vues</small></div>
        </div>
        <article class="cd-card">
          <h3>Pages vues par page</h3>
          <div class="table-scroll"><table class="cd-table admin-table">
            <thead><tr><th>Page</th><th></th><th class="r">Pages vues</th><th class="r">Visites uniques</th></tr></thead>
            <tbody>${rows.map((r) => `<tr><td>${esc(r.label)}<small>${esc(r.path)}</small></td>
              <td class="bar-cell"><div class="bar"><i style="width:${(r.views / max) * 100}%"></i></div></td>
              <td class="r">${fmt(r.views)}</td><td class="r">${fmt(r.unique)}</td></tr>`).join("")}</tbody>
          </table></div>
          <p class="cd-note">Courbes jour par jour, pays, appareils et sites d'où viennent les visiteurs : <a href="${base}" target="_blank" rel="noopener">tableau de bord GoatCounter complet ↗</a></p>
        </article>`;
    })
    .catch(() => {
      $("#admin").innerHTML = `<article class="cd-card"><h3>Impossible de lire les compteurs</h3>
        <p class="muted">Vérifiez que le code <code>${esc(code)}</code> est le bon, et que l'option <b>« Allow adding visitor counts on your website »</b> est cochée dans les Settings de GoatCounter.</p>
        <p class="cd-note"><a href="${base}" target="_blank" rel="noopener">Ouvrir le tableau de bord GoatCounter ↗</a></p></article>`;
    });
})();
