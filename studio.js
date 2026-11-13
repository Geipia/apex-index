// Atelier graphiques (page admin) : fabrique des images pour X à partir des données du classement.
// Tout se règle par l'adresse de la page (?type=bars&metric=points&top=10…) ou par le formulaire, qui met l'adresse à jour.
// Un agent peut donc ouvrir une adresse, attendre que le graphique soit prêt (#chart[data-ready="1"])
// puis cliquer sur « Télécharger l'image », ou lire window.ERAZStudio.dataURL().
document.addEventListener("DOMContentLoaded", () => {
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const Z = window.ERAZScore;
  const D = Z.prepare(window.APEX_DATA, window.APEX_SCORES);
  const HIST = window.ERAZ_HISTORY || [];
  const CATS = Object.keys(D.categories);
  const BENCH = Object.fromEntries(D.benchmarks.map((b) => [b.id, b]));
  const MODELS = Object.fromEntries(D.models.map((m) => [m.id, m]));

  // ---------------------------------------------------------------- réglages (adresse de la page)
  const DEFAULTS = {
    type: "bars", metric: "points", top: "10", sort: "desc", models: "", highlight: "", org: "", open: "",
    preset: "balanced", x: "priceOut", from: "", to: "", title: "", subtitle: "", source: "",
    format: "x", theme: "dark",
  };
  const TYPES = {
    bars: "Barres : classer les modèles sur une mesure",
    evolution: "Évolution des points jour par jour",
    scatter: "Nuage : points contre prix",
    labs: "Labos : combien de modèles dans le top",
    compare: "Comparer des modèles catégorie par catégorie",
    card: "Fiche d'un modèle",
  };
  const FORMATS = { x: [1600, 900, "X paysage 16:9"], square: [1080, 1080, "Carré"], portrait: [1080, 1350, "Portrait 4:5"] };
  const read = () => {
    const q = new URLSearchParams(location.search);
    return Object.fromEntries(Object.entries(DEFAULTS).map(([k, v]) => [k, q.get(k) ?? v]));
  };
  let P = read();
  const list = (s) => String(s || "").split(",").map((x) => x.trim()).filter(Boolean);

  // ---------------------------------------------------------------- mesures
  const metricLabel = (k) => {
    if (k === "points") return "Points ERAZ (sur 1000)";
    if (k === "coverage") return "Couverture des benchmarks (%)";
    if (k === "priceIn") return "Prix en entrée ($ par million de tokens)";
    if (k === "priceOut") return "Prix en sortie ($ par million de tokens)";
    if (k === "aaii") return "Artificial Analysis Intelligence Index";
    if (k === "wins") return "Benchmarks où le modèle a le meilleur score";
    if (k.startsWith("cat:")) return `Catégorie ${D.categories[k.slice(4)]?.label || "?"} (score sur 100)`;
    if (k.startsWith("bench:")) { const b = BENCH[k.slice(6)]; return b ? `${b.name}${b.unit ? ` (${b.unit})` : ""}` : "?"; }
    return k;
  };
  const metricValue = (r, k) => {
    if (k === "points") return r.points;
    if (k === "coverage") return r.coverage * 100;
    if (k === "priceIn" || k === "priceOut" || k === "aaii") return r.m[k] ?? null;
    if (k === "wins") return r.wins;
    if (k.startsWith("cat:")) return r.cats[k.slice(4)] ?? null;
    if (k.startsWith("bench:")) return r.m.s[k.slice(6)] ?? null;
    return null;
  };
  const fmt = (v, k) => {
    if (v == null) return "–";
    const n = (x, d) => x.toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });
    if (k === "points" || k === "wins" || k === "aaii") return n(v, 0);
    if (k === "coverage") return n(v, 0) + " %";
    if (k === "priceIn" || k === "priceOut") return n(v, v < 1 ? 2 : v < 10 ? 1 : 0) + " $";
    if (k.startsWith("cat:")) return n(v, 1);
    const b = BENCH[k.slice(6)];
    if (b?.unit === "Elo") return n(v, 0);
    return n(v, 1) + (b?.unit === "%" ? " %" : "");
  };
  const dateFr = (iso) => new Date(iso + "T12:00:00Z").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

  // modèles classés avec le preset choisi, puis filtres (labo, open weights)
  const ranked = () => {
    const rows = Z.rank(D, Z.PRESETS[P.preset] || Z.PRESETS.balanced);
    const orgs = list(P.org).map((o) => o.toLowerCase());
    return rows.filter((r) => (!orgs.length || orgs.includes(r.m.org.toLowerCase()))
      && (P.open === "" || (P.open === "1") === (r.m.open === true)));
  };

  // ---------------------------------------------------------------- dessin
  const PAL = {
    dark: { bg: "#0d0d0d", surface: "#1a1a19", border: "#2e2e2b", track: "#2a2a27", ink: "#f0efec", ink2: "#c3c2b7", ink3: "#8f8e86",
      series: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#8a7ee0"] },
    light: { bg: "#f5f2ea", surface: "#fbf9f4", border: "#ddd8cc", track: "#e7e2d6", ink: "#14130f", ink2: "#4f4b42", ink3: "#7c776b",
      series: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#7a6bd6"] },
  };
  const canvas = $("#chart");
  let C, ctx, W, H, k;   // k : facteur d'échelle (1 pour 1600 px de large)
  const SANS = "'IBM Plex Sans', 'Segoe UI', sans-serif", MONO = "'IBM Plex Mono', Consolas, monospace";
  const font = (w, size, fam = SANS) => { ctx.font = `${w} ${Math.round(size * k)}px ${fam}`; };
  const text = (s, x, y, { w = 400, size = 24, fam = SANS, color = C.ink, align = "left", base = "middle", max } = {}) => {
    font(w, size, fam);
    ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = base;
    let str = String(s);
    if (max) while (str.length > 1 && ctx.measureText(str).width > max * k) str = str.slice(0, -2) + "…";
    ctx.fillText(str, x * k, y * k);
    return ctx.measureText(str).width / k;
  };
  const rect = (x, y, w, h, color, r = 0) => {
    ctx.fillStyle = color; ctx.beginPath();
    if (r && ctx.roundRect) ctx.roundRect(x * k, y * k, w * k, h * k, r * k); else ctx.rect(x * k, y * k, w * k, h * k);
    ctx.fill();
  };
  const line = (x1, y1, x2, y2, color, width = 1) => {
    ctx.strokeStyle = color; ctx.lineWidth = width * k; ctx.beginPath(); ctx.moveTo(x1 * k, y1 * k); ctx.lineTo(x2 * k, y2 * k); ctx.stroke();
  };
  const mark = (cx, cy, size) => {   // logo : triangle tracé + triangle intérieur plein
    const s = size / 32, ox = cx - 16 * s, oy = cy - 15.5 * s, p = (x, y) => [(ox + x * s) * k, (oy + y * s) * k];
    ctx.strokeStyle = C.ink; ctx.lineWidth = 2.5 * s * k; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(...p(16, 3)); ctx.lineTo(...p(29, 28)); ctx.lineTo(...p(3, 28)); ctx.closePath(); ctx.stroke();
    ctx.fillStyle = C.series[0];
    ctx.beginPath(); ctx.moveTo(...p(16, 13)); ctx.lineTo(...p(22.5, 24.5)); ctx.lineTo(...p(9.5, 24.5)); ctx.closePath(); ctx.fill();
  };

  // cadre commun : logo, date, titre, sous-titre, source, eraz.ovh ; renvoie la zone libre pour le graphique
  function frame(title, subtitle, source) {
    rect(0, 0, W, H, C.bg);
    const pad = 60;
    mark(pad + 16, 70, 40);
    const wE = text("ERAZ", pad + 48, 70, { w: 700, size: 30 });
    text("Index", pad + 48 + wE + 8, 70, { w: 300, size: 30, color: C.ink3 });
    text(dateFr(D.updated), W - pad, 70, { size: 24, color: C.ink3, align: "right" });
    const titleSize = W < 1200 ? 46 : 54;
    text(title, pad, 150, { w: 700, size: titleSize, max: W - 2 * pad });
    if (subtitle) text(subtitle, pad, 150 + titleSize * 0.5 + 34, { size: 26, color: C.ink2, max: W - 2 * pad });
    line(pad, H - 70, W - pad, H - 70, C.border);
    text(source, pad, H - 38, { size: 20, color: C.ink3, max: W - 2 * pad - 160 });
    text("eraz.ovh", W - pad, H - 38, { w: 700, size: 26, color: C.series[0], align: "right" });
    return { x: pad, y: 150 + titleSize * 0.5 + 80, w: W - 2 * pad, h: H - 70 - 40 - (150 + titleSize * 0.5 + 80) };
  }
  const legend = (x, y, items) => {
    for (const [color, label] of items) {
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc((x + 7) * k, y * k, 7 * k, 0, 7); ctx.fill();
      x += 24 + text(label, x + 24, y, { size: 22, color: C.ink2 }) + 30;
    }
  };
  const SRC = "Classement ERAZ · données BenchLM et Artificial Analysis";
  const pick = (rows) => { const ids = list(P.models); return ids.length ? ids.map((id) => rows.find((r) => r.m.id === id)).filter(Boolean) : null; };

  // ----- barres
  function drawBars(rows) {
    const key = P.metric;
    let data = (pick(rows) || rows).map((r) => ({ r, v: metricValue(r, key) })).filter((d) => d.v != null);
    data.sort((a, b) => (P.sort === "asc" ? a.v - b.v : b.v - a.v));
    data = data.slice(0, Math.max(1, Math.min(25, +P.top || 10)));
    const hl = list(P.highlight);
    const top = data[0];
    const auto = key === "points" ? `${top.r.m.name} en tête du classement ERAZ` : `${top.r.m.name} en tête : ${fmt(top.v, key)}`;
    const box = frame(P.title || auto, P.subtitle || `${metricLabel(key)} · ${data.length} modèles`, P.source || SRC);
    if (hl.length) { legend(box.x, box.y, [[C.series[1], "Mis en avant"], [C.series[0], "Autres modèles"]]); box.y += 40; box.h -= 40; }
    const rowH = Math.min(64, box.h / data.length);
    const labelW = W < 1200 ? 300 : 340, rightW = W < 1200 ? 0 : 200;
    const barW = box.w - labelW - rightW - 110;
    const max = Math.max(...data.map((d) => d.v), 0) || 1;
    data.forEach((d, i) => {
      const y = box.y + rowH * (i + 0.5);
      const on = hl.includes(d.r.m.id);
      const label = key === "points" || P.sort !== "asc" ? `${d.r.rank}. ${d.r.m.name}` : d.r.m.name;
      text(label, box.x + labelW - 16, y, { w: on ? 700 : 400, size: Math.min(24, rowH * 0.5), color: on ? C.ink : C.ink2, align: "right", max: labelW - 20 });
      const th = Math.min(18, rowH * 0.36);
      rect(box.x + labelW, y - th / 2, barW, th, C.track, 4);
      const w = barW * Math.max(0, d.v) / max;
      if (w > 0) rect(box.x + labelW, y - th / 2, w, th, on ? C.series[1] : C.series[0], 4);
      text(fmt(d.v, key), box.x + labelW + w + 12, y, { size: Math.min(22, rowH * 0.46), fam: MONO, w: 500 });
      if (rightW) text(d.r.m.org, W - 60, y, { size: Math.min(21, rowH * 0.44), color: C.ink3, align: "right", max: rightW - 10 });
    });
    return data.map((d) => ({ modèle: d.r.m.name, labo: d.r.m.org, rang: d.r.rank, valeur: fmt(d.v, key) }));
  }

  // ----- évolution
  function drawEvolution(rows) {
    const w = Z.PRESETS[P.preset] || Z.PRESETS.balanced;
    let hp = Z.historyPoints(D, HIST, w);
    if (P.from) hp = hp.filter((h) => h.date >= P.from);
    if (P.to) hp = hp.filter((h) => h.date <= P.to);
    const ids = (pick(rows) || rows.slice(0, Math.min(6, +P.top || 5))).map((r) => r.m.id).slice(0, 6);
    const series = ids.map((id, i) => ({ id, name: MODELS[id].name, color: C.series[i % C.series.length], pts: hp.map((h) => h.points[id] ?? null) }));
    const box = frame(P.title || "L'évolution du classement ERAZ", P.subtitle || `Points ERAZ jour par jour, du ${dateFr(hp[0].date)} au ${dateFr(hp[hp.length - 1].date)}`, P.source || SRC);
    legend(box.x, box.y, series.map((s) => [s.color, s.name]));
    const top = box.y + 50, bottom = box.y + box.h - 40, left = box.x + 70, right = box.x + box.w - (W < 1200 ? 20 : 60);
    const vals = series.flatMap((s) => s.pts).filter((v) => v != null);
    let lo = Math.floor((Math.min(...vals) - 10) / 50) * 50, hi = Math.ceil((Math.max(...vals) + 10) / 50) * 50;
    if (hi - lo < 100) hi = lo + 100;
    const X = (i) => left + (right - left) * (hp.length < 2 ? 0.5 : i / (hp.length - 1));
    const Y = (v) => bottom - (bottom - top) * (v - lo) / (hi - lo);
    for (let v = lo; v <= hi; v += (hi - lo) / 4) {
      line(left, Y(v), right, Y(v), C.border);
      text(Math.round(v), left - 14, Y(v), { size: 19, color: C.ink3, align: "right", fam: MONO });
    }
    const every = Math.ceil(hp.length / 7);
    hp.forEach((h, i) => { if (i % every === 0 || i === hp.length - 1) text(new Date(h.date + "T12:00:00Z").toLocaleDateString("fr-FR", { day: "numeric", month: "short" }), X(i), bottom + 24, { size: 18, color: C.ink3, align: "center" }); });
    for (const s of series) {
      ctx.strokeStyle = s.color; ctx.lineWidth = 4 * k; ctx.lineJoin = "round"; ctx.beginPath();
      let started = false;
      s.pts.forEach((v, i) => { if (v == null) { started = false; return; } ctx[started ? "lineTo" : "moveTo"](X(i) * k, Y(v) * k); started = true; });
      ctx.stroke();
      const li = s.pts.map((v, i) => [v, i]).filter(([v]) => v != null).pop();
      if (li) { ctx.fillStyle = s.color; ctx.beginPath(); ctx.arc(X(li[1]) * k, Y(li[0]) * k, 6 * k, 0, 7); ctx.fill(); }
    }
    return series.map((s) => ({ modèle: s.name, début: s.pts.find((v) => v != null) ?? "–", fin: [...s.pts].reverse().find((v) => v != null) ?? "–" }));
  }

  // ----- nuage points / prix
  function drawScatter(rows) {
    const xk = P.x === "priceIn" ? "priceIn" : "priceOut";
    const data = (pick(rows) || rows).filter((r) => r.m[xk] > 0);
    const hl = list(P.highlight);
    const box = frame(P.title || "Plus cher ne veut pas dire meilleur", P.subtitle || `Points ERAZ selon le ${xk === "priceIn" ? "prix en entrée" : "prix en sortie"}, en $ par million de tokens (échelle log)`, P.source || SRC);
    const top = box.y + 10, bottom = box.y + box.h - 40, left = box.x + 70, right = box.x + box.w - 30;
    const xs = data.map((r) => Math.log10(r.m[xk]));
    const x0 = Math.floor(Math.min(...xs)), x1 = Math.ceil(Math.max(...xs));
    const ys = data.map((r) => r.points);
    const lo = Math.floor((Math.min(...ys) - 20) / 100) * 100, hi = Math.ceil((Math.max(...ys) + 20) / 100) * 100;
    const X = (v) => left + (right - left) * (Math.log10(v) - x0) / ((x1 - x0) || 1);
    const Y = (v) => bottom - (bottom - top) * (v - lo) / ((hi - lo) || 1);
    for (let v = lo; v <= hi; v += 100) { line(left, Y(v), right, Y(v), C.border); text(v, left - 14, Y(v), { size: 19, color: C.ink3, align: "right", fam: MONO }); }
    for (let e = x0; e <= x1; e++) { const v = 10 ** e; text(v < 1 ? v.toFixed(e < -1 ? 2 : 1).replace(".", ",") + " $" : v + " $", X(v), bottom + 24, { size: 19, color: C.ink3, align: "center", fam: MONO }); }
    const labelled = new Set([...rows.slice(0, 5).map((r) => r.m.id), ...hl]);
    for (const r of data) {
      const on = hl.includes(r.m.id);
      ctx.fillStyle = on ? C.series[1] : C.series[0]; ctx.beginPath(); ctx.arc(X(r.m[xk]) * k, Y(r.points) * k, (on ? 10 : 8) * k, 0, 7); ctx.fill();
      if (labelled.has(r.m.id) || data.length <= 12) text(r.m.name, X(r.m[xk]) + 14, Y(r.points) - 2, { size: 19, w: on ? 700 : 400, color: on ? C.ink : C.ink2 });
    }
    return data.map((r) => ({ modèle: r.m.name, points: r.points, prix: fmt(r.m[xk], xk) }));
  }

  // ----- labos dans le top
  function drawLabs(rows) {
    const n = Math.max(1, Math.min(30, +P.top || 10));
    const labs = {};
    rows.slice(0, n).forEach((r) => (labs[r.m.org] = labs[r.m.org] || []).push(r.m.name));
    const data = Object.entries(labs).sort((a, b) => b[1].length - a[1].length);
    const box = frame(P.title || `Le top ${n} des IA tient dans ${data.length} labo${data.length > 1 ? "s" : ""}`, P.subtitle || `Nombre de modèles dans le top ${n} ERAZ, par laboratoire`, P.source || SRC);
    const rowH = Math.min(92, box.h / data.length);
    const sq = Math.min(38, rowH * 0.45, (box.w * 0.42) / n - 8);
    data.forEach(([org, names], i) => {
      const y = box.y + rowH * (i + 0.5);
      text(org, box.x, y, { w: 700, size: Math.min(30, rowH * 0.4), max: 190 });
      for (let j = 0; j < n; j++) rect(box.x + 200 + j * (sq + 8), y - sq / 2, sq, sq, j < names.length ? C.series[0] : C.track, 5);
      text(names.join(", "), box.x + 200 + n * (sq + 8) + 24, y, { size: Math.min(23, rowH * 0.32), color: C.ink2, max: box.w - 230 - n * (sq + 8) });
    });
    return data.map(([org, names]) => ({ labo: org, modèles: names.length, noms: names.join(", ") }));
  }

  // ----- comparaison par catégorie
  function drawCompare(rows) {
    const sel = (pick(rows) || rows.slice(0, 2)).slice(0, 4);
    const names = sel.map((r) => r.m.name);
    const box = frame(P.title || names.join(" contre "), P.subtitle || "Score de chaque catégorie sur 100, calculé sur les benchmarks publiés", P.source || SRC);
    legend(box.x, box.y, sel.map((r, i) => [C.series[i], `${r.m.name} · ${r.points} pts`]));
    const top = box.y + 44, rowH = (box.h - 44) / CATS.length, labelW = 260, barW = box.w - labelW - 90;
    CATS.forEach((c, i) => {
      const y0 = top + rowH * i;
      text(D.categories[c].label, box.x + labelW - 16, y0 + rowH / 2, { size: Math.min(24, rowH * 0.32), color: C.ink2, align: "right", max: labelW - 20 });
      const bh = Math.min(16, (rowH - 14) / sel.length - 4);
      sel.forEach((r, j) => {
        const y = y0 + rowH / 2 - (sel.length * (bh + 4)) / 2 + j * (bh + 4);
        const v = r.cats[c];
        rect(box.x + labelW, y, barW, bh, C.track, 3);
        if (v != null) rect(box.x + labelW, y, barW * v / 100, bh, C.series[j], 3);
        text(v == null ? "non publié" : v.toFixed(1).replace(".", ","), box.x + labelW + (v == null ? 10 : barW * v / 100 + 10), y + bh / 2, { size: Math.min(18, bh + 4), fam: MONO, color: v == null ? C.ink3 : C.ink });
      });
    });
    return sel.flatMap((r) => CATS.map((c) => ({ modèle: r.m.name, catégorie: D.categories[c].label, score: r.cats[c] == null ? "non publié" : r.cats[c].toFixed(1) })));
  }

  // ----- fiche d'un modèle
  function drawCard(rows) {
    const r = (pick(rows) || rows)[0];
    const m = r.m;
    const n = Object.keys(m.s).length;
    const box = frame(P.title || `${m.name} : ${r.rank}${r.rank === 1 ? "er" : "e"} du classement ERAZ`, P.subtitle || `${m.org} · ${n} benchmarks publiés sur ${D.benchmarks.length}`, P.source || SRC);
    const cw = W < 1200 ? box.w : 500;
    const ch = W < 1200 ? 300 : box.h;
    rect(box.x, box.y, cw, ch, C.surface, 18);
    text(m.name, box.x + 30, box.y + 46, { w: 700, size: 32, max: cw - 60 });
    const price = m.priceIn != null ? ` · ${fmt(m.priceIn, "priceIn")} entrée · ${fmt(m.priceOut, "priceOut")} sortie / M` : "";
    text(m.org + price, box.x + 30, box.y + 88, { size: 20, color: C.ink3, max: cw - 60 });
    text(r.points, box.x + 30, box.y + 170, { size: 92, fam: MONO, w: 600 });
    text(`points · ${r.rank}${r.rank === 1 ? "er" : "e"} sur ${rows.length}`, box.x + 30, box.y + 240, { size: 23, color: C.ink2 });
    if (ch > 320) {
      text("Benchmarks publiés", box.x + 30, box.y + ch - 80, { size: 20, color: C.ink3 });
      for (let i = 0; i < D.benchmarks.length; i++) rect(box.x + 30 + i * 28, box.y + ch - 54, 22, 22, i < n ? C.series[0] : C.track, 4);
      text(`${n}/${D.benchmarks.length}`, box.x + 30 + D.benchmarks.length * 28 + 6, box.y + ch - 43, { size: 20, fam: MONO });
    }
    const xx = W < 1200 ? box.x : box.x + cw + 60, yy = W < 1200 ? box.y + ch + 40 : box.y;
    const benches = D.benchmarks.filter((b) => m.s[b.id] != null).map((b) => ({ b, v: m.s[b.id], rk: Z.rankOf(b, m), of: b.ranking.length }))
      .sort((a, b) => a.rk - b.rk).slice(0, W < 1200 ? 6 : 8);
    const rh = Math.min(64, ((W < 1200 ? box.y + box.h - yy : box.h) - 40) / Math.max(1, benches.length));
    text("Ses résultats", xx, yy + 10, { w: 600, size: 24 });
    text("rang", W - 60, yy + 10, { w: 600, size: 19, color: C.ink3, align: "right" });
    benches.forEach((d, i) => {
      const y = yy + 50 + i * rh + rh / 2;
      text(d.b.name, xx, y, { size: Math.min(24, rh * 0.42), color: C.ink2, max: W - 60 - xx - 330 });
      text(fmt(d.v, "bench:" + d.b.id), W - 200, y, { size: Math.min(24, rh * 0.42), fam: MONO, align: "right", color: d.rk === 1 ? C.series[1] : C.ink });
      text(`#${d.rk} / ${d.of}`, W - 60, y, { size: Math.min(22, rh * 0.4), fam: MONO, align: "right", color: d.rk === 1 ? C.series[1] : C.ink3 });
    });
    return benches.map((d) => ({ benchmark: d.b.name, score: fmt(d.v, "bench:" + d.b.id), rang: `${d.rk}/${d.of}` }));
  }

  const DRAW = { bars: drawBars, evolution: drawEvolution, scatter: drawScatter, labs: drawLabs, compare: drawCompare, card: drawCard };
  let lastData = [];
  function render() {
    canvas.dataset.ready = "0";
    C = PAL[P.theme === "light" ? "light" : "dark"];
    const [fw, fh] = FORMATS[P.format] || FORMATS.x;
    W = fw; H = fh; k = 2;   // dessin en double résolution, image finale nette
    canvas.width = W * k; canvas.height = H * k;
    ctx = canvas.getContext("2d");
    const rows = ranked();
    try {
      if (!rows.length) throw new Error("Aucun modèle ne correspond aux filtres.");
      lastData = (DRAW[P.type] || drawBars)(rows);
      $("#studioErr").hidden = true;
    } catch (e) {
      $("#studioErr").hidden = false;
      $("#studioErr").textContent = "Impossible de dessiner ce graphique : " + e.message;
      lastData = [];
    }
    const cols = lastData.length ? Object.keys(lastData[0]) : [];
    $("#studioData").innerHTML = cols.length ? `<table class="cd-table"><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead>
      <tbody>${lastData.map((d) => `<tr>${cols.map((c) => `<td>${esc(d[c])}</td>`).join("")}</tr>`).join("")}</tbody></table>` : "";
    canvas.dataset.ready = "1";
  }

  // ---------------------------------------------------------------- formulaire
  const form = $("#studioForm");
  const opt = (v, l, cur) => `<option value="${esc(v)}"${String(cur) === String(v) ? " selected" : ""}>${esc(l)}</option>`;
  const metricOptions = [["points", "Points ERAZ"], ["coverage", "Couverture"], ["wins", "Benchmarks gagnés"], ["priceIn", "Prix entrée"], ["priceOut", "Prix sortie"], ["aaii", "AA Intelligence Index"],
    ...CATS.map((c) => [`cat:${c}`, `Catégorie : ${D.categories[c].label}`]), ...D.benchmarks.map((b) => [`bench:${b.id}`, `Benchmark : ${b.name}`])];
  const orgs = [...new Set(D.models.map((m) => m.org))].sort();
  function buildForm() {
    const models = D.models.slice().sort((a, b) => a.name.localeCompare(b.name));
    const multi = (name, cur) => `<select name="${name}" multiple size="6">${models.map((m) => opt(m.id, `${m.name} (${m.org})`, list(cur).includes(m.id) ? m.id : "")).join("")}</select>`;
    form.innerHTML = `
      <label>Type de graphique<select name="type">${Object.entries(TYPES).map(([v, l]) => opt(v, l, P.type)).join("")}</select></label>
      <label>Mesure (barres)<select name="metric">${metricOptions.map(([v, l]) => opt(v, l, P.metric)).join("")}</select></label>
      <label>Nombre de modèles<input name="top" type="number" min="1" max="30" value="${esc(P.top)}"></label>
      <label>Ordre<select name="sort">${opt("desc", "Du plus haut au plus bas", P.sort)}${opt("asc", "Du plus bas au plus haut", P.sort)}</select></label>
      <label>Pondération<select name="preset">${Object.keys(Z.PRESETS).map((p) => opt(p, { balanced: "Équilibrée", reasoning: "Raisonnement", math: "Maths", code: "Code", agents: "Agents" }[p] || p, P.preset)).join("")}</select></label>
      <label>Labo (filtre)<select name="org">${opt("", "Tous", P.org)}${orgs.map((o) => opt(o, o, P.org)).join("")}</select></label>
      <label>Open weights<select name="open">${opt("", "Tous", P.open)}${opt("1", "Seulement les open weights", P.open)}${opt("0", "Seulement les fermés", P.open)}</select></label>
      <label>Prix (nuage)<select name="x">${opt("priceOut", "Prix en sortie", P.x)}${opt("priceIn", "Prix en entrée", P.x)}</select></label>
      <label class="wide">Modèles choisis (comparaison, fiche, évolution ; Ctrl+clic)${multi("models", P.models)}</label>
      <label class="wide">Modèles mis en avant (en orange ; Ctrl+clic)${multi("highlight", P.highlight)}</label>
      <label>Depuis le (évolution)<input name="from" type="date" value="${esc(P.from)}"></label>
      <label>Jusqu'au (évolution)<input name="to" type="date" value="${esc(P.to)}"></label>
      <label class="wide">Titre (vide = automatique)<input name="title" value="${esc(P.title)}" maxlength="80"></label>
      <label class="wide">Sous-titre (vide = automatique)<input name="subtitle" value="${esc(P.subtitle)}" maxlength="120"></label>
      <label class="wide">Source en bas (vide = automatique)<input name="source" value="${esc(P.source)}" maxlength="140"></label>
      <label>Format<select name="format">${Object.entries(FORMATS).map(([v, f]) => opt(v, `${f[2]} (${f[0]}×${f[1]})`, P.format)).join("")}</select></label>
      <label>Thème<select name="theme">${opt("dark", "Sombre", P.theme)}${opt("light", "Clair", P.theme)}</select></label>`;
  }
  const query = () => {
    const q = new URLSearchParams();
    for (const [key, v] of Object.entries(P)) if (v !== "" && v !== DEFAULTS[key]) q.set(key, v);
    return q.toString();
  };
  const sync = () => { history.replaceState(null, "", location.pathname + (query() ? "?" + query() : "")); $("#studioLink").value = location.href; };
  form.addEventListener("input", (e) => {
    const el = e.target;
    if (!el.name) return;
    P[el.name] = el.multiple ? [...el.selectedOptions].map((o) => o.value).join(",") : el.value;
    sync(); render();
  });
  $("#studioDownload").addEventListener("click", () => {
    const a = document.createElement("a");
    a.download = `eraz-${P.type}-${D.updated}.png`;
    a.href = canvas.toDataURL("image/png");
    a.click();
  });
  $("#studioCopy").addEventListener("click", () => { navigator.clipboard?.writeText(location.href); $("#studioCopy").textContent = "Lien copié"; setTimeout(() => ($("#studioCopy").textContent = "Copier le lien"), 1500); });
  $("#studioReset").addEventListener("click", () => { P = { ...DEFAULTS }; buildForm(); sync(); render(); });

  // aide pour un agent : tous les identifiants utilisables dans l'adresse
  $("#studioIds").innerHTML = `
    <p><b>Modèles</b> : ${D.models.map((m) => `<code>${esc(m.id)}</code>`).join(" ")}</p>
    <p><b>Catégories</b> (metric=cat:…) : ${CATS.map((c) => `<code>${c}</code> ${esc(D.categories[c].label)}`).join(" · ")}</p>
    <p><b>Benchmarks</b> (metric=bench:…) : ${D.benchmarks.map((b) => `<code>${b.id}</code> ${esc(b.name)}`).join(" · ")}</p>
    <p><b>Labos</b> (org=…) : ${orgs.map((o) => `<code>${esc(o)}</code>`).join(" ")}</p>`;

  buildForm(); sync();
  // pour un agent : régler, dessiner et récupérer l'image sans passer par le formulaire
  window.ERAZStudio = {
    render(params = {}) { P = { ...DEFAULTS, ...params }; buildForm(); sync(); render(); return lastData; },
    dataURL: () => canvas.toDataURL("image/png"),
    data: () => lastData,
    params: () => ({ ...P }),
  };
  (document.fonts?.ready || Promise.resolve()).then(render);
});
