// Mesure d'audience avec GoatCounter : sans cookie et sans donnée personnelle.
// Renseignez ici le code de votre compte (https://VOTRE-CODE.goatcounter.com) ; vide = rien n'est compté.
window.ERAZ_ANALYTICS = { goatcounter: "" };

(() => {
  const code = window.ERAZ_ANALYTICS.goatcounter;
  if (!code || location.hostname === "localhost" || location.hostname === "127.0.0.1") return;
  if (document.documentElement.dataset.noCount !== undefined) return; // page admin : on ne se compte pas soi-même
  const s = document.createElement("script");
  s.async = true;
  s.src = "https://gc.zgo.at/count.js";
  s.dataset.goatcounter = `https://${code}.goatcounter.com/count`;
  document.head.appendChild(s);
})();
