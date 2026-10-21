#!/usr/bin/env node
// Met à jour scores.js à partir des sources publiques :
//   - BenchLM (pages modèles au format Markdown) : scores par benchmark + lien vers la source originale
//   - Artificial Analysis (leaderboard) : Intelligence Index, coût par tâche, open weights
//
// Usage :
//   node scripts/update-data.mjs            met à jour scores.js
//   node scripts/update-data.mjs --dry-run  affiche les changements sans écrire
//
// La configuration (benchmarks, liste des modèles, valeurs saisies à la main) reste dans data.js.
// Une valeur trouvée dans les sources remplace la valeur manuelle ; une valeur absente ne supprime rien.

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DRY = process.argv.includes("--dry-run");
const UA = "APEX-Index-updater/1.0 (+https://github.com)";

// Libellés BenchLM acceptés pour chaque benchmark, par ordre de préférence.
// Les variantes auto-déclarées non indépendantes (ex. « Terminal-Bench 2.1 » sans Vals) sont volontairement exclues.
const BENCHLM_LABELS = {
  hle: ["AA-HLE"],
  arc2: ["ARC-AGI-2"],
  arc3: ["ARC-AGI-3"],
  fm13: ["FrontierMath v2 (Tiers 1-3)"],
  fm4: ["FrontierMath v2 (Tier 4)"],
  swepro: ["SWE-bench Pro"],
  fswe: ["FrontierSWE v2"],
  tb21: ["Terminal-Bench 2.1 (Vals)"],
  osw: ["OSWorld 2.0"],
  gdpval: [{ label: "GDPval-AA", slug: "gdpvalaa" }],
  gpqa: ["AA-GPQA Diamond", "GPQA-D"],
  omni: ["AA-Omniscience Index"],
  lcr: ["AA-LCR"],
  mmmu: ["AA-MMMU-Pro"],
};

// Champs du leaderboard Artificial Analysis utilisés quand BenchLM n'a pas le score.
// scale = facteur pour passer en pourcentage (AA stocke des fractions 0-1).
const AA_FALLBACK = {
  hle: { field: "hle", scale: 100 },
  gpqa: { field: "gpqa", scale: 100 },
  lcr: { field: "lcr", scale: 100 },
  mmmu: { field: "mmmuPro", scale: 100 },
  omni: { field: "omniscience", scale: 1 },
};
const AA_URL = "https://artificialanalysis.ai/leaderboards/models";

async function loadConfig() {
  const code = await readFile(path.join(ROOT, "data.js"), "utf8");
  const ctx = { window: {} };
  vm.runInNewContext(code, ctx);
  return ctx.window.APEX_DATA;
}

async function get(url) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      if (attempt === 3) throw new Error(`${url} : ${err.message}`);
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
}

// ---------- BenchLM ----------
// Lignes de tableau : | [Libellé](/benchmarks/slug) | 91.5% | [Source](https://…) |
function parseBenchLM(md) {
  const rows = [];
  const re = /^\|\s*\[([^\]]+)\]\(\/benchmarks\/([^)]+)\)\s*\|\s*([^|]+?)\s*\|\s*(.*?)\s*\|\s*$/gm;
  let m;
  while ((m = re.exec(md))) {
    const value = parseFloat(m[3].replace(",", "."));
    if (Number.isNaN(value)) continue;
    const src = /\]\((https?:[^)]+)\)/.exec(m[4]);
    rows.push({ label: m[1].trim(), slug: m[2], value, source: src ? src[1] : null });
  }
  const updated = /Last updated:\s*(.+)/.exec(md)?.[1]?.trim() ?? null;
  return { rows, updated };
}

function pickScores(rows) {
  const scores = {}, refs = {};
  for (const [id, wanted] of Object.entries(BENCHLM_LABELS)) {
    for (const w of wanted) {
      const { label, slug } = typeof w === "string" ? { label: w } : w;
      const row = rows.find((r) => r.label === label && (!slug || r.slug === slug));
      if (row) {
        scores[id] = Math.round(row.value * 10) / 10;
        if (row.source) refs[id] = row.source;
        break;
      }
    }
  }
  return { scores, refs };
}

// ---------- Artificial Analysis ----------
// La page embarque les modèles en JSON (payload React échappé) : {"slug":…,"shortName":…,"intelligenceIndex":…}
function parseAA(html) {
  const text = html.replace(/\\"/g, '"');
  const out = [];
  const re = /\{"slug":"/g;
  let m;
  while ((m = re.exec(text))) {
    let depth = 0, i = m.index;
    for (; i < text.length; i++) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}" && --depth === 0) break;
    }
    try {
      const o = JSON.parse(text.slice(m.index, i + 1));
      if (o.shortName && "intelligenceIndex" in o) out.push(o);
    } catch { /* objet tronqué ou non-JSON : ignoré */ }
  }
  const seen = new Set();
  return out.filter((o) => !seen.has(o.shortName) && seen.add(o.shortName));
}

