#!/usr/bin/env node
// Signale à IndexNow (Bing, Yandex, Seznam… ; DuckDuckGo, Qwant, Ecosia et Yahoo via Bing) les pages du site,
// pour qu'elles soient relues le jour même. Lit urls.txt, produit par scripts/build.mjs.
// La clé est publiée à la racine du site (fichier <clé>.txt) : c'est ce qui prouve que le site nous appartient.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const KEY = "762847d125e748555c10548f139f9522";
const HOST = "eraz.ovh";

const urlList = (await readFile(path.join(ROOT, "urls.txt"), "utf8")).split("\n").filter(Boolean);
const res = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `https://${HOST}/${KEY}.txt`, urlList }),
});
// 200 = reçu, 202 = reçu (clé en cours de vérification) ; le reste est une erreur.
console.log(`IndexNow : ${urlList.length} URL envoyées, réponse ${res.status}`);
if (res.status >= 400) process.exit(1);
