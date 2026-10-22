// Section « Analyses » : graphiques SVG dessinés à la largeur réelle de leur conteneur.
// Appelé par app.js à chaque rendu (les graphiques suivent donc le profil de pondération).
(() => {
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const $ = (s) => document.querySelector(s);
  const fmt = (v, d = 0) => v.toLocaleString("fr-FR", { maximumFractionDigits: d });
  const price = (v) => "$" + (v < 1 ? v.toFixed(2).replace(/0$/, "") : fmt(v, 2));
  const svg = (w, h, body, label) => `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}">${body}</svg>`;
  // Une info-bulle = un attribut data-tip (HTML déjà échappé), lu par le gestionnaire commun plus bas.
  const tip = (html) => `data-tip="${esc(html)}"`;

  function kpis(rows) {
    const best = rows[0];
    const open = rows.filter((r) => r.m.open);
    const bestOpen = open[0];
    const budget = rows.filter((r) => r.m.priceOut != null && r.m.priceOut <= 5).sort((a, b) => b.points - a.points)[0];
    const tiles = [
      ["N°1 du classement", best.points, `${best.m.name} · ${best.m.org}`],
      ["Meilleur modèle open weights", bestOpen ? bestOpen.points : "—", bestOpen ? `${bestOpen.m.name} · ${bestOpen.m.org} · #${bestOpen.rank}` : ""],
      ["Écart ouvert / propriétaire", bestOpen ? `−${best.points - bestOpen.points}` : "—", "points entre les deux meilleurs"],
      ["Meilleur à moins de 5 $ / M (sortie)", budget ? budget.points : "—", budget ? `${budget.m.name} · ${price(budget.m.priceOut)} / M` : ""],
    ];
    $("#kpis").innerHTML = tiles.map(([l, v, s]) => `<div class="kpi"><span>${esc(l)}</span><b>${esc(v)}</b><small>${esc(s)}</small></div>`).join("");
  }

  // ---------- 1. Intelligence vs prix (nuage, échelle log en x) ----------
  function scatter(rows) {
    const el = $("#chart-scatter");
    const W = el.clientWidth, H = W < 560 ? 320 : 420;
    const m = { l: 44, r: 16, t: 16, b: 44 };
    const pts = rows.filter((r) => r.m.priceOut != null);
    const missing = rows.length - pts.length;
    const xs = pts.map((r) => r.m.priceOut), ys = pts.map((r) => r.points);
    const x0 = Math.log10(Math.min(...xs) * 0.8), x1 = Math.log10(Math.max(...xs) * 1.25);
    const y0 = Math.floor(Math.min(...ys) / 100) * 100, y1 = 1000;
    const X = (v) => m.l + ((Math.log10(v) - x0) / (x1 - x0)) * (W - m.l - m.r);
    const Y = (v) => H - m.b - ((v - y0) / (y1 - y0)) * (H - m.t - m.b);

    let g = "";
    for (let v = y0; v <= y1; v += 100) {
      g += `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${Y(v)}" y2="${Y(v)}"/><text class="tick" x="${m.l - 8}" y="${Y(v)}" text-anchor="end" dominant-baseline="middle">${v}</text>`;
    }
    for (const v of [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100]) {
      if (Math.log10(v) < x0 || Math.log10(v) > x1) continue;
      g += `<text class="tick" x="${X(v)}" y="${H - m.b + 18}" text-anchor="middle">${price(v)}</text>`;
    }
    g += `<text class="axis-title" x="${(m.l + W - m.r) / 2}" y="${H - 6}" text-anchor="middle">Prix par million de tokens en sortie (échelle logarithmique)</text>`;

    // Frontière qualité-prix : chaque modèle qu'aucun autre ne bat à prix égal ou inférieur.
    const byPrice = pts.slice().sort((a, b) => a.m.priceOut - b.m.priceOut || b.points - a.points);
    const frontier = [];
    let bestSoFar = -1;
    for (const r of byPrice) if (r.points > bestSoFar) { frontier.push(r); bestSoFar = r.points; }
    g += `<polyline class="frontier" points="${frontier.map((r) => `${X(r.m.priceOut)},${Y(r.points)}`).join(" ")}"/>`;

    const label = new Set([...frontier, ...rows.slice(0, 3)].map((r) => r.m.id));
    const cls = (r) => (r.m.open ? "s2" : r.m.open === false ? "s1" : "s3");
    let labels = "";
    for (const r of pts) {
      const cx = X(r.m.priceOut), cy = Y(r.points);
      const t = `<b>${esc(r.m.name)}</b> · ${esc(r.m.org)}<br>${r.points} points · #${r.rank}<br>${price(r.m.priceIn)} entrée · ${price(r.m.priceOut)} sortie / M`;
      g += `<g class="hit" ${tip(t)}><circle class="dot ${cls(r)}" cx="${cx}" cy="${cy}" r="6"/><circle cx="${cx}" cy="${cy}" r="14" fill="transparent"/></g>`;
      if (label.has(r.m.id) && (W >= 560 || r.rank <= 3)) {
        // Sous le point (la frontière part vers le haut à droite) ; au-dessus pour le n°1, déjà en haut du nuage.
        const right = cx < W - 150, above = r.rank === 1;
        labels += `<text class="dlabel" x="${cx + (right ? 6 : -6)}" y="${cy + (above ? -16 : 18)}" text-anchor="${right ? "start" : "end"}" dominant-baseline="middle">${esc(r.m.name)}</text>`;
      }
    }
    g += labels; // après tous les points, pour qu'aucun point ne recouvre une étiquette
    el.innerHTML = svg(W, H, g, "Points ERAZ en fonction du prix en sortie");
    $("#scatter-note").textContent = missing ? `${missing} modèle${missing > 1 ? "s" : ""} sans prix publié ne figure${missing > 1 ? "nt" : ""} pas sur ce graphique.` : "";
  }

  // ---------- 2. Meilleur modèle par laboratoire (barres horizontales, une série) ----------
  function labs(rows) {
    const el = $("#chart-labs");
    const W = el.clientWidth;
    const best = [];
    const seen = new Set();
    for (const r of rows) if (!seen.has(r.m.org)) { seen.add(r.m.org); best.push(r); }
    const row = 38, lw = W < 420 ? 112 : 140, vw = 44, H = best.length * row;
    const bw = W - lw - vw - 8;
    let g = "";
    best.forEach((r, i) => {
      const y = i * row + row / 2, w = Math.max(4, (r.points / 1000) * bw);
      g += `<text class="rlabel" x="0" y="${y - 6}" dominant-baseline="middle">${esc(r.m.org)}</text>`;
      g += `<text class="rsub" x="0" y="${y + 9}" dominant-baseline="middle">${esc(r.m.name)}</text>`;
      g += `<g ${tip(`<b>${esc(r.m.org)}</b><br>${esc(r.m.name)} · ${r.points} points · #${r.rank}`)}>`;
      g += `<rect class="track" x="${lw}" y="${y - 8}" width="${bw}" height="16" rx="4"/>`;
      g += `<path class="s1" d="M${lw},${y - 8}h${w - 4}a4,4 0 0 1 4,4v8a4,4 0 0 1 -4,4h${-(w - 4)}z"/></g>`;
      g += `<text class="val" x="${lw + bw + 8}" y="${y}" dominant-baseline="middle">${r.points}</text>`;
    });
    el.innerHTML = svg(W, H, g, "Meilleur score ERAZ de chaque laboratoire");
  }

  // ---------- 3. Profil du podium par catégorie (dot plot, 3 séries) ----------
  function podium(rows, D) {
    const el = $("#chart-podium");
    const W = el.clientWidth;
    const top = rows.slice(0, 3);
    const cats = Object.keys(D.categories);
    const lw = W < 420 ? 100 : 130, row = 34, mt = 8, H = cats.length * row + mt + 26;
    // Échelle resserrée sur la zone utile (des points, pas des barres : pas besoin de partir de 0).
    const vals = top.flatMap((r) => cats.map((c) => r.cats[c])).filter((v) => v != null);
    const lo = Math.max(0, Math.floor((Math.min(...vals) - 2) / 10) * 10);
    const X = (v) => lw + ((v - lo) / (100 - lo)) * (W - lw - 12);
    let g = "";
    for (let v = lo; v <= 100; v += 10) {
      g += `<line class="grid" x1="${X(v)}" x2="${X(v)}" y1="${mt}" y2="${H - 26}"/><text class="tick" x="${X(v)}" y="${H - 8}" text-anchor="middle">${v}</text>`;
    }
    cats.forEach((c, i) => {
      const y = mt + i * row + row / 2;
      g += `<text class="rlabel" x="0" y="${y}" dominant-baseline="middle">${esc(D.categories[c].label)}</text>`;
      top.forEach((r, k) => {
        const v = r.cats[c];
        if (v == null) return;
        g += `<g class="hit" ${tip(`<b>${esc(r.m.name)}</b><br>${esc(D.categories[c].label)} : ${Math.round(v)} / 100`)}><circle class="dot s${k + 1}" cx="${X(v)}" cy="${y}" r="6"/><circle cx="${X(v)}" cy="${y}" r="13" fill="transparent"/></g>`;
      });
    });
    el.innerHTML = svg(W, H, g, "Scores par catégorie des trois premiers");
    $("#podium-legend").innerHTML = top.map((r, k) => `<span><i class="sw s${k + 1}"></i>${esc(r.m.name)}</span>`).join("");
  }

  // ---------- 4. Saturation des benchmarks (plage min-max, médiane, meilleur) ----------
  function saturation(rows, D) {
    const el = $("#chart-sat");
    const W = el.clientWidth;
    const benches = D.benchmarks.filter((b) => b.unit === "%").map((b) => {
      const v = rows.map((r) => r.m.s[b.id]).filter((x) => x != null).sort((a, c) => a - c);
      return { b, min: v[0], max: v[v.length - 1], med: v[Math.floor((v.length - 1) / 2)], n: v.length };
    }).sort((a, c) => c.max - a.max);
    const lw = W < 420 ? 92 : 120, vw = 46, row = 30, H = benches.length * row + 26;
    const X = (v) => lw + (v / 100) * (W - lw - vw - 6);
    let g = "";
    for (const v of [0, 50, 100]) {
      g += `<line class="grid" x1="${X(v)}" x2="${X(v)}" y1="0" y2="${H - 26}"/><text class="tick" x="${X(v)}" y="${H - 8}" text-anchor="middle">${v} %</text>`;
    }
    benches.forEach((s, i) => {
      const y = i * row + row / 2;
      const t = `<b>${esc(s.b.name)}</b><br>Meilleur : ${fmt(s.max, 1)} % · médiane : ${fmt(s.med, 1)} %<br>Plus faible : ${fmt(s.min, 1)} % · ${s.n} modèles`;
      g += `<text class="rlabel" x="0" y="${y}" dominant-baseline="middle">${esc(s.b.short)}</text>`;
      g += `<g class="hit" ${tip(t)}><rect class="track" x="${X(s.min)}" y="${y - 3}" width="${Math.max(2, X(s.max) - X(s.min))}" height="6" rx="3"/>`;
      g += `<circle class="dot muted" cx="${X(s.med)}" cy="${y}" r="5"/><circle class="dot s1" cx="${X(s.max)}" cy="${y}" r="6"/>`;
      g += `<rect x="${lw}" y="${y - row / 2}" width="${W - lw}" height="${row}" fill="transparent"/></g>`;
      g += `<text class="val" x="${W}" y="${y}" text-anchor="end" dominant-baseline="middle">${fmt(s.max, 0)} %</text>`;
    });
    el.innerHTML = svg(W, H, g, "Meilleur score, médiane et plage de chaque benchmark");
  }

  // ---------- 5. Répartition des points (histogramme, une série) ----------
  function histogram(rows) {
    const el = $("#chart-hist");
    const W = el.clientWidth, H = 240, m = { l: 8, r: 8, t: 22, b: 30 };
    const step = 50, lo = Math.floor(Math.min(...rows.map((r) => r.points)) / step) * step;
    const bins = [];
    for (let v = lo; v < 1000; v += step) bins.push({ v, list: rows.filter((r) => r.points >= v && r.points < v + step) });
    const max = Math.max(...bins.map((b) => b.list.length));
    const slot = (W - m.l - m.r) / bins.length, bw = Math.min(24, slot - 2);
    let g = `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${H - m.b}" y2="${H - m.b}"/>`;
    bins.forEach((b, i) => {
      const cx = m.l + slot * i + slot / 2;
      const h = (b.list.length / max) * (H - m.t - m.b);
      if (b.list.length) {
        const t = `<b>${b.v}–${b.v + step - 1} points</b><br>${b.list.map((r) => esc(r.m.name)).join("<br>")}`;
        g += `<g class="hit" ${tip(t)}><path class="s1" d="M${cx - bw / 2},${H - m.b}v${-(h - 4)}a4,4 0 0 1 4,-4h${bw - 8}a4,4 0 0 1 4,4v${h - 4}z"/><rect x="${cx - slot / 2}" y="${m.t}" width="${slot}" height="${H - m.t - m.b}" fill="transparent"/></g>`;
        g += `<text class="val" x="${cx}" y="${H - m.b - h - 6}" text-anchor="middle">${b.list.length}</text>`;
      }
      if (W >= 480 || i % 2 === 0) g += `<text class="tick" x="${cx}" y="${H - m.b + 18}" text-anchor="middle">${b.v}</text>`;
    });
    el.innerHTML = svg(W, H, g, "Nombre de modèles par tranche de 50 points");
  }

  // ---------- 6. Évolution des points du top 5 (lignes, une par modèle) ----------
  function evolution(rows, history) {
    const el = $("#chart-evo");
    const note = $("#evo-note");
    const top = rows.slice(0, 5);
    const days = (history || []).filter((h) => top.some((r) => h.points[r.m.id] != null));
    $("#evo-legend").innerHTML = top.map((r, k) => `<span><i class="sw s${k + 1}"></i>${esc(r.m.name)}</span>`).join("");
    if (days.length < 2) {
      el.innerHTML = `<p class="chart-empty">La courbe apparaîtra dès le deuxième jour d'historique.</p>`;
      note.textContent = "";
      return;
    }
    const W = el.clientWidth, H = W < 560 ? 260 : 320;
    const m = { l: 44, r: W < 560 ? 12 : 140, t: 14, b: 32 };
    const t0 = Date.parse(days[0].date), t1 = Date.parse(days[days.length - 1].date);
    const X = (d) => m.l + ((Date.parse(d) - t0) / (t1 - t0)) * (W - m.l - m.r);
    const vals = days.flatMap((d) => top.map((r) => d.points[r.m.id])).filter((v) => v != null);
    const y0 = Math.floor((Math.min(...vals) - 10) / 50) * 50, y1 = Math.ceil((Math.max(...vals) + 10) / 50) * 50;
    const Y = (v) => H - m.b - ((v - y0) / (y1 - y0)) * (H - m.t - m.b);
    const day = (d) => new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" });

    let g = "";
    const stepY = y1 - y0 > 200 ? 100 : 50;
    for (let v = y0; v <= y1; v += stepY) {
      g += `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${Y(v)}" y2="${Y(v)}"/><text class="tick" x="${m.l - 8}" y="${Y(v)}" text-anchor="end" dominant-baseline="middle">${v}</text>`;
    }
    const every = Math.max(1, Math.ceil(days.length / (W < 560 ? 4 : 7)));
    days.forEach((d, i) => {
      if (i % every === 0 || i === days.length - 1) g += `<text class="tick" x="${X(d.date)}" y="${H - m.b + 18}" text-anchor="middle">${day(d.date)}</text>`;
    });

    // Lignes puis points de fin, et étiquettes directes écartées pour ne pas se chevaucher.
    const ends = [];
    top.forEach((r, k) => {
      const series = days.filter((d) => d.points[r.m.id] != null);
      if (!series.length) return;
      if (series.length > 1) g += `<polyline class="line s${k + 1}" points="${series.map((d) => `${X(d.date)},${Y(d.points[r.m.id])}`).join(" ")}"/>`;
      const last = series[series.length - 1];
      g += `<circle class="dot s${k + 1}" cx="${X(last.date)}" cy="${Y(last.points[r.m.id])}" r="4.5"/>`;
      ends.push({ r, y: Y(last.points[r.m.id]), x: X(last.date), v: last.points[r.m.id] });
    });
    if (m.r > 40) {
      ends.sort((a, b) => a.y - b.y);
      for (let i = 1; i < ends.length; i++) ends[i].y = Math.max(ends[i].y, ends[i - 1].y + 15);
      for (const e of ends) g += `<text class="dlabel" x="${e.x + 10}" y="${e.y}" dominant-baseline="middle">${esc(e.r.m.name)} · ${e.v}</text>`;
    }

    // Survol : une bande par jour, avec un repère vertical et le détail des 5 modèles.
    days.forEach((d, i) => {
      const prev = i ? X(days[i - 1].date) : m.l, next = i < days.length - 1 ? X(days[i + 1].date) : W - m.r;
      const x = X(d.date), a = (prev + x) / 2, b = (x + next) / 2;
      const lines = top.map((r) => (d.points[r.m.id] != null ? `${esc(r.m.name)} : ${d.points[r.m.id]}` : null)).filter(Boolean);
      g += `<g class="band" ${tip(`<b>${day(d.date)}</b><br>${lines.join("<br>")}`)}><line class="guide" x1="${x}" x2="${x}" y1="${m.t}" y2="${H - m.b}"/><rect x="${i ? a : m.l}" y="${m.t}" width="${(i < days.length - 1 ? b : W - m.r) - (i ? a : m.l)}" height="${H - m.t - m.b}" fill="transparent"/></g>`;
    });
    el.innerHTML = svg(W, H, g, "Évolution des points ERAZ des cinq premiers");
    note.textContent = `Historique enregistré depuis le ${day(days[0].date)} ${days[0].date.slice(0, 4)} : un point s'ajoute chaque jour.`;
  }

  window.renderCharts = (rows, D, history) => {
    if (!$("#analyses")) return;
    kpis(rows);
    evolution(rows, history);
    scatter(rows);
    labs(rows);
    podium(rows, D);
    saturation(rows, D);
    histogram(rows);
  };

  // Info-bulles partagées par tous les graphiques.
  document.addEventListener("mousemove", (e) => {
    const t = document.getElementById("tooltip");
    const host = e.target.closest && e.target.closest("#analyses [data-tip]");
    if (!host) { if (t.dataset.owner === "charts") { t.hidden = true; t.dataset.owner = ""; } return; }
    t.innerHTML = host.getAttribute("data-tip");
    t.hidden = false;
    t.dataset.owner = "charts";
    const x = Math.min(e.clientX + 14, innerWidth - t.offsetWidth - 8);
    const y = e.clientY + 16 + t.offsetHeight > innerHeight ? e.clientY - t.offsetHeight - 12 : e.clientY + 16;
    t.style.left = x + "px";
    t.style.top = y + "px";
  });
})();