function matchAA(records, aaName) {
  const variants = records.filter((r) =>
    (r.shortName === aaName || r.shortName.startsWith(aaName + " (")) &&
    r.intelligenceIndex != null && !r.intelligenceIndexIsEstimated);
  if (!variants.length) return null;
  // Meilleure configuration publiée (même règle que pour les benchmarks).
  return variants.reduce((a, b) => (b.intelligenceIndex > a.intelligenceIndex ? b : a));
}

// ---------- Main ----------
async function main() {
  const cfg = await loadConfig();
  let previous = {};
  try {
    const ctx = { window: {} };
    vm.runInNewContext(await readFile(path.join(ROOT, "scores.js"), "utf8"), ctx);
    previous = ctx.window.APEX_SCORES?.models ?? {};
  } catch { /* premier lancement */ }

  console.log("→ Artificial Analysis…");
  const aaHtml = await get(AA_URL);
  const aa = aaHtml ? parseAA(aaHtml) : [];
  console.log(`  ${aa.length} configurations de modèles lues`);

  const models = {};
  const changes = [];
  const failures = [];

  for (const m of cfg.models) {
    const slug = m.benchlm === undefined ? m.id : m.benchlm;
    process.stdout.write(`→ ${m.name.padEnd(22)} `);
    const entry = { s: {}, refs: {} };
    if (slug) {
      try {
        const md = await get(`https://benchlm.ai/md/models/${slug}.md`);
        if (!md) throw new Error("page BenchLM introuvable");
        const { rows, updated } = parseBenchLM(md);
        const { scores, refs } = pickScores(rows);
        Object.assign(entry, { s: scores, refs, benchlmUpdated: updated });
      } catch (err) {
        failures.push(`${m.name} : ${err.message}`);
      }
    }
    const rec = matchAA(aa, m.aa ?? m.name);
    if (rec) {
      for (const [id, { field, scale }] of Object.entries(AA_FALLBACK)) {
        if (entry.s[id] != null || m.s[id] != null || rec[field] == null) continue;
        entry.s[id] = Math.round(rec[field] * scale * 10) / 10;
        entry.refs[id] = AA_URL;
      }
      entry.aaii = Math.round(rec.intelligenceIndex * 10) / 10;
      if (rec.intelligenceIndexCostPerTask != null) entry.cost = Math.round(rec.intelligenceIndexCostPerTask * 100) / 100;
      if (typeof rec.isOpenWeights === "boolean") entry.open = rec.isOpenWeights;
      entry.aaConfig = rec.shortName;
    }
    console.log(`${Object.keys(entry.s).length} scores${rec ? ` · AA ${entry.aaii}` : ""}`);

    const before = previous[m.id]?.s ?? {};
    for (const [k, v] of Object.entries(entry.s)) {
      const old = before[k] ?? m.s[k];
      if (old !== v) changes.push(`${m.name} · ${k} : ${old ?? "—"} → ${v}`);
    }
    models[m.id] = entry;
    await new Promise((r) => setTimeout(r, 300)); // politesse envers le serveur
  }

  // Modèles bien classés chez AA mais pas encore suivis ici.
  const tracked = cfg.models.map((m) => m.aa ?? m.name);
  const seenBase = new Set();
  const suggestions = aa
    .filter((r) => r.intelligenceIndex != null && !r.intelligenceIndexIsEstimated)
    .filter((r) => !tracked.some((t) => r.shortName === t || r.shortName.startsWith(t + " (")))
    .sort((a, b) => b.intelligenceIndex - a.intelligenceIndex)
    .filter((r) => { const base = r.shortName.replace(/\s*\(.*\)$/, ""); return !seenBase.has(base) && seenBase.add(base); })
    .slice(0, 8);

  console.log(`\n${changes.length} score(s) modifié(s)`);
  for (const c of changes) console.log("  " + c);
  if (failures.length) {
    console.log(`\n${failures.length} échec(s) :`);
    for (const f of failures) console.log("  " + f);
  }
  if (suggestions.length) {
    console.log("\nModèles non suivis les mieux classés chez Artificial Analysis (à ajouter dans data.js si pertinent) :");
    for (const s of suggestions) console.log(`  ${s.shortName.padEnd(40)} index ${s.intelligenceIndex.toFixed(1)} · ${s.modelCreatorName}`);
  }

  if (failures.length === cfg.models.length) {
    console.error("\nAucune source joignable, scores.js n'est pas modifié.");
    process.exit(1);
  }
  if (DRY) { console.log("\n--dry-run : rien n'a été écrit."); return; }

  const out = { updated: new Date().toISOString().slice(0, 10), models };
  const js = `// Fichier généré par scripts/update-data.mjs — ne pas modifier à la main.\nwindow.APEX_SCORES = ${JSON.stringify(out, null, 2)};\n`;
  await writeFile(path.join(ROOT, "scores.js"), js);
  console.log(`\nscores.js écrit (${out.updated}).`);
}

main().catch((err) => { console.error(err); process.exit(1); });
