// Kísérő lap: EGY önhordó HTML fájl, base64-be ágyazott mozgóképpel — hogy e-mail
// csatolmányként megnyitva azonnal működjön, külső hivatkozás nélkül.

import fs from "node:fs"
import { escapeHtml as esc } from "./overlay.mjs"

/**
 * ⚠ Alapból VIDEÓ, nem GIF. A GIF minden kockát teljes képként tárol, ezért a sima mozgás
 * (görgetés) megfizethetetlen benne: mérve ugyanarra a 7 lépéses demóra GIF 1,2 MB
 * *ugrálva* vs. MP4 1,3 MB *25 fps-en simán*. A GIF fájl attól még elkészül — levéltestbe
 * ágyazva az az egyetlen, ami magától elindul.
 */
export function buildPage({ fk, eredmenyek, mp4Path, gifPath, kornyezet = "teszt" }) {
  // A GIF opt-in (lásd index.mjs). Ha valaki `mozgokep: gif`-et kér, de a fájl nincs meg,
  // az PROGRAMHIBA — némán videóra váltani rosszabb: a levéltestbe szánt lap csendben
  // olyat kapna, ami ott nem játszik le.
  const mozgo = fk.lap?.mozgokep === "gif" ? "gif" : "video"
  if (mozgo === "gif" && !gifPath) {
    throw new Error("A lap GIF-et kér (lap.mozgokep: gif), de a GIF nem készült el — adj `gif:` blokkot a forgatókönyvhöz.")
  }
  const b64 = fs.readFileSync(mozgo === "gif" ? gifPath : mp4Path).toString("base64")
  const mozgoTag =
    mozgo === "gif"
      ? `<img src="data:image/gif;base64,${b64}" alt="${esc(fk.cim)}">`
      : `<video src="data:video/mp4;base64,${b64}" autoplay loop muted playsinline controls></video>`

  const sorok = eredmenyek
    .map((e) => {
      const jel = e.allapot === "ok" ? "✓" : e.allapot === "bukott" ? "✗" : "·"
      const magy = e.magyarazat ? `<div class="m">${esc(e.magyarazat)}</div>` : ""
      const hiba = e.hiba ? `<div class="h">${esc(e.hiba)}</div>` : ""
      return `<li class="${e.allapot}"><span class="j">${jel}</span><div><b>${esc(e.cimke)}</b>${magy}${hiba}</div></li>`
    })
    .join("\n")

  return `<!doctype html><html lang="hu"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(fk.cim)}</title><style>
:root{color-scheme:light dark}
body{font:15px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif;margin:0;padding:2rem 1rem;
  background:#fafafa;color:#18181b}
@media (prefers-color-scheme:dark){body{background:#18181b;color:#e4e4e7}
  .lap{background:#27272a!important;border-color:#3f3f46!important}}
.lap{max-width:980px;margin:0 auto;background:#fff;border:1px solid #e4e4e7;border-radius:12px;
  padding:1.75rem;box-shadow:0 1px 3px rgba(0,0,0,.06)}
h1{font-size:1.5rem;margin:0 0 .25rem}
.alcim{color:#71717a;margin:0 0 1.5rem;font-size:.9rem}
.bev{margin:0 0 1.5rem}
img,video{max-width:100%;width:100%;border:1px solid #e4e4e7;border-radius:8px;display:block;background:#000}
ol{list-style:none;padding:0;margin:1.5rem 0 0}
li{display:flex;gap:.75rem;padding:.6rem 0;border-top:1px solid #e4e4e7}
.j{font-weight:700;width:1.2rem;flex:none}
li.ok .j{color:#15803d} li.bukott .j{color:#b91c1c} li.nincs-elvaras .j{color:#a1a1aa}
.m{color:#71717a;font-size:.9rem} .h{color:#b91c1c;font-size:.85rem;font-family:ui-monospace,monospace}
footer{margin-top:1.5rem;padding-top:1rem;border-top:1px solid #e4e4e7;color:#71717a;font-size:.8rem}
</style></head><body><div class="lap">
<h1>${esc(fk.cim)}</h1>
<p class="alcim">${esc(fk.alcim || "Új funkció")}${fk.verzio ? ` — ${esc(fk.verzio)}` : ""}</p>
${fk.bevezeto ? `<p class="bev">${esc(fk.bevezeto)}</p>` : ""}
${mozgoTag}
<ol>${sorok}</ol>
<footer>A felvétel a ${esc(kornyezet)} rendszeren készült, valós felületen.
A ✓ azt jelenti, hogy a lépés elvárása a felvétel közben teljesült.</footer>
</div></body></html>`
}
