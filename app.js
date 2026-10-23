(() => {
  // Formule partagée (scoring.js) et textes de la langue de la page (i18n.js).
  const Z = window.ERAZScore;
  const I = window.I18N;
  const T = I.T;
  const D = Z.prepare(window.APEX_DATA, window.APEX_SCORES);

  const $ = (s, r = document) => r.querySelector(s);
  // Le site a plusieurs pages : chaque bloc ne s'active que si ses éléments sont présents.
  const on = (sel, ev, fn) => { const el = document.querySelector(sel); if (el) el.addEventListener(ev, fn); };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const CATS = Object.keys(D.categories);
  const SHOWN_CATS = ["reasoning", "math", "code", "agents"];
  const PRESETS = Z.PRESETS;
  const DEFAULT_W = PRESETS.balanced;
  const catLabel = (c) => I.cat(D, c);

  const state = {
    preset: "balanced",
    weights: { ...DEFAULT_W },
    sort: { key: "points", dir: -1 },
    query: "",
    org: "",
    openOnly: false,
  };

  // ---------- Scoring ----------
  const benchById = Object.fromEntries(D.benchmarks.map((b) => [b.id, b]));
  const norm = Z.norm;
  const rankOf = Z.rankOf;
  const rowsWith = (weights) => Z.rank(D, weights);
  const computeAll = () => rowsWith(state.weights);
  const historyPoints = (weights) => Z.historyPoints(D, window.ERAZ_HISTORY, weights);

  // ---------- Formatting ----------
  const fmtScore = (b, v) => (v == null ? "—" : b.unit === "Elo" ? Math.round(v) : I.num(v, 1));
  const fmtCat = (v) => (v == null ? '<span class="dash">—</span>' : Math.round(v));
  const fmtPrice = (v) => (v == null ? '<span class="dash">—</span>' : I.price(v));
  const openBadge = (m) => (m.open ? `<span class="badge open">${T.open}</span>` : m.open === false ? `<span class="badge">${T.proprietary}</span>` : "");
  const modelLink = (m) => T.modelPath(m.id);

  // ---------- Header / hero ----------
  // Ligne d'édition, comme une publication : numéro du jour depuis le lancement + date complète.
  const LAUNCH = "2026-10-21";
  const edition = Math.round((Date.parse(D.updated) - Date.parse(LAUNCH)) / 864e5) + 1;
  if ($("#edition")) $("#edition").textContent = T.edition(edition);
  if ($("#updated")) $("#updated").textContent = I.date(D.updated, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const nScores = D.models.reduce((a, m) => a + Object.keys(m.s).length, 0);
  if ($("#stats")) $("#stats").innerHTML = [D.models.length, D.benchmarks.length, nScores, new Set(D.models.map((m) => m.org)).size]
    .map((n, i) => `<div class="stat"><b>${n}</b><span>${T.stats[i]}</span></div>`).join("");

  function renderPodium(rows) {
    if (!$("#podium")) return;
    $("#podium").innerHTML = rows.slice(0, 3).map((r, i) => `
      <button class="pod" type="button" data-id="${r.m.id}">
        <div class="pod-top"><span class="medal m${i + 1}">#${i + 1}</span>${openBadge(r.m)}</div>
        <h3>${esc(r.m.name)}</h3>
        <div class="org">${esc(r.m.org)}</div>
        <div class="pts">${r.points}<small>/ 1000</small></div>
        <div class="mini">${SHOWN_CATS.map((c) => `<div>${catLabel(c).split(" ")[0]}<b>${r.cats[c] == null ? "—" : Math.round(r.cats[c])}</b></div>`).join("")}</div>
      </button>`).join("");
  }

  // ---------- Controls ----------
  if ($("#presets")) $("#presets").innerHTML = Object.keys(PRESETS).map((p) => `<button class="chip" type="button" data-preset="${p}" aria-pressed="${p === state.preset}">${T.presets[p]}</button>`).join("");
  on("#presets", "click", (e) => {
    const btn = e.target.closest("[data-preset]");
    if (!btn) return;
    state.preset = btn.dataset.preset;
    state.weights = { ...PRESETS[state.preset] };
    syncWeights();
    render();
  });

  if ($("#weights")) $("#weights").innerHTML = CATS.map((c) => `
    <label>${catLabel(c)}
      <input type="range" min="0" max="3" step="0.25" id="w-${c}" data-cat="${c}">
    </label>`).join("");
  function syncWeights() {
    if (!$("#weights")) return;
    for (const c of CATS) $(`#w-${c}`).value = state.weights[c];
    document.querySelectorAll("[data-preset]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.preset === state.preset));
  }
  on("#weights", "input", (e) => {
    const c = e.target.dataset.cat;
    if (!c) return;
    state.weights[c] = parseFloat(e.target.value);
    state.preset = "";
    syncWeights();
    render();
  });

  on("#advancedToggle", "click", (e) => {
    const panel = $("#advanced");
    panel.hidden = !panel.hidden;
    e.currentTarget.setAttribute("aria-expanded", String(!panel.hidden));
  });

  const orgs = [...new Set(D.models.map((m) => m.org))].sort();
  if ($("#orgFilter")) $("#orgFilter").innerHTML = `<option value="">${T.allLabs}</option>` + orgs.map((o) => `<option>${esc(o)}</option>`).join("");
  on("#orgFilter", "change", (e) => { state.org = e.target.value; render(); });
  on("#search", "input", (e) => { state.query = e.target.value.trim().toLowerCase(); render(); });
  on("#openOnly", "change", (e) => { state.openOnly = e.target.checked; render(); });

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
    if (!$("#ranking")) return;
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
      tbody.innerHTML = `<tr><td colspan="12" class="empty">${T.noMatch}</td></tr>`;
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
        <td class="c-num">${I.pct(r.coverage * 100, 0)}</td>
        <td class="c-num hide-sm">${r.m.aaii ?? '<span class="dash">—</span>'}</td>
        <td class="c-num hide-sm">${fmtPrice(r.m.priceIn)}</td>
        <td class="c-num hide-sm">${fmtPrice(r.m.priceOut)}</td>
      </tr>`).join("");
  }

  on("#ranking tbody", "click", (e) => { const tr = e.target.closest("tr[data-id]"); if (tr) openDrawer(tr.dataset.id); });
  on("#ranking tbody", "keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const tr = e.target.closest("tr[data-id]");
    if (tr) { e.preventDefault(); openDrawer(tr.dataset.id); }
  });
  on("#podium", "click", (e) => { const b = e.target.closest("[data-id]"); if (b) openDrawer(b.dataset.id); });

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
    if (!$("#matrix")) return;
    const byCat = CATS.map((c) => ({ c, benches: D.benchmarks.filter((b) => b.cat === c) })).filter((g) => g.benches.length);
    const head1 = `<tr><th></th>${byCat.map((g) => `<th class="cat-h" colspan="${g.benches.length}">${catLabel(g.c)}</th>`).join("")}</tr>`;
    const head2 = `<tr><th></th>${byCat.flatMap((g) => g.benches).map((b) => `<th title="${esc(b.name)}">${esc(b.short)}</th>`).join("")}</tr>`;
    const body = rows.map((r) => `<tr><th class="row-h" scope="row"><a href="${modelLink(r.m)}">${esc(r.m.name)}</a></th>${byCat.flatMap((g) => g.benches).map((b) => {
      const v = r.m.s[b.id];
      if (v == null) return `<td class="na" data-m="${r.m.id}" data-b="${b.id}">—</td>`;
      const n = norm(b, v), col = cellColor(n);
      const best = b.ranking[0].id === r.m.id ? " best" : "";
      return `<td class="${best.trim()}" style="background:${col.bg};color:${col.fg}" data-m="${r.m.id}" data-b="${b.id}">${fmtScore(b, v)}</td>`;
    }).join("")}</tr>`).join("");
    $("#matrix").innerHTML = `<thead>${head1}${head2}</thead><tbody>${body}</tbody>`;
  }

  const tip = $("#tooltip");
  on("#matrix", "mousemove", (e) => {
    const td = e.target.closest("td[data-b]");
    if (!td) { tip.hidden = true; return; }
    const b = benchById[td.dataset.b], m = D.models.find((x) => x.id === td.dataset.m), v = m.s[b.id];
    tip.innerHTML = v == null
      ? `<b>${esc(m.name)}</b><br>${esc(b.name)} : ${T.notPublished}`
      : `<b>${esc(m.name)}</b><br>${esc(b.name)} : ${fmtScore(b, v)} ${b.unit}<br>${T.normalized} : ${Math.round(norm(b, v))}/100 · ${T.rank} ${rankOf(b, m)}/${b.ranking.length}`;
    tip.hidden = false;
    const x = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8);
    const y = e.clientY + 16 + tip.offsetHeight > innerHeight ? e.clientY - tip.offsetHeight - 12 : e.clientY + 16;
    tip.style.left = x + "px"; tip.style.top = y + "px";
  });
  on("#matrix", "mouseleave", () => (tip.hidden = true));

  // ---------- Benchmarks ----------
  function renderBenchmarks() {
    if (!$("#benchGrid")) return;
    $("#benchGrid").innerHTML = D.benchmarks.map((b) => {
      const top = b.ranking.slice(0, 5);
      return `<article class="bench">
        <header><div><div class="cat">${catLabel(b.cat)}</div><h3>${esc(b.name)}</h3></div></header>
        <p>${esc(I.desc(b))}</p>
        <ol>${top.map((m, i) => `<li><span class="r">${i + 1}</span><span class="nm"><a href="${modelLink(m)}">${esc(m.name)}</a></span><span class="v">${b.unit === "%" ? I.pct(m.s[b.id]) : fmtScore(b, m.s[b.id])}</span><span class="track"><i style="width:${norm(b, m.s[b.id])}%"></i></span></li>`).join("")}</ol>
        <footer><span>${T.benchFoot(b.ranking.length, esc(b.source))}</span><a href="${b.url}" target="_blank" rel="noopener">${T.officialSite}</a></footer>
      </article>`;
    }).join("");
  }

  // ---------- Page « À propos » : le calcul détaillé ----------
  const n1 = (v) => I.num(v, 1);
  const n2 = (v) => I.num(v, 2);
  const n3 = (v) => I.num(v, 3);

  function renderCatDetail() {
    if (!$("#catDetail")) return;
    $("#catDetail").innerHTML = CATS.map((c) => {
      const benches = D.benchmarks.filter((b) => b.cat === c);
      const sumW = benches.reduce((a, b) => a + b.weight, 0);
      const formula = benches.map((b) => `${n2(b.weight)} × ${esc(b.short)}`).join(" + ");
      return `<article class="cd-card">
        <header><h3>${catLabel(c)}</h3><span>${T.weightInGlobal(n2(DEFAULT_W[c]))}</span></header>
        <div class="table-scroll"><table class="cd-table">
          <thead><tr><th>${T.thBench}</th><th class="r">${T.thWeight}</th><th class="r">${T.thFloor}</th><th class="r">${T.thBest}</th><th>${T.thHeldBy}</th></tr></thead>
          <tbody>${benches.map((b) => `<tr><td>${esc(b.name)}</td><td class="r">×${n2(b.weight)}</td><td class="r">${n1(b.floor)} ${esc(b.unit)}</td><td class="r">${fmtScore(b, b.best)} ${esc(b.unit)}</td><td>${esc(b.ranking[0].name)}</td></tr>`).join("")}</tbody>
        </table></div>
        <p class="cd-formula"><b>${T.scoreOf(catLabel(c))}</b> = (${formula}) ÷ ${n2(sumW)}</p>
        <p class="cd-note">${T.catNote}</p>
      </article>`;
    }).join("");
  }

  function renderExample(id) {
    if (!$("#example")) return;
    const rows = rowsWith(DEFAULT_W);
    const r = rows.find((x) => x.m.id === id) || rows[0];
    const m = r.m;
    // Étape 1 : normalisation de chaque score publié.
    const step1 = D.benchmarks.map((b) => {
      const v = m.s[b.id];
      if (v == null) return `<tr class="muted-row"><td>${esc(b.name)}</td><td class="r">—</td><td class="r">${n1(b.floor)}</td><td class="r">${fmtScore(b, b.best)}</td><td class="r">${T.notPublished}</td></tr>`;
      return `<tr><td>${esc(b.name)}</td><td class="r">${fmtScore(b, v)}</td><td class="r">${n1(b.floor)}</td><td class="r">${fmtScore(b, b.best)}</td><td class="r">(${fmtScore(b, v)} − ${n1(b.floor)}) ÷ (${fmtScore(b, b.best)} − ${n1(b.floor)}) × 100 = <b>${n1(norm(b, v))}</b></td></tr>`;
    }).join("");
    // Étape 2 : moyenne pondérée dans chaque catégorie.
    const step2 = CATS.map((c) => {
      const benches = D.benchmarks.filter((b) => b.cat === c && m.s[b.id] != null);
      if (!benches.length) return `<li>${T.noResults(catLabel(c))}</li>`;
      const sumW = benches.reduce((a, b) => a + b.weight, 0);
      const terms = benches.map((b) => `${n2(b.weight)} × ${n1(norm(b, m.s[b.id]))}`).join(" + ");
      return `<li><b>${catLabel(c)}</b> = (${terms}) ÷ ${n2(sumW)} = <b>${n1(r.cats[c])}</b></li>`;
    }).join("");
    // Étapes 3 et 4 : score global, couverture, points.
    const present = CATS.filter((c) => r.cats[c] != null);
    const sumWc = present.reduce((a, c) => a + DEFAULT_W[c], 0);
    const totalW = CATS.reduce((a, c) => a + DEFAULT_W[c], 0);
    const g = present.map((c) => `${n2(DEFAULT_W[c])} × ${n1(r.cats[c])}`).join(" + ");
    const covTerms = CATS.map((c) => {
      const all = D.benchmarks.filter((b) => b.cat === c);
      const pub = all.filter((b) => m.s[b.id] != null).reduce((a, b) => a + b.weight, 0);
      const tot = all.reduce((a, b) => a + b.weight, 0);
      return { c, pub, tot, part: DEFAULT_W[c] * (pub / tot) };
    });
    const factor = 0.75 + 0.25 * r.coverage;
    $("#example").innerHTML = `
      <div class="ex-step"><span class="step">1</span><div><h3>${T.s1Title}</h3>
        <p>${T.s1Text}</p>
        <div class="table-scroll"><table class="cd-table"><thead><tr><th>${T.thBench}</th><th class="r">${T.thScoreOf(esc(m.name))}</th><th class="r">${T.thFloor}</th><th class="r">${T.thBestShort}</th><th class="r">${T.thCalc}</th></tr></thead><tbody>${step1}</tbody></table></div></div></div>
      <div class="ex-step"><span class="step">2</span><div><h3>${T.s2Title}</h3>
        <p>${T.s2Text}</p><ul class="ex-list">${step2}</ul></div></div>
      <div class="ex-step"><span class="step">3</span><div><h3>${T.s3Title}</h3>
        <p>${T.s3Text}</p>
        <p class="cd-formula">(${g}) ÷ ${n2(sumWc)} = <b>${n2(r.raw)}</b> ${T.outOf100}</p></div></div>
      <div class="ex-step"><span class="step">4</span><div><h3>${T.s4Title}</h3>
        <p>${T.s4Text(n2(totalW))}</p>
        <ul class="ex-list">${covTerms.map((t) => `<li>${catLabel(t.c)} : ${n2(DEFAULT_W[t.c])} × (${n2(t.pub)} ÷ ${n2(t.tot)}) = ${n2(t.part)}</li>`).join("")}</ul>
        <p class="cd-formula">${T.coverageEq} = ${n2(covTerms.reduce((a, t) => a + t.part, 0))} ÷ ${n2(totalW)} = <b>${I.pct(r.coverage * 100)}</b></p></div></div>
      <div class="ex-step"><span class="step">5</span><div><h3>${T.s5Title}</h3>
        <p>${T.s5Text}</p>
        <p class="cd-formula">${n2(r.raw)} × 10 × (${n2(0.75)} + ${n2(0.25)} × ${n3(r.coverage)}) = ${n2(r.raw)} × 10 × ${n3(factor)} = <b>${r.points} ${T.pointsWord}</b> ${T.rounded}</p>
        <p class="cd-note">${T.conclusion(esc(m.name), r.rank)}</p></div></div>`;
  }

  if ($("#exampleModel")) {
    const ranked = rowsWith(DEFAULT_W);
    $("#exampleModel").innerHTML = ranked.map((r) => `<option value="${r.m.id}">${r.rank}. ${esc(r.m.name)}</option>`).join("");
    on("#exampleModel", "change", (e) => renderExample(e.target.value));
    renderCatDetail();
    renderExample(ranked[0].m.id);
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
      <div class="d-row"><span class="lbl">${catLabel(c)}</span>
        <div class="bar"><i style="width:${r.cats[c] ?? 0}%"></i></div>
        <span class="val">${r.cats[c] == null ? "—" : Math.round(r.cats[c])}</span></div>`).join("");
    const benchBlock = D.benchmarks.map((b) => {
      const v = m.s[b.id];
      return `<div class="d-row"><span class="lbl"><a href="${b.url}" target="_blank" rel="noopener">${esc(b.name)}</a></span>
        <div class="bar"><i style="width:${v == null ? 0 : norm(b, v)}%"></i></div>
        <span class="val">${v == null ? '<span class="dash">—</span>' : `${fmtScore(b, v)}<small>#${rankOf(b, m)} / ${b.ranking.length}${m.refs?.[b.id] ? ` · <a href="${esc(m.refs[b.id])}" target="_blank" rel="noopener" title="${T.scoreSource}">src</a>` : ""}</small>`}</span></div>`;
    }).join("");
    $("#drawerBody").innerHTML = `
      <div class="d-head"><div class="org">${esc(m.org)} ${openBadge(m)} · ${T.context} ${esc(m.ctx)}</div><h2 id="drawerTitle">${esc(m.name)}</h2></div>
      <div class="d-kpis">
        <div><span>${T.ercRank}</span><b>#${r.rank}</b></div>
        <div><span>${T.points}</span><b>${r.points}</b></div>
        <div><span>${T.coverage}</span><b>${I.pct(r.coverage * 100, 0)}</b></div>
      </div>
      <p class="d-full"><a href="${modelLink(m)}">${T.fullPage}</a></p>
      <div class="d-section"><h4>${T.catScores}</h4>${catBlock}</div>
      <div class="d-section"><h4>${T.rawResults}</h4>${benchBlock}</div>
      <p class="d-src">AA Intelligence Index : ${m.aaii ?? "—"} · ${T.pricePerM} : ${m.priceIn == null ? "—" : `${I.price(m.priceIn)} ${T.input}, ${I.price(m.priceOut)} ${T.output}`}<br>
      ${T.sourcesOf} : <a href="${m.src}" target="_blank" rel="noopener">${T.modelPage}</a> · <a href="https://artificialanalysis.ai/leaderboards/models" target="_blank" rel="noopener">Artificial Analysis ↗</a></p>`;
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
  on("#drawerClose", "click", closeDrawer);
  on("#backdrop", "click", closeDrawer);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && drawer && drawer.classList.contains("open")) closeDrawer(); });

  // ---------- Theme ----------
  try { const t = localStorage.getItem("apex-theme"); if (t) document.documentElement.dataset.theme = t; } catch {}
  on("#themeToggle", "click", () => {
    const next = isDark() ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("apex-theme", next); } catch {}
    render();
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", render);

  // ---------- Sources ----------
  if ($("#sources")) $("#sources").innerHTML = D.sources.map((s) => `<li><a href="${s.url}" target="_blank" rel="noopener">${esc(s.name)}</a></li>`).join("");

  // ---------- Fiche modèle : courbe d'évolution (le reste de la page est déjà écrit en HTML) ----------
  function renderModelHistory() {
    const el = $("#modelHistory");
    if (!el) return;
    const id = el.dataset.model;
    const days = historyPoints(DEFAULT_W).filter((d) => d.points[id] != null);
    el.innerHTML = days.slice(-30).reverse().map((d, i, arr) => {
      const prev = arr[i + 1];
      const dlt = prev ? d.points[id] - prev.points[id] : null;
      const delta = dlt == null ? "" : dlt > 0 ? `<span class="d up">▲ ${dlt}</span>` : dlt < 0 ? `<span class="d down">▼ ${-dlt}</span>` : `<span class="d flat">= 0</span>`;
      return `<tr><td>${I.date(d.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</td><td class="r">${d.points[id]}</td><td class="r">${delta}</td></tr>`;
    }).join("");
  }

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

  // ---------- Bandeau de cotations : top 12 et variation depuis la veille (profil par défaut) ----------
  function renderTicker() {
    const el = $("#ticker");
    if (!el) return;
    const rows = rowsWith(DEFAULT_W).slice(0, 12);
    const hist = historyPoints(DEFAULT_W);
    const prev = hist.length >= 2 ? hist[hist.length - 2].points : null;
    const item = (r) => {
      const before = prev ? prev[r.m.id] : null;
      const dlt = before == null ? null : r.points - before;
      const delta = dlt == null ? `<span class="d new">${T.tkNew}</span>`
        : dlt > 0 ? `<span class="d up" aria-label="${T.tkUp(dlt)}">▲ ${dlt}</span>`
        : dlt < 0 ? `<span class="d down" aria-label="${T.tkDown(-dlt)}">▼ ${-dlt}</span>`
        : `<span class="d flat" aria-label="${T.tkFlat}">= 0</span>`;
      return `<a class="tk" href="${modelLink(r.m)}"><span class="tk-rank">${r.rank}</span>${esc(r.m.name)}<span class="tk-pts">${r.points}</span>${delta}</a>`;
    };
    const list = rows.map(item).join("");
    // Contenu doublé pour une boucle sans à-coup ; la copie est masquée aux lecteurs d'écran.
    el.innerHTML = `<div class="ticker-track"><div class="ticker-list">${list}</div><div class="ticker-list" aria-hidden="true">${list}</div></div>`;
  }

  // Le bouton EN/FR mémorise la langue choisie : elle prime ensuite sur la langue du navigateur.
  on(".lang-link", "click", (e) => { try { localStorage.setItem("eraz-lang", e.currentTarget.getAttribute("hreflang")); } catch {} });

  // Bouton « Copier » des codes d'intégration du badge (fiches modèles).
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-copy]");
    if (!btn) return;
    const src = document.getElementById(btn.dataset.copy);
    navigator.clipboard.writeText(src.value || src.textContent).then(() => {
      const old = btn.textContent;
      btn.textContent = btn.dataset.done;
      setTimeout(() => (btn.textContent = old), 1500);
    });
  });

  syncWeights();
  renderBenchmarks();
  renderTicker();
  renderModelHistory();
  render();
})();
