// set-demo — publikus API.
//
//   import { runDemo } from "set-demo"
//   await runDemo({ config, scenarioPath })
//
// A projekt-specifikus rész (belépés, base URL, kimenet, környezet-előkészítés) a
// `config`-ból jön — lásd `set-demo.config.example.mjs`.

import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import { capture } from "./capture.mjs"
import { renderVideo, renderGif } from "./render.mjs"
import { buildPage } from "./page.mjs"

const require = createRequire(import.meta.url)
const yaml = require("js-yaml")

/**
 * @param {object} o
 * @param {object} o.config        a projekt konfigurációja (baseUrl, outDir, login, prepare…)
 * @param {string} o.scenarioPath  a forgatókönyv-YAML útvonala
 * @param {object} [o.chromium]    a Playwright chromium (a hívó adja — peer dependency)
 * @returns {Promise<{ok:boolean, eredmenyek:Array, mp4:string, gif:string, lap:string}>}
 */
export async function runDemo({ config, scenarioPath, chromium }) {
  if (!chromium) {
    // A Playwright a HÍVÓ projekté (peer dependency): így ugyanaz a verzió és ugyanazok a
    // böngésző-binárisok futnak, mint a projekt tesztjeinél.
    //
    // ⚠ A fallback-import a CSOMAG node_modules-ából old fel, ahol tipikusan nincsenek
    // letöltve a binárisok — a futás ilyenkor rejtélyes „Executable doesn't exist"-tel áll
    // meg, jóval a hiba oka után. Ezért mondjuk ki, mi a helyes hívás.
    try {
      const pw = await import("@playwright/test")
      chromium = (pw.default ?? pw).chromium
    } catch {
      throw new Error(
        "Nincs Playwright. Add át a hívó projektéből:\n" +
          "  import playwright from \"@playwright/test\"\n" +
          "  await runDemo({ config, scenarioPath, chromium: playwright.chromium })"
      )
    }
  }

  const fk = yaml.load(fs.readFileSync(scenarioPath, "utf-8"))
  const nev = path.basename(scenarioPath).replace(/\.ya?ml$/, "")
  const out = path.join(config.outDir, nev)
  fs.mkdirSync(out, { recursive: true })

  console.log(`Forgatókönyv: ${fk.cim}`)
  console.log(`Cél: ${config.baseUrl}\n`)

  const { eredmenyek, leletek, munkaDir, tracesDir, nezet, mobil } = await capture({ fk, config, chromium })

  const mp4 = path.join(out, `${nev}.mp4`)
  await renderVideo({ tracesDir, mp4Path: mp4, nezet, mobil, tempo: fk.tempo, maxOldal: fk.maxOldal })

  const gif = path.join(out, `${nev}.gif`)
  renderGif({ mp4Path: mp4, gifPath: gif, munkaDir, nezet, vago: fk.vago, gif: fk.gif })

  const lap = path.join(out, `${nev}.html`)
  fs.writeFileSync(lap, buildPage({ fk, eredmenyek, mp4Path: mp4, gifPath: gif, kornyezet: config.kornyezet }))

  fs.rmSync(munkaDir, { recursive: true, force: true })

  const kb = (f) => `${Math.round(fs.statSync(f).size / 1024)} kB`
  console.log(`\n  GIF  ${kb(gif)}  ${gif}`)
  console.log(`  MP4  ${kb(mp4)}  ${mp4}`)
  console.log(`  lap  ${kb(lap)}  ${lap}`)

  /**
   * LELETEK — amit a felvétel megtudott, és amit máshol NEM lehet megtudni.
   *
   * A demó az egyetlen eszköz, ami a valós felületen, INTERAKCIÓ KÖZBEN jár. A statikus
   * felület-térkép (atlas) a saját fejlécében mondja ki, hogy amit interakció hoz elő
   * (részlet-panelek, akció-sávok, keresési találatok, menük), az nincs benne. A felvétel
   * viszont ÉPP ott jár — tehát a leletei annak a térképnek a vakfoltját mérik.
   *
   * Két dolgot teszünk le, mindkettőt gépi alakban:
   *   • `ujHorgonyok` — ami CSAK interakció után jelent meg (a statikus térkép hiánya);
   *   • `bukott` — a lépés, ami nem ment: vagy a horgony nem létezik, vagy létezik, de nem
   *     AKKOR látszik. A kettőt a statikus lista nem tudja megkülönböztetni, a felvétel igen.
   *
   * ⚠ Ez ADAT, nem ítélet. Hogy a hiány a térképé, a specé vagy a felületé, azt ember dönti el.
   */
  const eddigLatott = new Set()
  const leletFajl = {
    forgatokonyv: nev,
    cim: fk.cim,
    kornyezet: config.kornyezet,
    lepesek: (leletek ?? []).map((l) => {
      const uj = (l.horgonyok ?? []).filter((h) => !eddigLatott.has(h))
      for (const h of l.horgonyok ?? []) eddigLatott.add(h)
      return { cimke: l.cimke, allapot: l.allapot, ujHorgonyok: uj }
    }),
    osszesHorgony: [...eddigLatott].sort(),
  }
  fs.writeFileSync(path.join(out, "leletek.json"), JSON.stringify(leletFajl, null, 2))

  const bukott = eredmenyek.filter((e) => e.allapot === "bukott")
  if (bukott.length) {
    console.error(`\n${bukott.length} lépés elvárása NEM teljesült — a demó nem küldhető ki így.`)
  } else {
    console.log(`\n${eredmenyek.length} lépés, minden elvárás teljesült.`)
  }

  return { ok: bukott.length === 0, eredmenyek, mp4, gif, lap }
}

export { capture } from "./capture.mjs"
export { renderVideo, renderGif, videoMeret } from "./render.mjs"
export { buildPage } from "./page.mjs"
export { overlayScript, escapeHtml } from "./overlay.mjs"
