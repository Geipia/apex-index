// Formule des points ERAZ, partagée par le site (navigateur) et le générateur de pages (scripts/build.mjs).
// Une seule implémentation : les fiches modèles et le classement affichent toujours les mêmes chiffres.
(function (root) {
  const PRESETS = {
    balanced:  { reasoning: 1, math: 1, code: 1, agents: 1, knowledge: 0.75, context: 0.5, vision: 0.5 },
    reasoning: { reasoning: 3, math: 1.5, code: 0.5, agents: 0.5, knowledge: 1, context: 0.5, vision: 0.5 },
    math:      { reasoning: 1, math: 3, code: 0.5, agents: 0.25, knowledge: 0.5, context: 0.25, vision: 0.25 },
    code:      { reasoning: 0.75, math: 0.5, code: 3, agents: 1.5, knowledge: 0.25, context: 0.75, vision: 0.25 },
    agents:    { reasoning: 0.75, math: 0.25, code: 1.5, agents: 3, knowledge: 0.5, context: 1, vision: 0.75 },
  };

  // Fusionne les scores récupérés (scores.js) dans la configuration (data.js), puis calcule
  // le meilleur score et le classement de chaque benchmark sur l'ensemble des modèles suivis.
  function prepare(D, S) {
    if (S && !D._merged) {
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
      D._merged = true;
    }
    for (const b of D.benchmarks) {
      const vals = D.models.map((m) => m.s[b.id]).filter((v) => v != null);
      b.best = Math.max(...vals);
      b.ranking = D.models.filter((m) => m.s[b.id] != null).sort((x, y) => y.s[b.id] - x.s[b.id]);
    }
    return D;
  }

  const norm = (b, v, best = b.best) => Math.max(0, Math.min(1, (v - b.floor) / (best - b.floor))) * 100;
  const rankOf = (b, m) => b.ranking.findIndex((x) => x.id === m.id) + 1;

  // s = scores bruts d'un modèle ; best = meilleur score par benchmark parmi les modèles comparés.
  function scoreScores(D, s, weights, best) {
    const cats = {};
    let num = 0, den = 0, cov = 0, totalW = 0;
    for (const c of Object.keys(D.categories)) {
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

  function rank(D, weights) {
    return D.models
      .map((m) => ({ m, ...scoreScores(D, m.s, weights), wins: D.benchmarks.filter((b) => b.ranking[0] && b.ranking[0].id === m.id).length }))
      .sort((a, b) => b.points - a.points)
      .map((r, i) => ({ ...r, rank: i + 1 }));
  }

  // Points de chaque modèle pour chaque jour de l'historique (le « meilleur » est celui du jour concerné).
  function historyPoints(D, history, weights) {
    return (history || []).map((snap) => {
      const best = {};
      for (const b of D.benchmarks) {
        const vals = Object.values(snap.models).map((s) => s[b.id]).filter((v) => v != null);
        if (vals.length) best[b.id] = Math.max(...vals);
      }
      const points = {};
      for (const [id, s] of Object.entries(snap.models)) points[id] = scoreScores(D, s, weights, best).points;
      return { date: snap.date, points };
    });
  }

  root.ERAZScore = { PRESETS, prepare, norm, rankOf, scoreScores, rank, historyPoints };
})(typeof window !== "undefined" ? window : globalThis);
