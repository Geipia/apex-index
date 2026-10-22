(() => {
  const D = window.APEX_DATA;

  // Scores récupérés automatiquement (scripts/update-data.mjs) : ils priment sur les valeurs saisies à la main.
  const S = window.APEX_SCORES;
  if (S) {
    D.updated = S.updated;
    for (const m of D.models) {
      const e = S.models[m.id];
      if (!e) continue;
      m.s = { ...m.s, ...e.s };
      m.refs = e.refs || {};
      if (e.aaii != null) m.aaii = e.aaii;
      if (e.priceIn != null) m.priceIn = e.priceIn;
      if (e.priceOut != null) m.priceOut = e.priceOut;
      if (typeof e.open === "boolean") m.open = e.open;
    }
  }
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const CATS = Object.keys(D.categories);
  const SHOWN_CATS = ["reasoning", "math", "code", "agents"];
  const PRESETS = {
    "Équilibré":     { reasoning: 1, math: 1, code: 1, agents: 1, knowledge: 0.75, context: 0.5, vision: 0.5 },
    "Raisonnement":  { reasoning: 3, math: 1.5, code: 0.5, agents: 0.5, knowledge: 1, context: 0.5, vision: 0.5 },
    "Maths":         { reasoning: 1, math: 3, code: 0.5, agents: 0.25, knowledge: 0.5, context: 0.25, vision: 0.25 },
    "Code":          { reasoning: 0.75, math: 0.5, code: 3, agents: 1.5, knowledge: 0.25, context: 0.75, vision: 0.25 },
    "Agents":        { reasoning: 0.75, math: 0.25, code: 1.5, agents: 3, knowledge: 0.5, context: 1, vision: 0.75 },
  };

  const state = {
    preset: "Équilibré",
    weights: { ...PRESETS["Équilibré"] },
    sort: { key: "points", dir: -1 },
    query: "",
    org: "",
    openOnly: false,
  };

  // ---------- Scoring ----------
  const benchById = Object.fromEntries(D.benchmarks.map((b) => [b.id, b]));
  // "best" est fixé sur l'ensemble des modèles suivis, indépendamment des filtres.
  for (const b of D.benchmarks) {
    const vals = D.models.map((m) => m.s[b.id]).filter((v) => v != null);
    b.best = Math.max(...vals);
    b.ranking = D.models.filter((m) => m.s[b.id] != null).sort((x, y) => y.s[b.id] - x.s[b.id]);
  }
  const norm = (b, v, best = b.best) => Math.max(0, Math.min(1, (v - b.floor) / (best - b.floor))) * 100;
  const rankOf = (b, m) => b.ranking.findIndex((x) => x.id === m.id) + 1;

  // s = scores bruts d'un modèle ; best = meilleur score par benchmark parmi les modèles comparés.
  function scoreScores(s, weights, best) {
    const cats = {};
    let num = 0, den = 0, cov = 0, totalW = 0;
    for (const c of CATS) {
      const benches = D.benchmarks.filter((b) => b.cat === c);
      const allW = benches.reduce((a, b) => a + b.weight, 0);
      let n = 0, d = 0;
      for (const b of benches) {
        const v = s[b.id];
        if (v == null) continue;
        n += norm(b, v, best ? best[b.id] : b.best) * b.weight;
        d += b.weight;
      }
      const W = weights[c] ?? 0;
      totalW += W;
      if (d > 0) {
        cats[c] = n / d;
        num += cats[c] * W;
        den += W;
        cov += W * (d / allW);
      } else cats[c] = null;
    }
    const raw = den ? num / den : 0;
    const coverage = totalW ? cov / totalW : 0;
    const points = Math.round(raw * 10 * (0.75 + 0.25 * coverage));
    return { cats, raw, coverage, points };
  }

  function score(m, weights) {
    const wins = D.benchmarks.filter((b) => b.ranking[0] && b.ranking[0].id === m.id).length;
    return { ...scoreScores(m.s, weights), wins };
  }

  // Points de chaque modèle pour chaque jour de l'historique, avec la même formule
  // (le « meilleur » de chaque benchmark est celui du jour concerné).
  function historyPoints(weights) {
    return (window.ERAZ_HISTORY || []).map((snap) => {
      const best = {};
      for (const b of D.benchmarks) {
        const vals = Object.values(snap.models).map((s) => s[b.id]).filter((v) => v != null);
        if (vals.length) best[b.id] = Math.max(...vals);
      }
      const points = {};
      for (const [id, s] of Object.entries(snap.models)) points[id] = scoreScores(s, weights, best).points;
      return { date: snap.date, points };
    });
  }

  function computeAll() {
    return D.models
      .map((m) => ({ m, ...score(m, state.weights) }))
      .sort((a, b) => b.points - a.points)
      .map((r, i) => ({ ...r, rank: i + 1 }));
  }

  // ---------- Formatting ----------
  const fmtScore = (b, v) => (v == null ? "—" : b.unit === "Elo" ? Math.round(v) : (Math.round(v * 10) / 10).toLocaleString("fr-FR"));
  const fmtCat = (v) => (v == null ? '<span class="dash">—</span>' : Math.round(v));
  const fmtPrice = (v) => (v == null ? '<span class="dash">—</span>' : "$" + (v < 1 ? v.toFixed(2).replace(/0$/, "") : v.toFixed(2).replace(/\.00$/, "")));
  const openBadge = (m) => (m.open ? '<span class="badge open">Open</span>' : m.open === false ? '<span class="badge">Propriétaire</span>' : "");

  // ---------- Header / hero ----------
  $("#updated").textContent = new Date(D.updated).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  const nScores = D.models.reduce((a, m) => a + Object.keys(m.s).length, 0);
  $("#stats").innerHTML = [
    [D.models.length, "modèles classés"],
    [D.benchmarks.length, "benchmarks"],
    [nScores, "résultats vérifiés"],
    [new Set(D.models.map((m) => m.org)).size, "laboratoires"],
  ].map(([n, l]) => `<div class="stat"><b>${n}</b><span>${l}</span></div>`).join("");

  function renderPodium(rows) {
    $("#podium").innerHTML = rows.slice(0, 3).map((r, i) => `
      <button class="pod" type="button" data-id="${r.m.id}">
        <div class="pod-top"><span class="medal m${i + 1}">#${i + 1}</span>${openBadge(r.m)}</div>
        <h3>${esc(r.m.name)}</h3>
        <div class="org">${esc(r.m.org)}</div>
        <div class="pts">${r.points}<small>/ 1000</small></div>
        <div class="mini">${SHOWN_CATS.map((c) => `<div>${D.categories[c].label.split(" ")[0]}<b>${r.cats[c] == null ? "—" : Math.round(r.cats[c])}</b></div>`).join("")}</div>
      </button>`).join("");
  }

  // ---------- Controls ----------
  $("#presets").innerHTML = Object.keys(PRESETS).map((p) => `<button class="chip" type="button" data-preset="${p}" aria-pressed="${p === state.preset}">${p}</button>`).join("");
  $("#presets").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-preset]");
    if (!btn) return;
    state.preset = btn.dataset.preset;
    state.weights = { ...PRESETS[state.preset] };
    syncWeights();
    render();
  });

  $("#weights").innerHTML = CATS.map((c) => `
    <label>${D.categories[c].label}
      <input type="range" min="0" max="3" step="0.25" id="w-${c}" data-cat="${c}">
    </label>`).join("");
  function syncWeights() {
    for (const c of CATS) $(`#w-${c}`).value = state.weights[c];
    document.querySelectorAll("[data-preset]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.preset === state.preset));
  }
  $("#weights").addEventListener("input", (e) => {
    const c = e.target.dataset.cat;
    if (!c) return;
    state.weights[c] = parseFloat(e.target.value);
    state.preset = "";
    syncWeights();
    render();
  });

  $("#advancedToggle").addEventListener("click", (e) => {
    const panel = $("#advanced");
    panel.hidden = !panel.hidden;
    e.currentTarget.setAttribute("aria-expanded", String(!panel.hidden));
  });

  const orgs = [...new Set(D.models.map((m) => m.org))].sort();
  $("#orgFilter").innerHTML = `<option value="">Tous les éditeurs</option>` + orgs.map((o) => `<option>${esc(o)}</option>`).join("");
  $("#orgFilter").addEventListener("change", (e) => { state.org = e.target.value; render(); });
  $("#search").addEventListener("input", (e) => { state.query = e.target.value.trim().toLowerCase(); render(); });
  $("#openOnly").addEventListener("change", (e) => { state.openOnly = e.target.checked; render(); });

  document.querySelectorAll(".ranking th[data-sort]").forEach((th) => {
    th.addEventListener("click", () => {
      const k = th.dataset.sort;
      state.sort = state.sort.key === k ? { key: k, dir: -state.sort.dir } : { key: k, dir: (k === "priceIn" || k === "priceOut") ? 1 : -1 };
      render();
    });
  });

  // ---------- Ranking table ----------
  function sortVal(r, k) {
    if (k === "points" || k === "wins") return r[k];
    if (k === "coverage") return r.coverage;
    if (k === "aaii" || k === "priceIn" || k === "priceOut") return r.m[k];
    return r.cats[k];
  }

  function renderTable(rows) {
    const { key, dir } = state.sort;
    let list = rows.filter((r) =>
      (!state.query || r.m.name.toLowerCase().includes(state.query) || r.m.org.toLowerCase().includes(state.query)) &&
      (!state.org || r.m.org === state.org) &&
      (!state.openOnly || r.m.open));
    list = list.slice().sort((a, b) => {
      const va = sortVal(a, key), vb = sortVal(b, key);
      if (va == null && vb == null) return a.rank - b.rank;
      if (va == null) return 1;
      if (vb == null) return -1;
      return (va - vb) * dir || a.rank - b.rank;
    });

    document.querySelectorAll(".ranking th[data-sort]").forEach((th) => {
      if (th.dataset.sort === key) th.setAttribute("aria-sort", dir < 0 ? "descending" : "ascending");
      else th.removeAttribute("aria-sort");
    });

    const tbody = $("#ranking tbody");
    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="12" class="empty">Aucun modèle ne correspond à ces filtres.</td></tr>`;
      return;
    }
    const max = Math.max(...rows.map((r) => r.points));
    tbody.innerHTML = list.map((r) => `
      <tr tabindex="0" data-id="${r.m.id}">
        <td class="c-rank">${r.rank <= 3 ? `<span class="rank-medal m${r.rank}">${r.rank}</span>` : r.rank}</td>
        <td><div class="model-cell"><b>${esc(r.m.name)}</b><span>${esc(r.m.org)} ${openBadge(r.m)}</span></div></td>
        <td class="c-points"><div class="points"><b>${r.points}</b><div class="bar"><i style="width:${(r.points / max) * 100}%"></i></div></div></td>
        ${SHOWN_CATS.map((c) => `<td class="c-cat">${fmtCat(r.cats[c])}</td>`).join("")}
        <td class="c-num">${r.wins || '<span class="dash">0</span>'}</td>
        <td class="c-num">${Math.round(r.coverage * 100)} %</td>
        <td class="c-num hide-sm">${r.m.aaii ?? '<span class="dash">—</span>'}</td>
        <td class="c-num hide-sm">${fmtPrice(r.m.priceIn)}</td>
        <td class="c-num hide-sm">${fmtPrice(r.m.priceOut)}</td>
      </tr>`).join("");
  }

  $("#ranking tbody").addEventListener("click", (e) => { const tr = e.target.closest("tr[data-id]"); if (tr) openDrawer(tr.dataset.id); });
  $("#ranking tbody").addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const tr = e.target.closest("tr[data-id]");
    if (tr) { e.preventDefault(); openDrawer(tr.dataset.id); }
  });
  $("#podium").addEventListener("click", (e) => { const b = e.target.closest("[data-id]"); if (b) openDrawer(b.dataset.id); });

  // ---------- Matrix (heatmap séquentielle, une seule teinte) ----------
  const RAMP_LIGHT = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"];
  const RAMP_DARK  = ["#104281", "#184f95", "#1c5cab", "#256abf", "#3987e5", "#6da7ec", "#9ec5f4"];
  const isDark = () => {
    const t = document.documentElement.dataset.theme;
    return t ? t === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  };
  function cellColor(n) {
    const ramp = isDark() ? RAMP_DARK : RAMP_LIGHT;
    const i = Math.min(ramp.length - 1, Math.floor((n / 100) * (ramp.length - 0.001)));
    const strong = isDark() ? i >= 5 : i >= 3;
    return { bg: ramp[i], fg: strong ? (isDark() ? "#0b0b0b" : "#ffffff") : (isDark() ? "#f0efec" : "#0b0b0b") };
  }

  function renderMatrix(rows) {
    const byCat = CATS.map((c) => ({ c, benches: D.benchmarks.filter((b) => b.cat === c) })).filter((g) => g.benches.length);
    const head1 = `<tr><th></th>${byCat.map((g) => `<th class="cat-h" colspan="${g.benches.length}">${D.categories[g.c].label}</th>`).join("")}</tr>`;
    const head2 = `<tr><th></th>${byCat.flatMap((g) => g.benches).map((b) => `<th title="${esc(b.name)}">${esc(b.short)}</th>`).join("")}</tr>`;
    const body = rows.map((r) => `<tr><th class="row-h" scope="row">${esc(r.m.name)}</th>${byCat.flatMap((g) => g.benches).map((b) => {
      const v = r.m.s[b.id];
      if (v == null) return `<td class="na" data-m="${r.m.id}" data-b="${b.id}">—</td>`;
      const n = norm(b, v), col = cellColor(n);
      const best = b.ranking[0].id === r.m.id ? " best" : "";
      return `<td class="${best.trim()}" style="background:${col.bg};color:${col.fg}" data-m="${r.m.id}" data-b="${b.id}">${fmtScore(b, v)}</td>`;
    }).join("")}</tr>`).join("");
    $("#matrix").innerHTML = `<thead>${head1}${head2}</thead><tbody>${body}</tbody>`;
  }

  const tip = $("#tooltip");
  $("#matrix").addEventListener("mousemove", (e) => {
    const td = e.target.closest("td[data-b]");
    if (!td) { tip.hidden = true; return; }
    const b = benchById[td.dataset.b], m = D.models.find((x) => x.id === td.dataset.m), v = m.s[b.id];
    tip.innerHTML = v == null
      ? `<b>${esc(m.name)}</b><br>${esc(b.name)} : non publié`
      : `<b>${esc(m.name)}</b><br>${esc(b.name)} : ${fmtScore(b, v)} ${b.unit}<br>Normalisé : ${Math.round(norm(b, v))}/100 · rang ${rankOf(b, m)}/${b.ranking.length}`;
    tip.hidden = false;
    const x = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8);
    const y = e.clientY + 16 + tip.offsetHeight > innerHeight ? e.clientY - tip.offsetHeight - 12 : e.clientY + 16;
    tip.style.left = x + "px"; tip.style.top = y + "px";
  });
  $("#matrix").addEventListener("mouseleave", () => (tip.hidden = true));

  // ---------- Benchmarks ----------
  function renderBenchmarks() {
    $("#benchGrid").innerHTML = D.benchmarks.map((b) => {
      const top = b.ranking.slice(0, 5);
      return `<article class="bench">
        <header><div><div class="cat">${D.categories[b.cat].label}</div><h3>${esc(b.name)}</h3></div></header>
        <p>${esc(b.desc)}</p>
        <ol>${top.map((m, i) => `<li><span class="r">${i + 1}</span><span class="nm">${esc(m.name)}</span><span class="v">${fmtScore(b, m.s[b.id])}${b.unit === "%" ? " %" : ""}</span><span class="track"><i style="width:${norm(b, m.s[b.id])}%"></i></span></li>`).join("")}</ol>
        <footer><span>${b.ranking.length} modèles · source : ${esc(b.source)}</span><a href="${b.url}" target="_blank" rel="noopener">Site officiel ↗</a></footer>
      </article>`;
    }).join("");
  }

  // ---------- Drawer ----------
  const drawer = $("#drawer"), backdrop = $("#backdrop");
  let lastFocus = null;
  function openDrawer(id) {
    const rows = computeAll();
    const r = rows.find((x) => x.m.id === id);
    if (!r) return;
    const m = r.m;
    const catBlock = CATS.map((c) => `
      <div class="d-row"><span class="lbl">${D.categories[c].label}</span>
        <div class="bar"><i style="width:${r.cats[c] ?? 0}%"></i></div>
        <span class="val">${r.cats[c] == null ? "—" : Math.round(r.cats[c])}</span></div>`).join("");
    const benchBlock = D.benchmarks.map((b) => {
      const v = m.s[b.id];
      return `<div class="d-row"><span class="lbl"><a href="${b.url}" target="_blank" rel="noopener">${esc(b.name)}</a></span>
        <div class="bar"><i style="width:${v == null ? 0 : norm(b, v)}%"></i></div>
        <span class="val">${v == null ? '<span class="dash">—</span>' : `${fmtScore(b, v)}<small>#${rankOf(b, m)} / ${b.ranking.length}${m.refs?.[b.id] ? ` · <a href="${esc(m.refs[b.id])}" target="_blank" rel="noopener" title="Source de ce score">src</a>` : ""}</small>`}</span></div>`;
    }).join("");
    $("#drawerBody").innerHTML = `
      <div class="d-head"><div class="org">${esc(m.org)} ${openBadge(m)} · contexte ${esc(m.ctx)}</div><h2 id="drawerTitle">${esc(m.name)}</h2></div>
      <div class="d-kpis">
        <div><span>Rang ERAZ</span><b>#${r.rank}</b></div>
        <div><span>Points</span><b>${r.points}</b></div>
        <div><span>Couverture</span><b>${Math.round(r.coverage * 100)} %</b></div>
      </div>
      <div class="d-section"><h4>Scores par catégorie (sur 100)</h4>${catBlock}</div>
      <div class="d-section"><h4>Résultats bruts</h4>${benchBlock}</div>
      <p class="d-src">AA Intelligence Index : ${m.aaii ?? "—"} · Prix par million de tokens : ${m.priceIn == null ? "—" : `${fmtPrice(m.priceIn)} en entrée, ${fmtPrice(m.priceOut)} en sortie`}<br>
      Source des scores : <a href="${m.src}" target="_blank" rel="noopener">fiche du modèle ↗</a> · <a href="https://artificialanalysis.ai/leaderboards/models" target="_blank" rel="noopener">Artificial Analysis ↗</a></p>`;
    lastFocus = document.activeElement;
    backdrop.hidden = false;
    drawer.classList.add("open");
    drawer.setAttribute("aria-hidden", "false");
    $("#drawerClose").focus();
  }
  function closeDrawer() {
    drawer.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true");
    backdrop.hidden = true;
    if (lastFocus) lastFocus.focus();
  }
  $("#drawerClose").addEventListener("click", closeDrawer);
  backdrop.addEventListener("click", closeDrawer);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && drawer.classList.contains("open")) closeDrawer(); });

  // ---------- Theme ----------
  try { const t = localStorage.getItem("apex-theme"); if (t) document.documentElement.dataset.theme = t; } catch {}
  $("#themeToggle").addEventListener("click", () => {
    const next = isDark() ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("apex-theme", next); } catch {}
    render();
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", render);

  // ---------- Sources ----------
  $("#sources").innerHTML = D.sources.map((s) => `<li><a href="${s.url}" target="_blank" rel="noopener">${esc(s.name)}</a></li>`).join("");

  function render() {
    const rows = computeAll();
    renderPodium(rows);
    renderTable(rows);
    renderMatrix(rows);
    if (window.renderCharts) window.renderCharts(rows, D, historyPoints(state.weights));
  }

  // Les graphiques sont dessinés à la largeur de leur conteneur : on redessine quand elle change.
  let lastWidth = innerWidth, resizeTimer = null;
  addEventListener("resize", () => {
    if (innerWidth === lastWidth) return;
    lastWidth = innerWidth;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => window.renderCharts && window.renderCharts(computeAll(), D, historyPoints(state.weights)), 150);
  });

  syncWeights();
  renderBenchmarks();
  render();
})();
